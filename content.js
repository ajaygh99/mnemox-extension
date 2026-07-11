// Mnemox - Content Script

function safeChrome(fn) {
  try { fn(); } catch (e) { /* extension context gone after reload */ }
}

safeChrome(function () {
  chrome.runtime.sendMessage({ type: 'FLAG_TEST' }, function (response) {
    if (chrome.runtime.lastError) return;
    if (response && response.ok) {
      console.log('[Mnemox] loaded on', window.location.hostname);
      console.log('[Mnemox] flags:', JSON.stringify(response.flags));
    }
  });
});

// Answers the popup's per-tab state request (see the GET_LIVE_STATE fix
// comment further down, next to lastLiveResult/lastLiveTrustResult). This
// listener is registered in THIS tab's content-script context, so a
// chrome.tabs.sendMessage(tabId, ...) targeted at this specific tab reaches
// only this listener — never another tab's content script — which is what
// makes the per-tab isolation work.
safeChrome(function () {
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.type === 'GET_LIVE_STATE') {
      sendResponse({
        ok:          true,
        result:      lastLiveResult,
        trustResult: lastLiveTrustResult,
        url:         window.location.hostname,
        wired:       wired,
      });
      return true;
    }
  });
});

function debounce(fn, ms) {
  var timer;
  return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

function injectScript(file) {
  try {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    // Bug fixed 2026-07-05: without async=false, dynamically-inserted
    // <script> tags execute in whatever order they finish downloading, NOT
    // the order injectScript() was called in. If ui/pageWorld.js executed
    // before scoring/rules.js finished loading, scorePrompt was still
    // undefined when a MNEMOX_SCORE message arrived — pageWorld.js's guard
    // (`typeof scorePrompt !== 'function'`) silently returned with no error,
    // no log, and no score, on ANY platform, unpredictably. async=false
    // forces browsers to execute these in strict insertion order, same as
    // normal parser-inserted scripts.
    s.async = false;
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) { /* context gone */ }
}

injectScript('scoring/rules.js');
injectScript('scoring/tokenizer.js');
injectScript('scoring/suggester.js');
injectScript('scoring/trust.js');
injectScript('ui/coach.js');
injectScript('ui/badge.js');
injectScript('ui/pageWorld.js');
injectScript('adapters/chatgpt.js');
injectScript('adapters/claude.js');
injectScript('adapters/gemini.js');
injectScript('adapters/copilot.js');
injectScript('adapters/perplexity.js');
injectScript('adapters/grok.js');
injectScript('adapters/registry.js');
injectScript('response-reader.js');

var wired = false;
var promptObserver = null; // track MutationObserver so we can disconnect on re-wire
var bootObserver = null; // watches for the input mounting late (see startBootObserver)
var wiredSelectorIndex = Infinity; // priority of the currently-wired selector (lower = better)
var wireStartTime = Date.now();

// Ordered by platform specificity — narrow selectors first
var INPUT_SELECTORS = [
  // ChatGPT
  '#prompt-textarea',
  // Claude — ProseMirror editor (contenteditable with role=textbox or data-placeholder)
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"][role="textbox"]',
  '.ProseMirror[contenteditable="true"]',
  // Gemini — Quill editor, has neither aria-label nor role=textbox, so it fell
  // through to the risky last-resort catch-all below and could silently wire
  // to the wrong contenteditable element on the page. Matches adapters/gemini.js.
  '.ql-editor[contenteditable="true"]',
  '.ql-editor',
  // Generic contenteditable with aria-label (many platforms)
  'div[contenteditable="true"][aria-label]',
  // Generic textarea — can match decoy/hidden a11y-only inputs that exist in
  // the DOM before the platform's real editor has mounted. See wireObserver().
  'textarea',
  // Last-resort contenteditable — only matches the FIRST one, so keep at end
  '[contenteditable="true"]',
  'input[type="text"]',
];
// Only index 0 (#prompt-textarea, a globally-unique DOM id) is specific enough
// to trust immediately. Every other index — including the Claude/Gemini
// selectors, which are class-based and can theoretically match an unrelated
// element before the real editor mounts — gets bootObserver's 15s grace
// window to be superseded by something more specific. See wireObserver().
var CONFIDENT_SELECTOR_INDEX = 1;

function wireObserver() {
  var target = null;
  var matchedSelector = null;
  var matchedIndex = -1;
  for (var i = 0; i < INPUT_SELECTORS.length; i++) {
    var el = document.querySelector(INPUT_SELECTORS[i]);
    if (el) { target = el; matchedSelector = INPUT_SELECTORS[i]; matchedIndex = i; break; }
  }
  if (!target) {
    if (!wired) {
      // Perf: retry poll tightened 500ms -> 50ms (90% cut). Safe because
      // bootObserver (MutationObserver) is the real detection mechanism and
      // reacts synchronously to DOM changes; this timer is only a backup net
      // for the narrow race before bootObserver attaches, so a tight poll
      // just means we notice a few ms sooner with negligible extra cost
      // (one cheap querySelector loop).
      console.log('[Mnemox][debug] wireObserver: no INPUT_SELECTORS matched yet, retrying in 50ms');
      setTimeout(wireObserver, 50);
    }
    return;
  }

  // Bug fixed 2026-07-07: wireObserver used to return immediately once ANY
  // selector matched (`if (wired) return;` at the top). On ChatGPT/Gemini,
  // the real editor (#prompt-textarea / .ql-editor) can mount AFTER a risky
  // generic fallback ('textarea' / '[contenteditable="true"]') already
  // matched some unrelated decoy element present earlier in the DOM (e.g. a
  // hidden a11y textarea labeled "Chat with ChatGPT"). Once wired to that
  // decoy, it was PERMANENT — the user's real keystrokes went to an element
  // nobody was listening to, so prompt scoring silently never fired unless
  // an unrelated SPA navigation happened to reset `wired` and re-run this
  // with the real editor now present. Confirmed via console trace: "wired to
  // TEXTAREA Chat with ChatGPT" fired first, "wired to DIV prompt-textarea"
  // only fired later after an SPA nav reset — not because the fix worked,
  // but by accident.
  // Fix: keep re-checking (via bootObserver, still running below) for a
  // STRICTLY better (lower-index) selector than whatever we're currently
  // wired to, and rewire to it if the element is actually different. Once a
  // non-risky (platform-specific) selector is wired, or 15s have passed,
  // bootObserver stops re-checking to avoid running forever.
  if (wired) {
    if (matchedIndex < wiredSelectorIndex && target !== window.__mnemoxWiredTarget) {
      console.log('[Mnemox][debug] wireObserver: better selector now available (' + matchedSelector + '), rewiring away from previous match');
    } else {
      return;
    }
  }
  console.log('[Mnemox][debug] wireObserver: matched selector', matchedSelector);

  wired = true;
  wiredSelectorIndex = matchedIndex;
  window.__mnemoxWiredTarget = target;
  // Bug fixed 2026-07-05: on heavier SPAs (Gemini/Angular) the input can
  // mount later than our fixed 400ms/500ms retry timers. If a fast typist
  // started their FIRST prompt before wireObserver ever attached, those
  // keystrokes were captured by nothing — no listener existed yet, so there
  // was nothing for the Enter-key fix to hook into either. Once wired,
  // the fallback DOM watcher below is no longer needed.
  //
  // Bug fixed 2026-07-07: this used to unconditionally disconnect
  // bootObserver as soon as ANY selector matched. If that first match was a
  // decoy element caught by a generic fallback, bootObserver was gone and
  // nothing could ever upgrade to the real editor once it mounted. Now
  // bootObserver is only torn down once we've matched the single
  // highest-confidence selector (index < CONFIDENT_SELECTOR_INDEX) — or
  // after 15s, so it doesn't run forever if we really are stuck on a
  // fallback.
  if (matchedIndex < CONFIDENT_SELECTOR_INDEX || Date.now() - wireStartTime > 15000) {
    if (bootObserver) { bootObserver.disconnect(); bootObserver = null; }
  }
  console.log('[Mnemox] wired to', target.tagName,
    (target.id || target.getAttribute('aria-label') || target.getAttribute('data-placeholder') || ''));

  function getText() {
    return (target.value || target.innerText || target.textContent || '').trim();
  }

  // Save prompt text eagerly (every keystroke) — no debounce
  function saveText() {
    var text = getText();
    if (text.length > 1) {
      safeChrome(function () { chrome.storage.local.set({ lastPromptText: text }); });
    }
  }

  // Score prompt 120ms after typing stops (was 500ms — 76% cut).
  // Revised 2026-07-11: an earlier pass here cut this all the way to 50ms.
  // scorePrompt() itself really is cheap, but each fire also triggers
  // MnemoxBadge.update() -> MnemoxCoach.update() -> a full rebuild of the
  // 8-row rule-breakdown DOM in the (always-mounted, kept-in-sync-even-
  // when-hidden) coach panel, plus a fresh MnemoxSuggester.suggest() text
  // computation, plus the console.log calls below. At 500ms that pipeline
  // ran once per typing pause; at 50ms it fired on nearly every keystroke
  // pause during normal typing (confirmed via user report: visible lag
  // opening/closing the panel, heavy console volume with DevTools open).
  // 120ms is comfortably under the ~100-150ms human "feels instant"
  // threshold while cutting the render-pipeline's fire rate by ~4x versus
  // 50ms — still a large win over the original 500ms without the
  // main-thread churn.
  var debouncedScore = debounce(function () {
    var text = getText();
    if (text.length < 2) {
      console.log('[Mnemox][debug] debouncedScore: text too short/empty (' + text.length + ' chars), not posting MNEMOX_SCORE');
      return;
    }
    console.log('[Mnemox][debug] debouncedScore: posting MNEMOX_SCORE, length=' + text.length);
    window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
  }, 120);

  function onInput() { saveText(); debouncedScore(); }

  target.addEventListener('input',  onInput);
  target.addEventListener('keyup',  onInput);
  // keydown: score immediately on Enter instead of waiting for the debounce.
  // Bug fixed 2026-07-05: for short prompts sent quickly, the 500ms debounce
  // timer was still pending when the platform cleared the input on submit —
  // it then fired ~500ms later against an EMPTY box, silently no-opped
  // (text.length < 2 guard), and no score was ever posted for that prompt.
  // Scoring synchronously here, with text captured before any clearing can
  // happen, guarantees a score for fast/short sends too.
  target.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      var text = getText();
      if (text.length > 1) {
        console.log('[Mnemox][debug] Enter keydown: posting MNEMOX_SCORE, length=' + text.length);
        safeChrome(function () { chrome.storage.local.set({ lastPromptText: text }); });
        window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
      }
    }
  });

  // Disconnect previous MutationObserver if re-wiring after SPA nav
  if (promptObserver) { promptObserver.disconnect(); promptObserver = null; }

  // Watch contenteditable mutations (paste, programmatic inserts)
  // Use characterData only to avoid re-firing on response DOM changes
  if (target.getAttribute('contenteditable')) {
    promptObserver = new MutationObserver(function (mutations) {
      var hasTextChange = mutations.some(function (m) {
        return m.type === 'characterData' ||
               (m.type === 'childList' && m.addedNodes.length > 0);
      });
      if (hasTextChange) onInput();
    });
    promptObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }
}

// ── Trust score deduplication ───────────────────────────────────────────────
// Content.js gets many MNEMOX_RESPONSE events during streaming.
// Only forward the LAST one (2s after stream settles) to the trust scorer.
var trustDebounceTimer = null;
var lastTrustPayload = null;

// Bug fixed 2026-07-11: chrome.storage.local's lastResult/lastTrustResult/
// lastUrl keys are GLOBAL — shared across every tab. With multiple AI-tool
// tabs open at once (Claude, ChatGPT, Gemini...), scoring a prompt in ANY
// one of them overwrote these keys for ALL of them. The toolbar popup read
// only from storage, so it showed whichever tab had most recently scored —
// not necessarily the tab actually being viewed. Reported by a user working
// across Claude/ChatGPT/Gemini as "delays and loading issues" on the popup.
// Fix: keep this tab's OWN latest result in a local closure variable (never
// shared with other tabs) and answer a GET_LIVE_STATE request for it below,
// so the popup can ask "what does THIS tab currently show" directly instead
// of trusting global storage. The storage writes above/below are kept as-is
// for backward compatibility (traces logging, session count, popup fallback
// when a tab has no content script to answer this message).
var lastLiveResult = null;
var lastLiveTrustResult = null;

window.addEventListener('message', function (event) {
  if (event.source !== window || !event.data) return;

  if (event.data.type === 'MNEMOX_RESULT') {
    console.log('[Mnemox][debug] content.js received MNEMOX_RESULT, score=' + (event.data.result && event.data.result.score) + ', saving to storage');
    lastLiveResult = event.data.result;
    safeChrome(function () {
      chrome.storage.local.get(['sessionCount'], function (data) {
        chrome.storage.local.set({
          lastResult:   event.data.result,
          lastUrl:      window.location.hostname,
          sessionCount: (data.sessionCount || 0) + 1,
        });
      });
    });
  }

  // Debounce MNEMOX_RESPONSE so streaming produces exactly ONE trust score
  //
  // Perf audit 2026-07-11: deliberately NOT cut alongside the other timers
  // in this file. response-reader.js already decides when a response is
  // "done" per-platform (positively checking the platform's own streaming
  // signal — data-is-streaming / a stop-generating button — where available,
  // not just DOM silence). This timer is a second, coarser guard on top: it
  // coalesces multiple genuine MNEMOX_RESPONSE events for the SAME exchange
  // (e.g. a response that pauses for a tool call, then resumes) into one
  // trust score. Cutting this to near-zero would defeat that coalescing and
  // risk scoring a mid-pause, not-actually-finished response as final.
  if (event.data.type === 'MNEMOX_RESPONSE') {
    lastTrustPayload = event.data.payload;
    clearTimeout(trustDebounceTimer);
    trustDebounceTimer = setTimeout(function () {
      window.postMessage({ type: 'MNEMOX_TRUST_SCORE', payload: lastTrustPayload }, '*');
    }, 1500); // fire 1.5s after last response chunk — streaming should be done
  }

  if (event.data.type === 'MNEMOX_TRUST_RESULT') {
    var tr = event.data.result;
    lastLiveTrustResult = tr;
    safeChrome(function () {
      chrome.storage.local.get(['lastPromptText'], function (data) {
        chrome.storage.local.set({ lastTrustResult: tr, lastResponseUrl: window.location.hostname });
        // Pass promptText directly so background.js doesn't race against async storage reads
        chrome.runtime.sendMessage({
          type:       'RESPONSE_SCORED',
          result:     tr,
          promptText: data.lastPromptText || null,
        });
      });
    });

    // Optional memory-consistency check (Step 5) — background.js no-ops
    // immediately unless the user has turned on MEMORY_CONSISTENCY, so this
    // is cheap to fire on every response. Result only feeds the coach
    // panel's "Memory Alignment" section, never the local trustScore.
    safeChrome(function () {
      chrome.runtime.sendMessage({ type: 'MEMORY_CHECK', text: tr.text || null }, function (mc) {
        if (chrome.runtime.lastError || !mc || !mc.ok || !mc.enabled) return;
        window.postMessage({ type: 'MNEMOX_MEMORY_ALIGNMENT', result: mc }, '*');
      });
    });
  }

  if (event.data.type === 'MNEMOX_HEALTHCHECK_RESULT') {
    safeChrome(function () {
      chrome.runtime.sendMessage({ type: 'HEALTH_REPORT', result: event.data.result });
    });
  }
});

// Boot: try immediately (in case the input already exists), on a short
// delay, AND watch the DOM directly as a fallback — fixed timers alone can
// lose the race against slow-mounting SPA inputs (see wireObserver comment).
// Perf: 400ms -> 40ms (90% cut) — bootObserver (below) is the real
// detection path; this is only a redundant early-race safety net.
wireObserver();
setTimeout(wireObserver, 40);
bootObserver = new MutationObserver(function () {
  // Bug fixed 2026-07-07: this used to stop calling wireObserver() (and
  // disconnect itself) the instant `wired` became true, no matter which
  // selector matched. That's what let a decoy element wired via a risky
  // fallback selector stand forever — bootObserver gave up watching before
  // the real editor even had a chance to mount. wireObserver() now owns the
  // decision of when it's safe to stop (see its RISKY_SELECTOR_INDEX / 15s
  // logic), so just keep calling it here; it no-ops once nothing better is
  // available or bootObserver has already been torn down.
  wireObserver();
});
// attributes:true added 2026-07-05 — childList alone only catches NEW nodes
// appearing. Some SPAs render the input div early but only add
// contenteditable="true" (or similar) to it slightly later, which is an
// attribute change on an EXISTING node, not a new one, and childList-only
// would miss it — leaving the very first prompt on a fresh tab unwired.
bootObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'role', 'aria-label', 'data-placeholder', 'class'] });

window.addEventListener('load', function () {
  if (!wired) wireObserver();
  // Perf: 800ms -> 50ms (94% cut). injectScript() forces async=false so all
  // page-world scripts (including pageWorld.js's MNEMOX_HEALTHCHECK
  // listener) finish executing in order well before 'load' fires — this
  // was a defensive pad, not a wait on any real event, so a small buffer
  // is enough.
  setTimeout(function () {
    window.postMessage({ type: 'MNEMOX_HEALTHCHECK' }, '*');
  }, 50);
});

// SPA navigation — reset wired, re-wire textarea, re-inject badge
(function () {
  var lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    wired = false;
    wiredSelectorIndex = Infinity;
    wireStartTime = Date.now();
    window.__mnemoxWiredTarget = null;
    // Re-create bootObserver if a previous wire (on the old page) already
    // tore it down — the new page's editor needs the same late-mount /
    // decoy-upgrade protection wireObserver() provides.
    if (!bootObserver) {
      bootObserver = new MutationObserver(function () { wireObserver(); });
      bootObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'role', 'aria-label', 'data-placeholder', 'class'] });
    }
    clearTimeout(trustDebounceTimer); // cancel any pending trust score
    // Perf: 600ms -> 60ms (90% cut). If the new SPA view hasn't finished
    // rendering yet at 60ms, wireObserver's own now-50ms retry loop (above)
    // and bootObserver both keep watching, so we recover within tens of ms
    // regardless — this initial delay no longer needs a large safety margin.
    setTimeout(function () {
      wireObserver();
      injectScript('ui/badge.js');
      injectScript('ui/pageWorld.js');
    }, 60);
  }
  var titleNode = document.querySelector('title');
  if (titleNode) new MutationObserver(onNav).observe(titleNode, { childList: true });
  window.addEventListener('popstate', onNav);
})();

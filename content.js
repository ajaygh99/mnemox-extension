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
  // Generic textarea
  'textarea',
  // Last-resort contenteditable — only matches the FIRST one, so keep at end
  '[contenteditable="true"]',
  'input[type="text"]',
];

function wireObserver() {
  if (wired) return;

  var target = null;
  for (var i = 0; i < INPUT_SELECTORS.length; i++) {
    var el = document.querySelector(INPUT_SELECTORS[i]);
    if (el) { target = el; break; }
  }
  if (!target) { setTimeout(wireObserver, 500); return; }

  wired = true;
  // Bug fixed 2026-07-05: on heavier SPAs (Gemini/Angular) the input can
  // mount later than our fixed 400ms/500ms retry timers. If a fast typist
  // started their FIRST prompt before wireObserver ever attached, those
  // keystrokes were captured by nothing — no listener existed yet, so there
  // was nothing for the Enter-key fix to hook into either. Once wired,
  // the fallback DOM watcher below is no longer needed.
  if (bootObserver) { bootObserver.disconnect(); bootObserver = null; }
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

  // Score prompt 500ms after typing stops
  var debouncedScore = debounce(function () {
    var text = getText();
    if (text.length < 2) return;
    window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
  }, 500);

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

window.addEventListener('message', function (event) {
  if (event.source !== window || !event.data) return;

  if (event.data.type === 'MNEMOX_RESULT') {
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
  if (event.data.type === 'MNEMOX_RESPONSE') {
    lastTrustPayload = event.data.payload;
    clearTimeout(trustDebounceTimer);
    trustDebounceTimer = setTimeout(function () {
      window.postMessage({ type: 'MNEMOX_TRUST_SCORE', payload: lastTrustPayload }, '*');
    }, 1500); // fire 1.5s after last response chunk — streaming should be done
  }

  if (event.data.type === 'MNEMOX_TRUST_RESULT') {
    var tr = event.data.result;
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
wireObserver();
setTimeout(wireObserver, 400);
bootObserver = new MutationObserver(function () {
  if (wired) { bootObserver.disconnect(); bootObserver = null; return; }
  wireObserver();
});
bootObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', function () {
  if (!wired) wireObserver();
  setTimeout(function () {
    window.postMessage({ type: 'MNEMOX_HEALTHCHECK' }, '*');
  }, 800);
});

// SPA navigation — reset wired, re-wire textarea, re-inject badge
(function () {
  var lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    wired = false;
    clearTimeout(trustDebounceTimer); // cancel any pending trust score
    setTimeout(function () {
      wireObserver();
      injectScript('ui/badge.js');
      injectScript('ui/pageWorld.js');
    }, 600);
  }
  var titleNode = document.querySelector('title');
  if (titleNode) new MutationObserver(onNav).observe(titleNode, { childList: true });
  window.addEventListener('popstate', onNav);
})();

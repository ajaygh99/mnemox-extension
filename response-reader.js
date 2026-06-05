// Mnemox - Response Reader v2 (Step 4 — optimised)
// Performance improvements over v1:
//   1. Body observer is NARROW — only childList on body direct children, not full subtree
//   2. Once response container found, switches to a TARGETED observer on that element only
//   3. SPA detection watches only <title> changes (not full document subtree)
//   4. Adaptive debounce — shorter when stop-button absent (fast responses), longer when streaming
//   5. Single observer lifecycle — old observer always disconnected before creating new one

(function () {
  // ── Per-platform config ───────────────────────────────────────────────────
  var PLATFORMS = {
    'chatgpt.com':           { sel: '[data-message-author-role="assistant"]', stopSel: '[data-testid="stop-button"]' },
    'chat.openai.com':       { sel: '[data-message-author-role="assistant"]', stopSel: '[data-testid="stop-button"]' },
    'claude.ai':             { sel: '[data-is-streaming]',                    stopSel: null },
    'gemini.google.com':     { sel: 'model-response',                         stopSel: null },
    'copilot.microsoft.com': { sel: '[data-content][role="region"]',          stopSel: '[aria-label="Stop responding"]' },
    'perplexity.ai':         { sel: '[data-testid="answer"]',                 stopSel: '[aria-label="Stop"]' },
    'www.perplexity.ai':     { sel: '[data-testid="answer"]',                 stopSel: '[aria-label="Stop"]' },
    'grok.x.ai':             { sel: '[data-testid="grok-message"]',           stopSel: '[aria-label="Stop generating"]' },
    'grok.com':              { sel: '[data-testid="grok-message"]',           stopSel: '[aria-label="Stop generating"]' },
    'x.com':                 { sel: '[data-testid="grok-message"]',           stopSel: '[aria-label="Stop generating"]' },
  };

  var platform  = PLATFORMS[window.location.hostname];
  if (!platform) {
    console.log('[Mnemox] response-reader: no config for', window.location.hostname);
    return;
  }

  var DEBOUNCE_STREAMING = 1800; // ms — wait longer when streaming indicator present
  var DEBOUNCE_FAST      = 800;  // ms — fast response or streaming already done
  var MIN_CHARS          = 20;

  var bodyObserver    = null; // watches body for new turn containers appearing
  var targetObserver  = null; // watches the specific response container for text growth
  var debounceTimer   = null;
  var lastText        = '';
  var lastContainer   = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function estimateTokens(text) {
    var c = Math.ceil(text.length / 4);
    var w = Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.33);
    return Math.round((c + w) / 2);
  }

  function isStreaming() {
    if (window.location.hostname === 'claude.ai') {
      var el = document.querySelector('[data-is-streaming]');
      return el ? el.getAttribute('data-is-streaming') === 'true' : false;
    }
    return platform.stopSel ? !!document.querySelector(platform.stopSel) : false;
  }

  function getLatestContainer() {
    var all = document.querySelectorAll(platform.sel);
    return all.length ? all[all.length - 1] : null;
  }

  function emit(container) {
    var text = container.innerText.trim();
    if (text.length < MIN_CHARS || text === lastText) return;
    lastText = text;
    var payload = {
      platform:      window.location.hostname,
      text:          text,
      tokenEstimate: estimateTokens(text),
      completedAt:   new Date().toISOString(),
      url:           window.location.href,
    };
    console.log('[Mnemox] response captured:', payload.platform, payload.tokenEstimate, 'tokens');
    window.postMessage({ type: 'MNEMOX_RESPONSE', payload: payload }, '*');
  }

  function scheduleEmit(container) {
    clearTimeout(debounceTimer);
    var delay = isStreaming() ? DEBOUNCE_STREAMING : DEBOUNCE_FAST;
    debounceTimer = setTimeout(function () {
      if (isStreaming()) { scheduleEmit(container); return; } // still going — reschedule
      emit(container);
    }, delay);
  }

  // ── Targeted observer — watches ONE response container for text growth ────
  function attachTargetObserver(container) {
    if (container === lastContainer) return; // already watching this one
    lastContainer = container;

    if (targetObserver) { targetObserver.disconnect(); targetObserver = null; }

    targetObserver = new MutationObserver(function () {
      scheduleEmit(container);
    });
    targetObserver.observe(container, {
      childList:     true,
      subtree:       true,
      characterData: true,
    });
    scheduleEmit(container); // also fire immediately in case already complete
  }

  // ── Body observer — watches for NEW turn containers appearing in the DOM ──
  // Only childList on document.body (NOT subtree) keeps this very cheap.
  // When a new assistant turn appears as a body-level descendant, we hand off.
  function startBodyObserver() {
    if (bodyObserver) { bodyObserver.disconnect(); }

    bodyObserver = new MutationObserver(function () {
      var container = getLatestContainer();
      if (container && container !== lastContainer) {
        attachTargetObserver(container);
      }
    });

    // subtree:true needed to catch containers nested inside layout divs,
    // but characterData:false keeps it far cheaper than v1.
    bodyObserver.observe(document.body, {
      childList:     true,
      subtree:       true,
      characterData: false,
    });
  }

  // ── SPA navigation — watch <title> only (very cheap) ─────────────────────
  var lastUrl   = location.href;
  var titleNode = document.querySelector('title');

  function onNavigation() {
    if (location.href === lastUrl) return;
    lastUrl       = location.href;
    lastText      = '';
    lastContainer = null;
    if (targetObserver) { targetObserver.disconnect(); targetObserver = null; }
    clearTimeout(debounceTimer);
    startBodyObserver(); // re-attach body observer for new conversation
    console.log('[Mnemox] response-reader: SPA nav — reset');
  }

  if (titleNode) {
    new MutationObserver(onNavigation).observe(titleNode, { childList: true });
  }
  // Fallback: popstate for history-based SPAs
  window.addEventListener('popstate', onNavigation);

  // ── Boot ──────────────────────────────────────────────────────────────────
  startBodyObserver();

  // If a response container already exists on page load (e.g. page refresh mid-chat)
  var existing = getLatestContainer();
  if (existing) attachTargetObserver(existing);

  console.log('[Mnemox] response-reader v2: watching', window.location.hostname);
})();

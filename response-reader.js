// Mnemox - Response Reader (Step 4)
// Injected into the page world via injectScript(). No ES modules.
// Watches for AI responses using RESILIENT selectors only:
//   - data-* attributes tied to app function (not styling)
//   - aria role attributes
//   - NO CSS class selectors (break every 4-8 weeks on UI updates)
//
// Emits: window.postMessage({ type: 'MNEMOX_RESPONSE', payload: {...} })
// Content script forwards payload to background as RESPONSE_CAPTURED.

(function () {
  // ── Per-platform response selectors ──────────────────────────────────────
  // RESILIENT: only data-* and aria attributes. Never CSS classes.
  var RESPONSE_SELECTORS = {
    'chatgpt.com':              '[data-message-author-role="assistant"]',
    'chat.openai.com':          '[data-message-author-role="assistant"]',
    'claude.ai':                '[data-is-streaming]',
    'gemini.google.com':        'model-response',           // custom element — very stable
    'copilot.microsoft.com':    '[data-content][role="region"]',
    'perplexity.ai':            '[data-testid="answer"]',
    'grok.x.ai':                '[data-testid="grok-message"]',
    'x.com':                    '[data-testid="grok-message"]',
  };

  // How long with no DOM mutations before treating streaming as done (ms)
  var DEBOUNCE_MS = 1500;

  // Minimum chars to bother capturing (filters UI noise)
  var MIN_CHARS = 20;

  // ── State ─────────────────────────────────────────────────────────────────
  var selector    = RESPONSE_SELECTORS[window.location.hostname] || null;
  var debounce    = null;
  var lastText    = '';
  var observer    = null;

  if (!selector) {
    console.log('[Mnemox] response-reader: no selector for', window.location.hostname);
    return;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function estimateTokens(text) {
    var charEst = Math.ceil(text.length / 4);
    var words   = text.trim().split(/\s+/).filter(Boolean).length;
    var wordEst = Math.ceil(words * 1.33);
    return Math.round((charEst + wordEst) / 2);
  }

  function getLatestResponseText() {
    var containers = document.querySelectorAll(selector);
    if (!containers.length) return '';
    return containers[containers.length - 1].innerText.trim();
  }

  function isStreaming() {
    // Claude exposes data-is-streaming="true" while streaming
    if (window.location.hostname === 'claude.ai') {
      var el = document.querySelector('[data-is-streaming]');
      return el ? el.getAttribute('data-is-streaming') === 'true' : false;
    }
    // Generic: stop button present = still streaming
    var stopBtn = document.querySelector('[aria-label="Stop generating"]') ||
                  document.querySelector('[aria-label="Stop responding"]') ||
                  document.querySelector('[data-testid="stop-button"]') ||
                  document.querySelector('[aria-label="Stop"]');
    return !!stopBtn;
  }

  function tryCapture() {
    if (isStreaming()) {
      // Still streaming — reschedule
      clearTimeout(debounce);
      debounce = setTimeout(tryCapture, DEBOUNCE_MS);
      return;
    }

    var text = getLatestResponseText();
    if (text.length < MIN_CHARS) return;
    if (text === lastText) return; // deduplicate
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

  function scheduleCaptureOnMutation() {
    clearTimeout(debounce);
    debounce = setTimeout(tryCapture, DEBOUNCE_MS);
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
  // Watch entire body for content appearance — resilient against container refactors
  observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData' ||
          (m.type === 'childList' && m.addedNodes.length > 0)) {
        if (document.querySelector(selector)) {
          scheduleCaptureOnMutation();
          break;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList:     true,
    subtree:       true,
    characterData: true,
  });

  // ── SPA navigation reset ──────────────────────────────────────────────────
  var lastUrl = location.href;
  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl  = location.href;
      lastText = ''; // reset dedup on new conversation
      console.log('[Mnemox] response-reader: SPA nav — reset');
    }
  }).observe(document, { subtree: true, childList: true });

  console.log('[Mnemox] response-reader: watching', window.location.hostname);
})();

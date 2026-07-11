// Mnemox - Response Reader v2 (optimised)
// Performance: debounces cut from 1800/800ms → 1000/350ms

(function () {
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

  var platform = PLATFORMS[window.location.hostname];
  if (!platform) {
    console.log('[Mnemox] response-reader: no config for', window.location.hostname);
    return;
  }

  // Perf audit 2026-07-11: intentionally NOT cut further (already tuned
  // once from 1800/800ms). scheduleEmit() below re-checks isStreaming()
  // when this timer fires and re-arms itself if still streaming, so for
  // platforms with an authoritative signal (stopSel button, or Claude's
  // data-is-streaming attribute) these values mostly affect how fast a
  // COMPLETE response is detected, not correctness. But Gemini has neither
  // signal (platform.stopSel is null and it isn't claude.ai), so
  // isStreaming() always returns false for it — DEBOUNCE_STREAMING is that
  // platform's ONLY protection against emitting a still-generating response,
  // via plain DOM-silence debouncing. LLM token streaming commonly has
  // inter-chunk gaps well into the hundreds of ms (tool calls, network
  // jitter, "thinking" pauses), so cutting this to a 99% value (~10ms)
  // would cause Gemini responses to be captured and scored mid-stream,
  // undermining the whole Response Quality (MnemoxTrust) feature on that
  // platform. Not worth the tradeoff for a delay the user never watches.
  var DEBOUNCE_STREAMING = 1000; // was 1800ms — wait for stream to finish
  var DEBOUNCE_FAST      = 350;  // was 800ms  — instant/pre-rendered responses
  var MIN_CHARS          = 20;

  var bodyObserver   = null;
  var targetObserver = null;
  var debounceTimer  = null;
  var lastText       = '';
  var lastContainer  = null;

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
      if (isStreaming()) { scheduleEmit(container); return; }
      emit(container);
    }, delay);
  }

  function attachTargetObserver(container) {
    if (container === lastContainer) return;
    lastContainer = container;
    if (targetObserver) { targetObserver.disconnect(); targetObserver = null; }
    targetObserver = new MutationObserver(function () { scheduleEmit(container); });
    targetObserver.observe(container, { childList: true, subtree: true, characterData: true });
    scheduleEmit(container);
  }

  function startBodyObserver() {
    if (bodyObserver) { bodyObserver.disconnect(); }
    bodyObserver = new MutationObserver(function () {
      var container = getLatestContainer();
      if (container && container !== lastContainer) attachTargetObserver(container);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  var lastUrl   = location.href;
  var titleNode = document.querySelector('title');

  function onNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    lastText = ''; lastContainer = null;
    if (targetObserver) { targetObserver.disconnect(); targetObserver = null; }
    clearTimeout(debounceTimer);
    startBodyObserver();
    console.log('[Mnemox] response-reader: SPA nav — reset');
  }

  if (titleNode) new MutationObserver(onNavigation).observe(titleNode, { childList: true });
  window.addEventListener('popstate', onNavigation);

  startBodyObserver();
  var existing = getLatestContainer();
  if (existing) attachTargetObserver(existing);

  console.log('[Mnemox] response-reader v2: watching', window.location.hostname);
})();

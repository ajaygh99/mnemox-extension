// Mnemox — Page World Coordinator
// Runs in the page's JS context (injected via content.js).
// Receives MNEMOX_SCORE messages, calls scorePrompt(), updates badge.

(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'MNEMOX_SCORE') return;

    var text = event.data.text;
    if (!text || typeof scorePrompt !== 'function') return;

    var result = scorePrompt(text);

    // Update badge if available
    if (typeof MnemoxBadge !== 'undefined') {
      MnemoxBadge.update(result);
    }

    // Post result back for any listeners
    window.postMessage({ type: 'MNEMOX_RESULT', result: result }, '*');
  });

  console.log('[Mnemox] page world coordinator ready');
})();

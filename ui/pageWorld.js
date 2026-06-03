// Mnemox - Page World Coordinator
// Receives MNEMOX_SCORE, scores, counts tokens, generates suggestion, updates badge.

(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === 'MNEMOX_SCORE') {
      var text = event.data.text;
      if (!text || typeof scorePrompt !== 'function') return;

      var result = scorePrompt(text);

      if (typeof MnemoxTokenizer !== 'undefined') {
        result.tokens = MnemoxTokenizer.countTokens(text);
      }

      if (typeof MnemoxSuggester !== 'undefined') {
        result.suggestion = MnemoxSuggester.suggest(text, result.dims);
      }

      if (typeof MnemoxBadge !== 'undefined') {
        MnemoxBadge.update(result);
      }

      window.postMessage({ type: 'MNEMOX_RESULT', result: result }, '*');
    }

    if (event.data.type === 'MNEMOX_HEALTHCHECK') {
      var adapterResult = { adapter: 'none', healthy: true };
      if (typeof getAdapterForPage === 'function') {
        var adapter = getAdapterForPage();
        if (adapter) {
          var healthy = typeof adapter.healthCheck === 'function' ? adapter.healthCheck() : true;
          adapterResult = { adapter: adapter.name || 'unknown', healthy: healthy };
        }
      }
      window.postMessage({ type: 'MNEMOX_HEALTHCHECK_RESULT', result: adapterResult }, '*');
    }
  });

  console.log('[Mnemox] page world coordinator ready');
})();

// Mnemox - Page World Coordinator
// Receives MNEMOX_SCORE, scores, counts tokens, generates suggestion, updates badge.

(function () {
  // Idempotency guard — re-injection after SPA nav must not add duplicate listeners
  if (window.__mnemoxPageWorldReady) {
    // Already running — just re-inject badge in case it was removed from DOM
    if (typeof MnemoxBadge !== 'undefined') MnemoxBadge.inject();
    return;
  }
  window.__mnemoxPageWorldReady = true;
  var lastScoredText = null;
  var lastScoredResult = null;

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === 'MNEMOX_SCORE') {
      var text = event.data.text;
      console.log('[Mnemox][debug] pageWorld received MNEMOX_SCORE, text len=' + (text ? text.length : 0) + ', scorePrompt is ' + typeof scorePrompt);
      if (!text || typeof scorePrompt !== 'function') {
        console.warn('[Mnemox][debug] pageWorld DROPPED MNEMOX_SCORE — ' + (!text ? 'no text' : 'scorePrompt not loaded yet (script order issue)'));
        return;
      }

      var normalizedText = text.trim();
      if (normalizedText === lastScoredText && lastScoredResult) {
        window.postMessage({ type: 'MNEMOX_RESULT', result: lastScoredResult }, '*');
        return;
      }

      var result = scorePrompt(text);
      console.log('[Mnemox][debug] pageWorld computed score=' + result.score + ' grade=' + result.grade);

      if (typeof MnemoxTokenizer !== 'undefined') {
        result.tokens = MnemoxTokenizer.countTokens(text);
      }

      if (typeof MnemoxSuggester !== 'undefined') {
        result.suggestion = MnemoxSuggester.suggest(text, result.dims);
      }
      lastScoredText = normalizedText;
      lastScoredResult = result;

      // Bug fixed 2026-07-05: MnemoxBadge.update() used to run BEFORE posting
      // MNEMOX_RESULT below. If it threw for any reason (Trusted Types was
      // one confirmed cause, but this guards against any other DOM/render
      // issue too), the exception aborted this whole handler and the score
      // never got posted/saved at all — even though it was computed fine.
      // This is exactly why response/trust scoring was always reliable (it
      // has no DOM dependency before saving) while prompt scoring wasn't.
      // Wrapping the cosmetic badge update so it can never block the save.
      if (typeof MnemoxBadge !== 'undefined') {
        try {
          MnemoxBadge.update(result);
          // Cache last result so badge can restore it after SPA nav re-injection
          try { localStorage.setItem('__mnemox_last_result', JSON.stringify(result)); } catch(e) {}
        } catch (badgeErr) {
          console.error('[Mnemox][debug] MnemoxBadge.update threw (badge display broken, but score is still saved):', badgeErr);
        }
      }

      console.log('[Mnemox][debug] pageWorld posting MNEMOX_RESULT, score=' + result.score);
      window.postMessage({ type: 'MNEMOX_RESULT', result: result }, '*');
    }

    // Step 5: route the trust (response quality) score into the coaching
    // panel. trust.js computes this independently of MNEMOX_SCORE above and
    // used to only ever reach chrome.storage.local / the popup — the coach
    // panel never showed it. Wrapped the same way as MnemoxBadge.update
    // above: a display error here must never block anything else.
    if (event.data.type === 'MNEMOX_TRUST_RESULT') {
      if (typeof MnemoxCoach !== 'undefined') {
        try {
          MnemoxCoach.updateTrust(event.data.result);
          try { localStorage.setItem('__mnemox_last_trust_result', JSON.stringify(event.data.result)); } catch (e) {}
        } catch (trustErr) {
          console.error('[Mnemox][debug] MnemoxCoach.updateTrust threw:', trustErr);
        }
      }
    }

    // Optional Step 5 memory-alignment result (only sent when the user has
    // MEMORY_CONSISTENCY enabled — see content.js / background.js).
    if (event.data.type === 'MNEMOX_MEMORY_ALIGNMENT') {
      if (typeof MnemoxCoach !== 'undefined') {
        try {
          MnemoxCoach.updateMemoryAlignment(event.data.result);
        } catch (maErr) {
          console.error('[Mnemox][debug] MnemoxCoach.updateMemoryAlignment threw:', maErr);
        }
      }
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

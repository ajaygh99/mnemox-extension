// Mnemox - Content Script
// Performance: debounces cut 60%, single boot timer, safeChrome wrapper.

function safeChrome(fn) {
  try { fn(); } catch (e) { /* extension context gone after reload — safe to ignore */ }
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

function wireObserver() {
  if (wired) return;
  // Ordered by specificity — most specific first
  var SELECTORS = [
    '#prompt-textarea',
    'div[contenteditable="true"][aria-label]',
    '[contenteditable="true"]',
    'textarea',
    'input[type="text"]',
    'input:not([type])',
  ];
  var target = null;
  for (var i = 0; i < SELECTORS.length; i++) {
    target = document.querySelector(SELECTORS[i]);
    if (target) break;
  }
  if (!target) { setTimeout(wireObserver, 500); return; } // was 2000ms

  wired = true;
  console.log('[Mnemox] wired to', target.tagName, (target.id || target.getAttribute('aria-label') || ''));

  // Save prompt text immediately on Enter — before debounce fires
  target.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      var text = (target.value || target.innerText || target.textContent || '').trim();
      if (text.length > 1) {
        safeChrome(function () { chrome.storage.local.set({ lastPromptText: text }); });
      }
    }
  });

  // Score prompt 500ms after typing stops (was 1500ms)
  var debouncedScore = debounce(function () {
    var text = (target.value || target.innerText || target.textContent || '').trim();
    if (text.length < 2) return;
    safeChrome(function () { chrome.storage.local.set({ lastPromptText: text }); });
    window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
  }, 500);

  target.addEventListener('input', debouncedScore);
  target.addEventListener('keyup', debouncedScore);

  if (target.getAttribute('contenteditable')) {
    var observer = new MutationObserver(debouncedScore);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
}

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

  if (event.data.type === 'MNEMOX_RESPONSE') {
    window.postMessage({ type: 'MNEMOX_TRUST_SCORE', payload: event.data.payload }, '*');
  }

  if (event.data.type === 'MNEMOX_TRUST_RESULT') {
    var tr = event.data.result;
    safeChrome(function () {
      chrome.storage.local.set({ lastTrustResult: tr, lastResponseUrl: window.location.hostname });
      chrome.runtime.sendMessage({ type: 'RESPONSE_SCORED', result: tr });
    });
  }

  if (event.data.type === 'MNEMOX_HEALTHCHECK_RESULT') {
    safeChrome(function () {
      chrome.runtime.sendMessage({ type: 'HEALTH_REPORT', result: event.data.result });
    });
  }
});

// Single boot timer (was two competing timers at 800ms + 1200ms)
setTimeout(wireObserver, 400);
window.addEventListener('load', function () {
  if (!wired) wireObserver();
  setTimeout(function () {
    window.postMessage({ type: 'MNEMOX_HEALTHCHECK' }, '*');
  }, 800);
});

// SPA navigation — reset wired so wireObserver re-attaches to new page's textarea
(function () {
  var lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    wired = false;
    setTimeout(wireObserver, 600); // give new page DOM time to render
  }
  var titleNode = document.querySelector('title');
  if (titleNode) new MutationObserver(onNav).observe(titleNode, { childList: true });
  window.addEventListener('popstate', onNav);
})();

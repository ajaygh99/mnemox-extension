// Mnemox - Content Script
// Detects textarea input, scores locally, updates badge. Zero external API calls.

// Safe wrapper — prevents "Extension context invalidated" errors after extension reload
function safeChrome(fn) {
  try { fn(); } catch (e) { /* context gone after reload — safe to ignore */ }
}

safeChrome(function() {
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
  } catch (e) { /* extension context gone */ }
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
  var SELECTORS = ['#prompt-textarea', '[contenteditable="true"]', 'textarea', 'input[type="text"]', 'input:not([type])', 'input[type="search"]'];
  var target = null;
  for (var i = 0; i < SELECTORS.length; i++) {
    target = document.querySelector(SELECTORS[i]);
    if (target) break;
  }
  if (!target) { setTimeout(wireObserver, 2000); return; }

  wired = true;
  console.log('[Mnemox] wired to', target.tagName, (target.id || ''));

  // Save prompt text immediately on Enter keydown — ensures it's in storage
  // before the response comes back and RESPONSE_SCORED fires.
  target.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      var text = (target.value || target.innerText || target.textContent || '').trim();
      if (text.length > 1) {
        safeChrome(function () {
          chrome.storage.local.set({ lastPromptText: text });
        });
      }
    }
  });

  var debouncedScore = debounce(function () {
    var text = (target.value || target.innerText || target.textContent || '').trim();
    if (text.length < 2) return;
    safeChrome(function () {
      chrome.storage.local.set({ lastPromptText: text });
    });
    window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
  }, 1500);

  target.addEventListener('input', debouncedScore);
  target.addEventListener('keyup', debouncedScore);

  if (target.getAttribute('contenteditable')) {
    var observer = new MutationObserver(debouncedScore);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
}

// Save last result to storage so popup can read it
window.addEventListener('message', function (event) {
  if (event.source !== window) return;
  if (!event.data) return;

  if (event.data.type === 'MNEMOX_RESULT') {
    safeChrome(function () {
      chrome.storage.local.get(['sessionCount'], function(data) {
        var count = (data.sessionCount || 0) + 1;
        chrome.storage.local.set({
          lastResult: event.data.result,
          lastUrl: window.location.hostname,
          sessionCount: count
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

// Adapter health-check on page load
function runHealthCheck() {
  window.postMessage({ type: 'MNEMOX_HEALTHCHECK' }, '*');
}

window.addEventListener('load', function () {
  setTimeout(wireObserver, 800);
  setTimeout(runHealthCheck, 1500);
});
setTimeout(wireObserver, 1200);

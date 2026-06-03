// Mnemox - Content Script
// Detects textarea input, scores locally, updates badge. Zero external API calls.

chrome.runtime.sendMessage({ type: 'FLAG_TEST' }, function (response) {
  if (chrome.runtime.lastError) return;
  if (response && response.ok) {
    console.log('[Mnemox] loaded on', window.location.hostname);
    console.log('[Mnemox] flags:', JSON.stringify(response.flags));
  }
});

function debounce(fn, ms) {
  var timer;
  return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

function injectScript(file) {
  var s = document.createElement('script');
  s.src = chrome.runtime.getURL(file);
  s.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(s);
}

injectScript('scoring/rules.js');
injectScript('ui/badge.js');
injectScript('ui/pageWorld.js');

var wired = false;

function wireObserver() {
  if (wired) return;
  var SELECTORS = ['#prompt-textarea', '[contenteditable="true"]', 'textarea'];
  var target = null;
  for (var i = 0; i < SELECTORS.length; i++) {
    target = document.querySelector(SELECTORS[i]);
    if (target) break;
  }
  if (!target) { setTimeout(wireObserver, 2000); return; }

  wired = true;
  console.log('[Mnemox] wired to', target.tagName, (target.id || ''));

  var debouncedScore = debounce(function () {
    var text = (target.value || target.innerText || target.textContent || '').trim();
    if (text.length < 2) return;
    window.postMessage({ type: 'MNEMOX_SCORE', text: text }, '*');
  }, 1500);

  target.addEventListener('input', debouncedScore);
  target.addEventListener('keyup', debouncedScore);

  if (target.getAttribute('contenteditable')) {
    var observer = new MutationObserver(debouncedScore);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
}

window.addEventListener('load', function () { setTimeout(wireObserver, 800); });
setTimeout(wireObserver, 1200);

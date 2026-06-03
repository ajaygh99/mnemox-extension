// Mnemox — Content Script
// Runs on every page. Sends self-test message to background on load.

console.log('[Mnemox] loaded on', window.location.hostname);

// Step 1.3 self-test: ping background and log all feature flag states
chrome.runtime.sendMessage({ type: 'FLAG_TEST' }, response => {
  if (chrome.runtime.lastError) {
    console.warn('[Mnemox] background not ready:', chrome.runtime.lastError.message);
    return;
  }
  if (response && response.ok) {
    console.log('[Mnemox] flags OK:', JSON.stringify(response.flags));
  }
});

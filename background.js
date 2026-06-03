// Mnemox — Background Service Worker
// 100% local. No external API calls. No dependency on any AI platform.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOKEN_COUNT':
      sendResponse({ ok: true });
      break;
    case 'ANALYZE_PROMPT':
      sendResponse({ ok: true });
      break;
    case 'ENTITLEMENT_CHECK':
      sendResponse({ ok: true, tier: 'free' });
      break;
    default:
      sendResponse({ ok: false, error: 'unknown type' });
  }
  return true;
});

console.log('[Mnemox] background ready');

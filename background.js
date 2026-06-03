// Mnemox — Background Service Worker
// 100% local. No external API. No AI platform dependency.
// featureFlags logic is inlined directly below — no imports needed.

const FLAG_DEFAULTS = {
  TOKEN_COUNTER:   false,
  PROMPT_COACHING: false,
  PAYWALL:         false,
};

function getFlag(key, callback) {
  chrome.storage.local.get(key, result => {
    callback(key in result ? result[key] : FLAG_DEFAULTS[key]);
  });
}

function getAllFlags(callback) {
  chrome.storage.local.get(Object.keys(FLAG_DEFAULTS), result => {
    callback({ ...FLAG_DEFAULTS, ...result });
  });
}

// Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'TOKEN_COUNT':
      getFlag('TOKEN_COUNTER', enabled => {
        sendResponse({ ok: true, enabled });
      });
      return true;

    case 'ANALYZE_PROMPT':
      getFlag('PROMPT_COACHING', enabled => {
        sendResponse({ ok: true, enabled });
      });
      return true;

    case 'ENTITLEMENT_CHECK':
      getFlag('PAYWALL', enabled => {
        sendResponse({ ok: true, tier: 'free', paywallEnabled: enabled });
      });
      return true;

    case 'FLAG_TEST':
      getAllFlags(flags => {
        sendResponse({ ok: true, flags });
      });
      return true;

    default:
      sendResponse({ ok: false, error: 'unknown type: ' + message.type });
  }

  return true;
});

// Log all flag states on install
chrome.runtime.onInstalled.addListener(() => {
  getAllFlags(flags => {
    console.log('[Mnemox] installed. Flags:', JSON.stringify(flags));
  });
});

console.log('[Mnemox] background ready');

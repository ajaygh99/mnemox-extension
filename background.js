// Mnemox - Background Service Worker
// 100% local. No external API. No AI platform dependency.
// featureFlags logic is inlined directly below - no imports needed.

const FLAG_DEFAULTS = {
  TOKEN_COUNTER:   false,
  PROMPT_COACHING: false,
  PAYWALL:         false,
  TRUST_SCORING:   false,
  TRACE_LOGGING:   false,
};

function getFlag(key, callback) {
  chrome.storage.local.get(key, function(result) {
    callback(key in result ? result[key] : FLAG_DEFAULTS[key]);
  });
}

function getAllFlags(callback) {
  chrome.storage.local.get(Object.keys(FLAG_DEFAULTS), function(result) {
    var merged = Object.assign({}, FLAG_DEFAULTS, result);
    callback(merged);
  });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.type) {

    case 'TOKEN_COUNT':
      getFlag('TOKEN_COUNTER', function(enabled) {
        sendResponse({ ok: true, enabled: enabled });
      });
      return true;

    case 'ANALYZE_PROMPT':
      getFlag('PROMPT_COACHING', function(enabled) {
        sendResponse({ ok: true, enabled: enabled });
      });
      return true;

    case 'ENTITLEMENT_CHECK':
      getFlag('PAYWALL', function(enabled) {
        sendResponse({ ok: true, tier: 'free', paywallEnabled: enabled });
      });
      return true;

    case 'FLAG_TEST':
      getAllFlags(function(flags) {
        sendResponse({ ok: true, flags: flags });
      });
      return true;

    case 'GET_UUID':
      chrome.storage.local.get(['mnemox_uuid'], function(data) {
        sendResponse({ ok: true, uuid: data.mnemox_uuid || null });
      });
      return true;

    case 'HEALTH_REPORT':
      console.log('[Mnemox] health report:', JSON.stringify(message.result));
      sendResponse({ ok: true });
      return true;

    default:
      sendResponse({ ok: false, error: 'unknown type: ' + message.type });
  }

  return true;
});

// Generate anonymous UUID on first install — used to link free users to backend on Pro upgrade.
// UUID is never sent anywhere until the user explicitly logs in.
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(['mnemox_uuid'], function(data) {
    if (!data.mnemox_uuid) {
      var uuid = generateUUID();
      chrome.storage.local.set({ mnemox_uuid: uuid });
      console.log('[Mnemox] assigned UUID:', uuid);
    }
  });
  getAllFlags(function(flags) {
    console.log('[Mnemox] installed. Flags:', JSON.stringify(flags));
  });
});

console.log('[Mnemox] background ready');

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

    case 'RESPONSE_SCORED': {
      var scored = message.result;
      console.log('[Mnemox] response scored: trust=' + scored.trustScore + ' (' + scored.grade + ') — ' + scored.quality);

      getFlag('TRACE_LOGGING', function (enabled) {
        if (!enabled) { sendResponse({ ok: true, logged: false }); return; }

        var HOST_MAP = {
          'chatgpt.com':           'chatgpt',
          'chat.openai.com':       'chatgpt',
          'claude.ai':             'claude',
          'gemini.google.com':     'gemini',
          'copilot.microsoft.com': 'copilot',
          'perplexity.ai':         'perplexity',
          'www.perplexity.ai':     'perplexity',
          'grok.x.ai':             'grok',
          'grok.com':              'grok',
          'x.com':                 'grok',
        };

        var toolName = HOST_MAP[scored.platform] || null;
        if (!toolName) { sendResponse({ ok: true, logged: false, reason: 'unknown platform' }); return; }

        chrome.storage.local.get(['mnemox_uuid', 'lastPromptText', 'lastResult'], function (data) {
          var body = JSON.stringify({
            tool_name:     toolName,
            prompt_text:   (data.lastPromptText || '(not captured)').slice(0, 5000),
            response_text: scored.text ? scored.text.slice(0, 5000) : null,
            prompt_score:  data.lastResult ? data.lastResult.score : null,
            prompt_grade:  data.lastResult ? data.lastResult.grade : null,
            trust_score:   scored.trustScoreNormalized,
            token_count:   scored.tokenEstimate || null,
            mnemox_uuid:   data.mnemox_uuid || null,
          });

          fetch('https://mnemox-production.up.railway.app/traces', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    body,
          }).then(function (r) {
            console.log('[Mnemox] trace logged:', r.status);
          }).catch(function (err) {
            console.warn('[Mnemox] trace log failed (silent):', err.message);
          });

          sendResponse({ ok: true, logged: true });
        });
      });
      return true;
    }
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


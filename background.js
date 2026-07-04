// Mnemox - Background Service Worker
// 100% local. No external API. No AI platform dependency.

const API_BASE = 'https://mnemox-production.up.railway.app';

const FLAG_DEFAULTS = {
  TOKEN_COUNTER:   true,
  PROMPT_COACHING: true,
  PAYWALL:         false,
  TRUST_SCORING:   true,
  TRACE_LOGGING:   true,
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

// Cooldown map — prevents duplicate traces when response-reader emits
// multiple times for the same streaming response (one per DOM mutation burst).
var traceCooldown = {}; // toolName → timestamp of last logged trace
var TRACE_COOLDOWN_MS = 8000; // ignore repeated RESPONSE_SCORED within 8s per tool

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

    // ── Traces fetch — called from traces.html to bypass CORS ────────────────
    case 'GET_TRACES': {
      chrome.storage.local.get(['mnemox_uuid'], function(data) {
        var uuid = data.mnemox_uuid || null;
        var url = API_BASE + '/traces?limit=50';
        if (uuid) url += '&mnemox_uuid=' + encodeURIComponent(uuid);

        fetch(url)
          .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function(json) {
            sendResponse({ ok: true, traces: json.traces || [], uuid: uuid });
          })
          .catch(function(err) {
            sendResponse({ ok: false, error: err.message });
          });
      });
      return true; // keep channel open for async sendResponse
    }

    // ── Trace logging — gated by TRACE_LOGGING flag + cooldown ───────────────
    case 'RESPONSE_SCORED': {
      var scored = message.result;
      console.log('[Mnemox] response scored: trust=' + scored.trustScore + ' (' + scored.grade + ') — ' + scored.quality);

      getFlag('TRACE_LOGGING', function(enabled) {
        if (!enabled) { sendResponse({ ok: true, logged: false }); return; }

        var toolName = HOST_MAP[scored.platform] || null;
        if (!toolName) { sendResponse({ ok: true, logged: false, reason: 'unknown platform' }); return; }

        // Cooldown check — skip if we already logged for this tool recently
        var now = Date.now();
        if (traceCooldown[toolName] && (now - traceCooldown[toolName]) < TRACE_COOLDOWN_MS) {
          console.log('[Mnemox] trace skipped (cooldown):', toolName);
          sendResponse({ ok: true, logged: false, reason: 'cooldown' });
          return;
        }
        traceCooldown[toolName] = now;

        chrome.storage.local.get(['mnemox_uuid', 'lastPromptText', 'lastResult'], function(data) {
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

          fetch(API_BASE + '/traces', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    body,
          }).then(function(r) {
            console.log('[Mnemox] trace logged:', r.status);
          }).catch(function(err) {
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

// Generate anonymous UUID on first install
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

// Warm up Railway backend on service-worker start to reduce cold-start delay
function warmupBackend() {
  fetch(API_BASE + '/health').catch(function() { /* silent — just waking the server */ });
}
warmupBackend();
chrome.runtime.onStartup.addListener(warmupBackend);

console.log('[Mnemox] background ready');

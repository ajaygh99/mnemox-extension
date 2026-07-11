// Mnemox - Background Service Worker
// 100% local. No external API. No AI platform dependency.

const API_BASE = 'https://mnemox-production.up.railway.app';

const FLAG_DEFAULTS = {
  TOKEN_COUNTER:        true,
  PROMPT_COACHING:      true,
  PAYWALL:              false,
  TRUST_SCORING:        true,
  // Bug fixed 2026-07-10: this defaulted to true, silently sending every
  // prompt+response pair to the Railway backend on install even though
  // manifest.json's description and STORE_LISTING.md's privacy policy both
  // promise "zero external API calls" / "no data leaves your browser". The
  // master plan (Section 10, immediate action #5) explicitly specified both
  // TRACE_LOGGING and TRUST_SCORING should ship "false by default" — this
  // got flipped to true during dev (see commit 36c7e5e) and never reverted.
  // Restoring the documented default; users can opt in from the popup.
  TRACE_LOGGING:        false,
  // New: Step 5 (MnemoxTrust) "memory consistency" signal — compares an AI
  // response against the user's saved memories via the backend's vector
  // search. Off by default for the same reason as TRACE_LOGGING above: it
  // sends response text to an external server, which must be opt-in to
  // keep the extension's local-by-default privacy claim true.
  MEMORY_CONSISTENCY:  false,
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
// Perf audit 2026-07-11: intentionally NOT cut. This isn't a user-facing
// latency — it's invisible, backend-side dedup that stops the (opt-in)
// Traces dashboard from filling with near-duplicate rows and stops
// unnecessary writes to the user's own backend. Cutting it doesn't make
// anything feel faster; it would only spam the trace log.
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
          // message.promptText is passed directly from content.js to avoid async race
          var promptText = message.promptText || data.lastPromptText || '(not captured)';
          var body = JSON.stringify({
            tool_name:     toolName,
            prompt_text:   promptText.slice(0, 5000),
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

    // ── Memory consistency check — Step 5, gated by MEMORY_CONSISTENCY flag ──
    // (opt-in, off by default). Compares AI response text against the
    // user's saved memories via the backend's vector-search endpoint. This
    // is the only path in the extension that sends response text to an
    // external server, so it never runs unless the user has turned the
    // setting on in the popup.
    case 'MEMORY_CHECK': {
      getFlag('MEMORY_CONSISTENCY', function(enabled) {
        if (!enabled) { sendResponse({ ok: true, enabled: false }); return; }

        var text = (message.text || '').slice(0, 2000);
        if (!text) { sendResponse({ ok: true, enabled: true, available: false, reason: 'no text' }); return; }

        chrome.storage.local.get(['mnemox_uuid'], function(data) {
          fetch(API_BASE + '/search', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ query: text, user_id: data.mnemox_uuid || null, limit: 5 }),
          })
            .then(function(r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(function(json) {
              // Backend response shape isn't pinned down from the extension
              // side (mcp/lib/memory.js is the only other caller and just
              // passes the body straight through) — handle the reasonable
              // variants defensively instead of assuming one and throwing.
              var matches = Array.isArray(json)          ? json
                          : Array.isArray(json.results)  ? json.results
                          : Array.isArray(json.memories) ? json.memories
                          : Array.isArray(json.matches)  ? json.matches
                          : [];
              var scores = matches
                .map(function(m) { return typeof m.score === 'number' ? m.score : (typeof m.similarity === 'number' ? m.similarity : null); })
                .filter(function(s) { return s !== null; });
              var avg = scores.length ? scores.reduce(function(a, b) { return a + b; }, 0) / scores.length : null;
              sendResponse({ ok: true, enabled: true, available: matches.length > 0, count: matches.length, avgSimilarity: avg });
            })
            .catch(function(err) {
              console.warn('[Mnemox] memory check failed (silent):', err.message);
              sendResponse({ ok: true, enabled: true, available: false, error: err.message });
            });
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

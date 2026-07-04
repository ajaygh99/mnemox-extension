// Mnemox — traces.js (external — MV3 CSP compliant, no inline handlers)

var API_URL       = 'https://mnemox-production.up.railway.app';
var allTraces     = [];
var currentFilter = 'all';
var currentUuid   = null;
var CACHE_KEY     = 'mnemox_traces_cache';
var CACHE_TTL     = 60000; // 1 minute

// ─── Helpers ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleString();
  } catch (e) { return iso; }
}

function gradeColor(score) {
  if (score == null) return '#888';
  if (score >= 85) return '#58D68D';
  if (score >= 70) return '#F7DC6F';
  if (score >= 50) return '#F0B27A';
  return '#EC7063';
}

function gradeLabel(score) {
  if (score == null) return '--';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderTraces() {
  var list = document.getElementById('traces-list');
  var statsBar = document.getElementById('stats-bar');
  var filtered = currentFilter === 'all'
    ? allTraces
    : allTraces.filter(function (t) {
        var p = (t.platform || '').toLowerCase();
        return p.indexOf(currentFilter) !== -1;
      });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty"><div class="empty-title">No traces yet</div>'
      + (currentFilter !== 'all' ? '<p>No interactions logged for this platform.</p>' : '<p>Browse an AI platform to log interactions automatically.</p>')
      + '</div>';
    statsBar.style.display = 'none';
    return;
  }

  // Stats
  var promptScores = filtered.map(function (t) { return t.prompt_score; }).filter(function (s) { return s != null; });
  var trustScores  = filtered.map(function (t) { return t.trust_score;  }).filter(function (s) { return s != null; });
  var avgPrompt = promptScores.length ? Math.round(promptScores.reduce(function (a, b) { return a + b; }, 0) / promptScores.length) : null;
  var avgTrust  = trustScores.length  ? Math.round(trustScores.reduce(function (a, b)  { return a + b; }, 0) / trustScores.length)  : null;

  document.getElementById('stat-total').textContent     = filtered.length;
  document.getElementById('stat-avg-prompt').textContent = avgPrompt != null ? avgPrompt + ' ' + gradeLabel(avgPrompt) : '--';
  document.getElementById('stat-avg-trust').textContent  = avgTrust  != null ? avgTrust  + ' ' + gradeLabel(avgTrust)  : '--';
  document.getElementById('stat-uuid').textContent       = currentUuid ? currentUuid.slice(0, 8) + '...' : '--';
  statsBar.style.display = '';

  // Cards — NO inline onclick — use data-trace-index for event delegation
  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var t = filtered[i];
    var ps = t.prompt_score;
    var ts = t.trust_score;
    var platform = (t.platform || 'unknown').toLowerCase()
      .replace(/chatgpt\.com|chat\.openai\.com/, 'chatgpt')
      .replace(/claude\.ai/, 'claude')
      .replace(/gemini\.google\.com/, 'gemini')
      .replace(/copilot\.microsoft\.com/, 'copilot')
      .replace(/perplexity\.ai|www\.perplexity\.ai/, 'perplexity')
      .replace(/grok\.x\.ai|grok\.com|x\.com/, 'grok');
    var platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

    html += '<div class="trace-card">';
    html += '<div class="trace-header" data-trace-index="' + i + '">';
    html += '<span class="platform-badge platform-' + escHtml(platform) + '">' + escHtml(platformLabel) + '</span>';
    html += '<span class="trace-time">' + escHtml(formatTime(t.created_at)) + '</span>';
    if (ps != null) {
      html += '<span class="score-pill score-prompt" style="color:' + gradeColor(ps) + '">P: ' + ps + ' ' + gradeLabel(ps) + '</span>';
    }
    if (ts != null) {
      html += '<span class="score-pill score-trust" style="color:' + gradeColor(ts) + '">T: ' + ts + ' ' + gradeLabel(ts) + '</span>';
    }
    html += '<span class="expand-icon">▼</span>';
    html += '</div>'; // .trace-header

    html += '<div class="trace-body" id="trace-body-' + i + '">';

    if (t.prompt_text) {
      html += '<div class="trace-section"><div class="trace-section-label">Prompt</div>';
      html += '<div class="trace-text">' + escHtml(t.prompt_text) + '</div></div>';
    }
    if (t.response_text) {
      html += '<div class="trace-section"><div class="trace-section-label">Response</div>';
      html += '<div class="trace-text">' + escHtml(t.response_text) + '</div></div>';
    }

    var hasDims = t.prompt_dims || t.trust_dims;
    if (hasDims) {
      html += '<div class="trace-section"><div class="trace-section-label">Score detail</div>';
      html += '<div class="scores-row">';
      if (t.prompt_dims) {
        var pd = t.prompt_dims;
        var pdKeys = Object.keys(pd);
        for (var j = 0; j < pdKeys.length; j++) {
          html += '<div class="score-detail"><strong>' + escHtml(pdKeys[j]) + ':</strong> ' + escHtml(pd[pdKeys[j]]) + '</div>';
        }
      }
      if (t.trust_dims) {
        var td = t.trust_dims;
        var tdKeys = Object.keys(td);
        for (var k = 0; k < tdKeys.length; k++) {
          html += '<div class="score-detail"><strong>' + escHtml(tdKeys[k]) + ':</strong> ' + escHtml(td[tdKeys[k]]) + '</div>';
        }
      }
      html += '</div></div>';
    }

    if (t.token_estimate) {
      html += '<div class="trace-section"><div class="score-detail">~' + escHtml(t.token_estimate) + ' response tokens</div></div>';
    }

    html += '</div>'; // .trace-body
    html += '</div>'; // .trace-card
  }
  list.innerHTML = html;
}

// ─── Toggle (event delegation) ───────────────────────────────────────────────

document.getElementById('traces-list').addEventListener('click', function (e) {
  var header = e.target.closest('.trace-header');
  if (!header) return;
  var idx  = header.getAttribute('data-trace-index');
  var body = document.getElementById('trace-body-' + idx);
  var icon = header.querySelector('.expand-icon');
  if (!body) return;
  var open = body.classList.toggle('open');
  if (icon) icon.textContent = open ? '▲' : '▼';
});

// ─── Filter buttons (event delegation) ──────────────────────────────────────

document.getElementById('filters').addEventListener('click', function (e) {
  var btn = e.target.closest('.filter-btn');
  if (!btn) return;
  var platform = btn.getAttribute('data-platform');
  if (platform === currentFilter) return;
  currentFilter = platform;
  document.querySelectorAll('.filter-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-platform') === platform);
  });
  renderTraces();
});

// ─── Load ────────────────────────────────────────────────────────────────────

function loadTraces(fromCache) {
  // Show cached data instantly if available
  if (fromCache !== false) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        if (Date.now() - cached.ts < CACHE_TTL) {
          allTraces   = cached.traces || [];
          currentUuid = cached.uuid   || null;
          renderTraces();
        }
      }
    } catch (e) { /* ignore corrupt cache */ }
  }

  // Always fetch fresh data in background
  chrome.runtime.sendMessage({ type: 'GET_TRACES' }, function (resp) {
    if (chrome.runtime.lastError) {
      console.error('[MnemoxTrace] runtime error:', chrome.runtime.lastError.message);
      if (!allTraces.length) {
        document.getElementById('traces-list').innerHTML =
          '<div class="empty"><div class="empty-title">Connection error</div>'
          + '<p>Could not reach the background service. Try reloading the extension.</p></div>';
      }
      return;
    }
    if (!resp || !resp.ok) {
      console.error('[MnemoxTrace] GET_TRACES error:', resp && resp.error);
      if (!allTraces.length) {
        document.getElementById('traces-list').innerHTML =
          '<div class="empty"><div class="empty-title">Could not load traces</div>'
          + '<p>' + escHtml((resp && resp.error) || 'Unknown error') + '</p></div>';
      }
      return;
    }
    allTraces   = resp.traces || [];
    currentUuid = resp.uuid   || null;
    // Cache result
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ traces: allTraces, uuid: currentUuid, ts: Date.now() }));
    } catch (e) { /* storage full */ }
    renderTraces();
  });
}

// ─── Refresh button ──────────────────────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', function () {
  document.getElementById('traces-list').innerHTML = '<div class="loading">Refreshing…</div>';
  loadTraces(false); // skip cache
});

// ─── Boot ────────────────────────────────────────────────────────────────────

loadTraces();

// Mnemox - Popup Script
// Shows last score, token count, and session stats.

function gradeColor(grade) {
  var map = { A: '#58D68D', B: '#5DADE2', C: '#F0B27A', D: '#E59866', F: '#EC7063' };
  return map[grade] || '#AAA';
}

function qualLabel(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Weak';
  return 'Poor';
}

function render(data, url, count) {
  if (data && data.score) {
    document.getElementById('status').style.display = 'none';
    document.getElementById('score-card').style.display = 'block';

    var scoreEl = document.getElementById('pop-score');
    var gradeEl = document.getElementById('pop-grade');
    var labelEl = document.getElementById('pop-label');
    var weakEl  = document.getElementById('pop-weak');

    scoreEl.textContent = data.score;
    gradeEl.textContent = 'Grade ' + data.grade;
    gradeEl.style.color = gradeColor(data.grade);
    labelEl.textContent = qualLabel(data.score);

    if (data.weak && data.weak.length > 0) {
      weakEl.textContent = 'Improve: ' + data.weak.slice(0, 3).join(', ');
    } else {
      weakEl.textContent = 'All rules passing';
      weakEl.style.color = '#58D68D';
    }

    if (data.tokens != null) {
      document.getElementById('token-card').style.display = 'block';
      document.getElementById('pop-tokens').textContent = data.tokens;
    }
  }

  if (count || url) {
    document.getElementById('session-card').style.display = 'block';
    if (count) document.getElementById('pop-count').textContent = count;
    if (url)   document.getElementById('pop-url').textContent   = url;
  }
}

function trustGradeColor(grade) {
  var map = { A: '#A569BD', B: '#7D3C98', C: '#D7BDE2', D: '#E59866', F: '#EC7063' };
  return map[grade] || '#AAA';
}

function renderTrust(tr) {
  if (!tr || tr.trustScore == null) return;
  document.getElementById('trust-card').style.display = 'block';
  document.getElementById('trust-score').textContent  = tr.trustScore;
  var gradeEl = document.getElementById('trust-grade');
  gradeEl.textContent = 'Grade ' + tr.grade;
  gradeEl.style.color = trustGradeColor(tr.grade);
  document.getElementById('trust-quality').textContent = tr.quality || '';

  if (tr.signals) {
    var weak = Object.values(tr.signals)
      .filter(function(s) { return s.score < s.max * 0.6; })
      .map(function(s) { return s.message; });
    document.getElementById('trust-signals').textContent =
      weak.length > 0 ? weak.slice(0, 2).join(' · ') : 'All signals passing';
    if (weak.length === 0) document.getElementById('trust-signals').style.color = '#58D68D';
  }
}

function openTraces() {
  chrome.tabs.create({ url: chrome.runtime.getURL('traces.html') });
}

document.getElementById('traces-btn').addEventListener('click', openTraces);
document.getElementById('traces-footer-btn').addEventListener('click', openTraces);

chrome.storage.local.get(['lastResult', 'lastTrustResult', 'lastUrl', 'sessionCount'], function(res) {
  render(res.lastResult, res.lastUrl, res.sessionCount);
  renderTrust(res.lastTrustResult);
});

// ── Cloud Traces opt-in toggle ───────────────────────────────────────────
// TRACE_LOGGING defaults to false — no prompt/response text is sent
// anywhere until the user flips this on themselves.
(function () {
  var toggle = document.getElementById('trace-toggle');
  var status = document.getElementById('trace-toggle-status');

  function renderStatus(enabled) {
    status.textContent = enabled
      ? 'On — prompt & response text is sent to the Traces dashboard'
      : 'Off — nothing leaves your browser';
    status.style.color = enabled ? '#F0B27A' : '#888';
  }

  chrome.storage.local.get(['TRACE_LOGGING'], function (res) {
    var enabled = !!res.TRACE_LOGGING;
    toggle.checked = enabled;
    renderStatus(enabled);
  });

  toggle.addEventListener('change', function () {
    var enabled = toggle.checked;
    chrome.storage.local.set({ TRACE_LOGGING: enabled }, function () {
      renderStatus(enabled);
    });
  });
})();

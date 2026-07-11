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

// Settings toggles for the two opt-in, off-by-default flags (TRACE_LOGGING,
// MEMORY_CONSISTENCY — see background.js FLAG_DEFAULTS). Neither had any UI
// before this; the only way to change them was editing chrome.storage.local
// directly, which meant "opt-in" wasn't actually reachable by users.
function bindFlagToggle(elId, flagKey, defaultValue) {
  var el = document.getElementById(elId);
  if (!el) return;
  chrome.storage.local.get([flagKey], function (res) {
    el.checked = flagKey in res ? !!res[flagKey] : defaultValue;
  });
  el.addEventListener('change', function () {
    var val = {};
    val[flagKey] = el.checked;
    chrome.storage.local.set(val);
  });
}

bindFlagToggle('toggle-trace-logging', 'TRACE_LOGGING', false);
bindFlagToggle('toggle-memory-consistency', 'MEMORY_CONSISTENCY', false);

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

chrome.storage.local.get(['lastResult', 'lastUrl', 'sessionCount'], function(res) {
  render(res.lastResult, res.lastUrl, res.sessionCount);
});

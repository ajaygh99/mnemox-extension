// Mnemox — Score Badge UI
// Injects a floating badge into any page showing the prompt score.
// Zero dependencies. Scoped CSS — cannot affect the host page styles.

var MnemoxBadge = (function () {
  var BADGE_ID = 'mnemox-score-badge';

  function getColor(score) {
    if (score >= 85) return { bg: '#1A5E35', text: '#FFFFFF', label: 'Excellent' };
    if (score >= 70) return { bg: '#2C5F8A', text: '#FFFFFF', label: 'Good' };
    if (score >= 55) return { bg: '#D68910', text: '#FFFFFF', label: 'Fair' };
    if (score >= 40) return { bg: '#BA4A00', text: '#FFFFFF', label: 'Weak' };
    return { bg: '#922B21', text: '#FFFFFF', label: 'Poor' };
  }

  function inject() {
    if (document.getElementById(BADGE_ID)) return;

    var badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.setAttribute('style', [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483647',
      'font-family:Arial,sans-serif',
      'font-size:13px',
      'background:#1A2B4A',
      'color:#FFFFFF',
      'border-radius:10px',
      'padding:10px 14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'min-width:140px',
      'cursor:pointer',
      'transition:opacity 0.3s',
      'opacity:0.95',
      'pointer-events:auto',
    ].join(';'));

    badge.innerHTML = [
      '<div style="font-size:11px;opacity:0.7;margin-bottom:4px;letter-spacing:0.5px;">MNEMOX</div>',
      '<div id="mnemox-score-line" style="display:flex;align-items:center;gap:8px;">',
      '  <span id="mnemox-score-num" style="font-size:22px;font-weight:bold;">--</span>',
      '  <div>',
      '    <div id="mnemox-grade" style="font-size:11px;font-weight:bold;"></div>',
      '    <div id="mnemox-label" style="font-size:10px;opacity:0.8;"></div>',
      '  </div>',
      '</div>',
      '<div id="mnemox-weak" style="font-size:10px;margin-top:6px;opacity:0.75;line-height:1.4;"></div>',
    ].join('');

    // Minimize on click
    badge.addEventListener('click', function () {
      var weak = document.getElementById('mnemox-weak');
      var line = document.getElementById('mnemox-score-line');
      if (weak) weak.style.display = weak.style.display === 'none' ? 'block' : 'none';
    });

    document.body.appendChild(badge);
  }

  function update(result) {
    inject();
    if (!result || result.empty) return;

    var color = getColor(result.score);
    var badge = document.getElementById(BADGE_ID);
    if (!badge) return;

    badge.style.background = color.bg;

    var numEl   = document.getElementById('mnemox-score-num');
    var gradeEl = document.getElementById('mnemox-grade');
    var labelEl = document.getElementById('mnemox-label');
    var weakEl  = document.getElementById('mnemox-weak');

    if (numEl)   numEl.textContent   = result.score;
    if (gradeEl) gradeEl.textContent = 'Grade ' + result.grade;
    if (labelEl) labelEl.textContent = color.label;
    if (weakEl)  weakEl.textContent  = result.weak && result.weak.length > 0
      ? 'Improve: ' + result.weak.slice(0, 3).join(', ')
      : 'All rules passing';
  }

  function hide() {
    var badge = document.getElementById(BADGE_ID);
    if (badge) badge.style.opacity = '0';
  }

  function show() {
    var badge = document.getElementById(BADGE_ID);
    if (badge) badge.style.opacity = '0.95';
  }

  return { inject: inject, update: update, hide: hide, show: show };
})();

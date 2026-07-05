// Mnemox - Score Badge UI
// Floating badge showing prompt score + token count.
// Click opens the Coaching Panel.

var MnemoxBadge = (function () {
  var BADGE_ID = 'mnemox-score-badge';

  function getColor(score) {
    if (score >= 85) return { bg: '#1A5E35', text: '#FFFFFF', label: 'Excellent' };
    if (score >= 70) return { bg: '#2C5F8A', text: '#FFFFFF', label: 'Good' };
    if (score >= 55) return { bg: '#D68910', text: '#FFFFFF', label: 'Fair' };
    if (score >= 40) return { bg: '#BA4A00', text: '#FFFFFF', label: 'Weak' };
    return { bg: '#922B21', text: '#FFFFFF', label: 'Poor' };
  }

  // Small DOM-builder helper — used instead of innerHTML so this survives
  // strict CSP / Trusted Types policies. Bug fixed 2026-07-05: Gemini
  // enforces Trusted Types, which throws on any `el.innerHTML = "<string>"`
  // assignment. That throw happened inside inject(), which is called at the
  // top of update() — so the exception aborted the ENTIRE scoring handler in
  // pageWorld.js before it could even post the result back to content.js.
  // Net effect: no badge AND no popup score, on Gemini only (other platforms
  // don't enforce Trusted Types, so it was invisible there).
  function mk(tag, style, id, text) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (style) e.setAttribute('style', style);
    if (text != null) e.textContent = text;
    return e;
  }

  function inject() {
    if (document.getElementById(BADGE_ID)) return;

    var badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.setAttribute('style', [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'font-family:Arial,sans-serif', 'font-size:13px', 'background:#1A2B4A',
      'color:#FFFFFF', 'border-radius:10px', 'padding:10px 14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)', 'min-width:140px',
      'cursor:pointer', 'transition:opacity 0.3s', 'opacity:0.95',
      'pointer-events:auto'
    ].join(';'));

    badge.appendChild(mk('div', 'font-size:11px;opacity:0.7;margin-bottom:4px;letter-spacing:0.5px;', null, 'MNEMOX'));

    var scoreLine = mk('div', 'display:flex;align-items:center;gap:8px;', 'mnemox-score-line');
    var scoreNum  = mk('span', 'font-size:22px;font-weight:bold;', 'mnemox-score-num', '--');
    var infoBox   = document.createElement('div');
    infoBox.appendChild(mk('div', 'font-size:11px;font-weight:bold;', 'mnemox-grade'));
    infoBox.appendChild(mk('div', 'font-size:10px;opacity:0.8;', 'mnemox-label'));
    scoreLine.appendChild(scoreNum);
    scoreLine.appendChild(infoBox);
    badge.appendChild(scoreLine);

    badge.appendChild(mk('div', 'font-size:10px;margin-top:4px;opacity:0.7;', 'mnemox-tokens'));
    badge.appendChild(mk('div', 'font-size:9px;margin-top:5px;opacity:0.5;', null, 'Click for details'));

    badge.addEventListener('click', function () {
      if (typeof MnemoxCoach !== 'undefined') {
        MnemoxCoach.toggle(window._mnemoxLastResult);
      }
    });

    document.body.appendChild(badge);
  }

  function update(result) {
    window._mnemoxLastResult = result;
    inject();
    if (!result || result.empty) return;

    var color = getColor(result.score);
    var badge = document.getElementById(BADGE_ID);
    if (!badge) return;

    badge.style.background = color.bg;

    var numEl    = document.getElementById('mnemox-score-num');
    var gradeEl  = document.getElementById('mnemox-grade');
    var labelEl  = document.getElementById('mnemox-label');
    var tokensEl = document.getElementById('mnemox-tokens');

    if (numEl)   numEl.textContent   = result.score;
    if (gradeEl) gradeEl.textContent = 'Grade ' + result.grade;
    if (labelEl) labelEl.textContent = color.label;
    if (tokensEl && result.tokens != null) {
      tokensEl.textContent = '~' + result.tokens + ' tokens';
    }

    if (typeof MnemoxCoach !== 'undefined') {
      MnemoxCoach.update(result);
    }
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

// Auto-inject so the badge is always visible on supported pages.
// Restore last cached score so badge isn't blank after SPA navigation.
MnemoxBadge.inject();
(function () {
  try {
    var cached = localStorage.getItem('__mnemox_last_result');
    if (cached) MnemoxBadge.update(JSON.parse(cached));
  } catch (e) {}
})();

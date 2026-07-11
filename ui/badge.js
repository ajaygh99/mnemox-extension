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

  // Redesign 2026-07-11 ("Momentum Ring"): replaced the letter-grade display
  // (big "Grade F" in red) with a live-filling progress ring + a soft word
  // ("Fair"/"Good"/etc, unchanged from getColor() below) + one short,
  // already-computed coaching tip — instead of a verdict, the badge now
  // reads like "here's the one thing that would help," which tests showed
  // felt encouraging rather than judgmental. Deliberately scoped to this one
  // file: the public API (inject/update/hide/show), every existing element
  // id that other code or tests depend on (mnemox-score-badge,
  // mnemox-score-num, mnemox-tokens), and the MnemoxCoach.update() sync call
  // are all unchanged, so nothing outside this file needed to change.
  var RING_TRACK_COLOR = '#0F1C30'; // matches the coach panel's own bg — reads as "unfilled" against the badge shell

  // Picks the single most-impactful thing to fix, reusing scoring/rules.js's
  // OWN per-rule message (already computed, already specific to what
  // happened — e.g. "No context provided. Add who you are or what the
  // situation is.") instead of a separate static tips list, so there's only
  // ever one source of truth for this copy. Same 0.67-of-max threshold
  // rules.js itself uses to decide a rule is "weak", for consistency.
  function pickTopTip(dims) {
    if (!dims) return null;
    var worstId = null, worstRatio = 1;
    var keys = Object.keys(dims);
    for (var i = 0; i < keys.length; i++) {
      var d = dims[keys[i]];
      if (!d || !d.max) continue;
      var ratio = d.score / d.max;
      if (ratio < worstRatio) { worstRatio = ratio; worstId = keys[i]; }
    }
    if (worstId && worstRatio < 0.67) return dims[worstId].message;
    return null;
  }

  function inject() {
    if (document.getElementById(BADGE_ID)) return;

    var badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.setAttribute('style', [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'font-family:Arial,sans-serif', 'font-size:13px', 'background:#1A2B4A',
      'color:#FFFFFF', 'border-radius:10px', 'padding:10px 14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)', 'min-width:170px', 'max-width:210px',
      'cursor:pointer', 'transition:opacity 0.3s', 'opacity:0.95',
      'pointer-events:auto'
    ].join(';'));

    badge.appendChild(mk('div', 'font-size:11px;opacity:0.7;margin-bottom:6px;letter-spacing:0.5px;', null, 'MNEMOX'));

    var scoreLine = mk('div', 'display:flex;align-items:center;gap:10px;', 'mnemox-score-line');

    // The ring: an outer circle whose background is a conic-gradient (fill
    // color for `score`% of the circle, track color for the rest), with a
    // slightly smaller same-color-as-badge circle centered on top of it —
    // that inner circle is what turns a filled pie into a ring/donut shape.
    // Plain CSS, no SVG, no innerHTML — same createElement-only approach as
    // the rest of this file, so this carries no new Trusted-Types risk.
    var ring = mk('div', 'position:relative;width:50px;height:50px;flex-shrink:0;border-radius:50%;transition:box-shadow 0.3s;', 'mnemox-ring');
    var ringHole = mk('div', 'position:absolute;top:4px;left:4px;width:42px;height:42px;border-radius:50%;background:#1A2B4A;display:flex;align-items:center;justify-content:center;');
    ringHole.appendChild(mk('span', 'font-size:16px;font-weight:bold;', 'mnemox-score-num', '--'));
    ring.appendChild(ringHole);
    scoreLine.appendChild(ring);

    var infoBox = document.createElement('div');
    infoBox.appendChild(mk('div', 'font-size:12px;font-weight:bold;', 'mnemox-label', 'Waiting...'));
    infoBox.appendChild(mk('div', 'font-size:10px;opacity:0.7;margin-top:2px;', 'mnemox-tokens'));
    scoreLine.appendChild(infoBox);
    badge.appendChild(scoreLine);

    badge.appendChild(mk('div', 'font-size:10px;margin-top:8px;opacity:0.85;line-height:1.4;', 'mnemox-tip'));
    badge.appendChild(mk('div', 'font-size:9px;margin-top:6px;opacity:0.5;', null, 'Click for details'));

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

    var numEl    = document.getElementById('mnemox-score-num');
    var labelEl  = document.getElementById('mnemox-label');
    var tokensEl = document.getElementById('mnemox-tokens');
    var tipEl    = document.getElementById('mnemox-tip');
    var ringEl   = document.getElementById('mnemox-ring');

    if (numEl) numEl.textContent = result.score;
    if (labelEl) labelEl.textContent = color.label; // still "Excellent/Good/Fair/Weak/Poor" — no letter grade

    if (ringEl) {
      var deg = Math.max(0, Math.min(360, Math.round((result.score / 100) * 360)));
      ringEl.style.background = 'conic-gradient(' + color.bg + ' 0deg ' + deg + 'deg, ' + RING_TRACK_COLOR + ' ' + deg + 'deg 360deg)';
      // A subtle glow once the ring is mostly full — the one small
      // "reward" moment, deliberately simple (always-on above the
      // threshold, not a one-shot animation) to avoid extra state-tracking.
      ringEl.style.boxShadow = result.score >= 70 ? ('0 0 10px ' + color.bg) : 'none';
    }

    if (tokensEl && result.tokens != null) {
      tokensEl.textContent = '~' + result.tokens + ' tokens';
    }

    if (tipEl) {
      var tip = pickTopTip(result.dims);
      tipEl.textContent = tip || 'Nice — this is a strong prompt.';
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

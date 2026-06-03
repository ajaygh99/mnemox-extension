// Mnemox - Prompt Coaching Panel
// Sliding side panel: rule breakdown, tips, and improved prompt suggestion.

var MnemoxCoach = (function () {
  var PANEL_ID = 'mnemox-coach-panel';
  var OVERLAY_ID = 'mnemox-coach-overlay';

  var RULE_TIPS = {
    R1: 'Add a role (e.g. "You are a senior developer...")',
    R2: 'State your task with a clear action verb',
    R3: 'Add context or background details',
    R4: 'Specify output format (table, JSON, bullet points...)',
    R5: 'Define the target audience or reading level',
    R6: 'Add more detail - short prompts get vague responses',
    R7: 'Set constraints (e.g. "under 200 words", "Python only")',
    R8: 'Use specific language, avoid vague phrases'
  };

  var RULE_NAMES = {
    R1: 'Role / Persona',
    R2: 'Clear Task',
    R3: 'Context',
    R4: 'Output Format',
    R5: 'Audience',
    R6: 'Detail Level',
    R7: 'Constraints',
    R8: 'Specificity'
  };

  function getBarColor(score) {
    if (score >= 85) return '#58D68D';
    if (score >= 70) return '#5DADE2';
    if (score >= 55) return '#F0B27A';
    if (score >= 40) return '#E59866';
    return '#EC7063';
  }

  function inject() {
    if (document.getElementById(PANEL_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('style', [
      'position:fixed','top:0','left:0','width:100%','height:100%',
      'z-index:2147483646','background:rgba(0,0,0,0.4)',
      'display:none','cursor:pointer'
    ].join(';'));
    overlay.addEventListener('click', hide);
    document.body.appendChild(overlay);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('style', [
      'position:fixed','top:0','right:-360px','width:340px','height:100%',
      'z-index:2147483647','background:#0F1C30','color:#FFFFFF',
      'font-family:Arial,sans-serif','font-size:13px',
      'box-shadow:-4px 0 20px rgba(0,0,0,0.5)',
      'transition:right 0.3s ease','overflow-y:auto','padding:20px'
    ].join(';'));

    panel.innerHTML = [
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
      '  <span style="font-size:15px;font-weight:bold;color:#5DADE2;letter-spacing:1px;">MNEMOX</span>',
      '  <button id="mnemox-coach-close" style="background:none;border:none;color:#AAA;font-size:18px;cursor:pointer;">x</button>',
      '</div>',
      '<div id="mnemox-coach-summary" style="background:#1A2B4A;border-radius:8px;padding:12px;margin-bottom:16px;">',
      '  <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Prompt Score</div>',
      '  <div style="display:flex;align-items:center;gap:12px;">',
      '    <span id="mnemox-coach-score" style="font-size:36px;font-weight:bold;color:#5DADE2;">--</span>',
      '    <div>',
      '      <div id="mnemox-coach-grade" style="font-size:14px;font-weight:bold;"></div>',
      '      <div id="mnemox-coach-tokens" style="font-size:11px;color:#AAA;margin-top:2px;"></div>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div style="font-size:10px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Rule Breakdown</div>',
      '<div id="mnemox-coach-rules"></div>',
      '<div id="mnemox-coach-tips" style="margin-top:16px;"></div>',
      '<div id="mnemox-coach-suggestion" style="margin-top:16px;display:none;">',
      '  <div style="font-size:10px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Improved Prompt</div>',
      '  <div id="mnemox-coach-suggestion-text" style="background:#1A2B4A;border-radius:6px;padding:10px;font-size:11px;color:#D5F5E3;line-height:1.6;white-space:pre-wrap;word-break:break-word;"></div>',
      '  <button id="mnemox-coach-copy" style="margin-top:8px;width:100%;background:#1A5E35;border:none;color:#FFFFFF;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">Copy Improved Prompt</button>',
      '</div>'
    ].join('');

    document.body.appendChild(panel);

    document.getElementById('mnemox-coach-close').addEventListener('click', hide);
  }

  function renderRules(dims, weak) {
    var rulesEl = document.getElementById('mnemox-coach-rules');
    var tipsEl  = document.getElementById('mnemox-coach-tips');
    if (!rulesEl) return;

    var keys = Object.keys(dims);
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var id   = keys[i];
      var dim  = dims[id];
      var name = (dim && dim.name) ? dim.name : (RULE_NAMES[id] || id);
      var pct  = (dim && dim.max) ? Math.round((dim.score / dim.max) * 100) : Math.round(dim * 100);
      var color = getBarColor(pct);
      var isWeak = weak && weak.indexOf(name) >= 0;
      html += '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">' +
        '<span style="color:' + (isWeak ? '#F0B27A' : '#CCC') + ';">' + name + (isWeak ? ' *' : '') + '</span>' +
        '<span style="color:' + color + ';">' + pct + '%</span></div>' +
        '<div style="background:#1A2B4A;border-radius:4px;height:6px;">' +
        '<div style="background:' + color + ';width:' + pct + '%;height:6px;border-radius:4px;transition:width 0.4s;"></div>' +
        '</div></div>';
    }
    rulesEl.innerHTML = html;

    var tipsHtml = '';
    if (weak && weak.length > 0) {
      tipsHtml += '<div style="font-size:10px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">How to Improve</div>';
      for (var j = 0; j < keys.length; j++) {
        var rid = keys[j];
        if (weak.indexOf(RULE_NAMES[rid]) >= 0 && RULE_TIPS[rid]) {
          tipsHtml += '<div style="background:#1A2B4A;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#F0B27A;line-height:1.5;">' + RULE_TIPS[rid] + '</div>';
        }
      }
    }
    tipsEl.innerHTML = tipsHtml;
  }

  function renderSuggestion(suggestion) {
    var el     = document.getElementById('mnemox-coach-suggestion');
    var textEl = document.getElementById('mnemox-coach-suggestion-text');
    var copyEl = document.getElementById('mnemox-coach-copy');
    if (!el || !textEl) return;

    if (suggestion) {
      el.style.display = 'block';
      textEl.textContent = suggestion;
      if (copyEl) {
        copyEl.onclick = function () {
          navigator.clipboard.writeText(suggestion).then(function () {
            copyEl.textContent = 'Copied!';
            setTimeout(function () { copyEl.textContent = 'Copy Improved Prompt'; }, 2000);
          });
        };
      }
    } else {
      el.style.display = 'none';
    }
  }

  function update(result) {
    inject();
    if (!result || result.empty) return;

    var scoreEl  = document.getElementById('mnemox-coach-score');
    var gradeEl  = document.getElementById('mnemox-coach-grade');
    var tokensEl = document.getElementById('mnemox-coach-tokens');

    if (scoreEl) scoreEl.textContent = result.score;
    if (gradeEl) {
      gradeEl.textContent = 'Grade ' + result.grade;
      gradeEl.style.color = getBarColor(result.score);
    }
    if (tokensEl && result.tokens != null) {
      tokensEl.textContent = '~' + result.tokens + ' tokens';
    }
    if (result.dims) renderRules(result.dims, result.weak);
    renderSuggestion(result.suggestion || null);
  }

  function show(result) {
    inject();
    if (result) update(result);
    var panel   = document.getElementById(PANEL_ID);
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = 'block';
    if (panel)   panel.style.right = '0px';
  }

  function hide() {
    var panel   = document.getElementById(PANEL_ID);
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = 'none';
    if (panel)   panel.style.right = '-360px';
  }

  function toggle(result) {
    var panel = document.getElementById(PANEL_ID);
    if (!panel || panel.style.right === '-360px' || panel.style.right === '') {
      show(result);
    } else {
      hide();
    }
  }

  return { inject: inject, update: update, show: show, hide: hide, toggle: toggle };
})();

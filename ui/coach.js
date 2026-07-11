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

  // Distinct purple scale for trust/response-quality grades — mirrors
  // popup.js's trustGradeColor so the two surfaces read consistently.
  function getTrustGradeColor(grade) {
    var map = { A: '#A569BD', B: '#7D3C98', C: '#D7BDE2', D: '#E59866', F: '#EC7063' };
    return map[grade] || '#AAA';
  }

  // Small DOM-builder helper — used instead of innerHTML so this survives
  // strict CSP / Trusted Types policies (e.g. Gemini). See ui/badge.js for
  // the full explanation — bug fixed 2026-07-05.
  function mk(tag, style, id, text) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (style) e.setAttribute('style', style);
    if (text != null) e.textContent = text;
    return e;
  }

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
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

    var headerRow = mk('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;');
    headerRow.appendChild(mk('span', 'font-size:15px;font-weight:bold;color:#5DADE2;letter-spacing:1px;', null, 'MNEMOX'));
    headerRow.appendChild(mk('button', 'background:none;border:none;color:#AAA;font-size:18px;cursor:pointer;', 'mnemox-coach-close', 'x'));
    panel.appendChild(headerRow);

    var summary = mk('div', 'background:#1A2B4A;border-radius:8px;padding:12px;margin-bottom:16px;', 'mnemox-coach-summary');
    summary.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;', null, 'Prompt Score'));
    var scoreRow = mk('div', 'display:flex;align-items:center;gap:12px;');
    var scoreInfo = document.createElement('div');
    scoreInfo.appendChild(mk('div', 'font-size:14px;font-weight:bold;', 'mnemox-coach-grade'));
    scoreInfo.appendChild(mk('div', 'font-size:11px;color:#AAA;margin-top:2px;', 'mnemox-coach-tokens'));
    scoreRow.appendChild(mk('span', 'font-size:36px;font-weight:bold;color:#5DADE2;', 'mnemox-coach-score', '--'));
    scoreRow.appendChild(scoreInfo);
    summary.appendChild(scoreRow);
    panel.appendChild(summary);

    panel.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;', null, 'Rule Breakdown'));
    panel.appendChild(mk('div', null, 'mnemox-coach-rules'));
    panel.appendChild(mk('div', 'margin-top:16px;', 'mnemox-coach-tips'));

    var suggestionBox = mk('div', 'margin-top:16px;display:none;', 'mnemox-coach-suggestion');
    suggestionBox.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;', null, 'Improved Prompt'));
    suggestionBox.appendChild(mk('div', 'background:#1A2B4A;border-radius:6px;padding:10px;font-size:11px;color:#D5F5E3;line-height:1.6;white-space:pre-wrap;word-break:break-word;', 'mnemox-coach-suggestion-text'));
    suggestionBox.appendChild(mk('button', 'margin-top:8px;width:100%;background:#1A5E35;border:none;color:#FFFFFF;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;', 'mnemox-coach-copy', 'Copy Improved Prompt'));
    panel.appendChild(suggestionBox);

    // ── Step 5: Response Quality (MnemoxTrust) — hidden until the first AI
    // response on the page has been scored. Was previously computed but
    // only ever shown in the popup, never here.
    var trustSection = mk('div', 'margin-top:20px;display:none;border-top:1px solid #1A2B4A;padding-top:16px;', 'mnemox-coach-trust-section');
    trustSection.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;', null, 'Response Quality (MnemoxTrust)'));

    var trustSummary = mk('div', 'background:#1A2B4A;border-radius:8px;padding:12px;margin-bottom:10px;');
    var trustScoreRow = mk('div', 'display:flex;align-items:center;gap:12px;');
    var trustInfo = document.createElement('div');
    trustInfo.appendChild(mk('div', 'font-size:14px;font-weight:bold;', 'mnemox-coach-trust-grade'));
    trustInfo.appendChild(mk('div', 'font-size:11px;color:#AAA;margin-top:2px;', 'mnemox-coach-trust-quality'));
    trustScoreRow.appendChild(mk('span', 'font-size:30px;font-weight:bold;color:#A569BD;', 'mnemox-coach-trust-score', '--'));
    trustScoreRow.appendChild(trustInfo);
    trustSummary.appendChild(trustScoreRow);
    trustSection.appendChild(trustSummary);
    trustSection.appendChild(mk('div', null, 'mnemox-coach-trust-signals'));

    // Optional — only populated when the user has MEMORY_CONSISTENCY on.
    var alignBox = mk('div', 'margin-top:10px;display:none;background:#1A2B4A;border-radius:6px;padding:10px;font-size:11px;color:#D5F5E3;line-height:1.5;', 'mnemox-coach-memory-alignment');
    trustSection.appendChild(alignBox);

    panel.appendChild(trustSection);

    document.body.appendChild(panel);

    document.getElementById('mnemox-coach-close').addEventListener('click', hide);
  }

  function renderRules(dims, weak) {
    var rulesEl = document.getElementById('mnemox-coach-rules');
    var tipsEl  = document.getElementById('mnemox-coach-tips');
    if (!rulesEl) return;

    var keys = Object.keys(dims);
    clearEl(rulesEl);

    for (var i = 0; i < keys.length; i++) {
      var id   = keys[i];
      var dim  = dims[id];
      var name = (dim && dim.name) ? dim.name : (RULE_NAMES[id] || id);
      var pct  = (dim && dim.max) ? Math.round((dim.score / dim.max) * 100) : Math.round(dim * 100);
      var color = getBarColor(pct);
      var isWeak = weak && weak.indexOf(name) >= 0;

      var row = mk('div', 'margin-bottom:10px;');
      var labelRow = mk('div', 'display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;');
      labelRow.appendChild(mk('span', 'color:' + (isWeak ? '#F0B27A' : '#CCC') + ';', null, name + (isWeak ? ' *' : '')));
      labelRow.appendChild(mk('span', 'color:' + color + ';', null, pct + '%'));

      var barTrack = mk('div', 'background:#1A2B4A;border-radius:4px;height:6px;');
      barTrack.appendChild(mk('div', 'background:' + color + ';width:' + pct + '%;height:6px;border-radius:4px;transition:width 0.4s;'));

      row.appendChild(labelRow);
      row.appendChild(barTrack);
      rulesEl.appendChild(row);
    }

    clearEl(tipsEl);
    if (weak && weak.length > 0) {
      tipsEl.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;', null, 'How to Improve'));
      for (var j = 0; j < keys.length; j++) {
        var rid = keys[j];
        if (weak.indexOf(RULE_NAMES[rid]) >= 0 && RULE_TIPS[rid]) {
          tipsEl.appendChild(mk('div', 'background:#1A2B4A;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#F0B27A;line-height:1.5;', null, RULE_TIPS[rid]));
        }
      }
    }
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
            // Perf audit 2026-07-11: intentionally NOT cut to 99% (~20ms).
            // This isn't a performance delay — it's a human-readable
            // confirmation duration. Trimmed 2000ms -> 1000ms, which stays
            // comfortably readable while still feeling snappier.
            setTimeout(function () { copyEl.textContent = 'Copy Improved Prompt'; }, 1000);
          });
        };
      }
    } else {
      el.style.display = 'none';
    }
  }

  function renderTrustSignals(signals) {
    var el = document.getElementById('mnemox-coach-trust-signals');
    if (!el || !signals) return;
    clearEl(el);

    var keys = Object.keys(signals);
    for (var i = 0; i < keys.length; i++) {
      var sig = signals[keys[i]];
      var pct = (sig && sig.max) ? Math.round((sig.score / sig.max) * 100) : 0;
      var color = getBarColor(pct);

      var row = mk('div', 'margin-bottom:8px;');
      var labelRow = mk('div', 'display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;');
      labelRow.appendChild(mk('span', 'color:#CCC;text-transform:capitalize;', null, keys[i]));
      labelRow.appendChild(mk('span', 'color:' + color + ';', null, pct + '%'));

      var barTrack = mk('div', 'background:#0F1C30;border-radius:4px;height:5px;');
      barTrack.appendChild(mk('div', 'background:' + color + ';width:' + pct + '%;height:5px;border-radius:4px;'));

      row.appendChild(labelRow);
      row.appendChild(barTrack);
      row.appendChild(mk('div', 'font-size:10px;color:#888;margin-top:2px;', null, (sig && sig.message) || ''));
      el.appendChild(row);
    }
  }

  // Step 5 (MnemoxTrust) — renders the AAA response-quality score computed
  // by scoring/trust.js. Called from ui/pageWorld.js whenever a
  // MNEMOX_TRUST_RESULT arrives; independent of update() above, which only
  // ever handles the prompt score.
  function updateTrust(tr) {
    inject();
    if (!tr || tr.trustScore == null) return;

    var section = document.getElementById('mnemox-coach-trust-section');
    var scoreEl = document.getElementById('mnemox-coach-trust-score');
    var gradeEl = document.getElementById('mnemox-coach-trust-grade');
    var qualEl  = document.getElementById('mnemox-coach-trust-quality');

    if (section) section.style.display = 'block';
    if (scoreEl) scoreEl.textContent = tr.trustScore;
    if (gradeEl) {
      gradeEl.textContent = 'Grade ' + tr.grade;
      gradeEl.style.color = getTrustGradeColor(tr.grade);
    }
    if (qualEl) qualEl.textContent = tr.quality || '';
    if (tr.signals) renderTrustSignals(tr.signals);
  }

  // Optional Step 5 signal — only ever called when the user has turned on
  // MEMORY_CONSISTENCY (opt-in, off by default; see background.js). Kept
  // deliberately separate from the local trustScore/signals above: vector
  // similarity to saved memories is a much softer, honesty-scoped signal
  // (per the master plan's own "no over-promising" rule) and shouldn't be
  // silently folded into a number that's otherwise 100% locally computed.
  function updateMemoryAlignment(ma) {
    var box = document.getElementById('mnemox-coach-memory-alignment');
    if (!box) return;

    if (!ma || !ma.enabled) { box.style.display = 'none'; return; }

    box.style.display = 'block';
    clearEl(box);
    box.appendChild(mk('div', 'font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;', null, 'Memory Alignment'));

    if (!ma.available) {
      box.appendChild(mk('div', null, null, 'No related memories found to compare against.'));
      return;
    }

    var pct = ma.avgSimilarity != null ? Math.round(ma.avgSimilarity * 100) : null;
    var memWord = ma.count === 1 ? 'memory' : 'memories';
    var msg = pct == null
      ? ma.count + ' related ' + memWord + ' found.'
      : pct >= 70
        ? 'Consistent with ' + ma.count + ' saved ' + memWord + ' (' + pct + '% similarity).'
        : 'Only ' + pct + '% similarity to ' + ma.count + ' related ' + memWord + ' — may diverge from saved context.';
    box.appendChild(mk('div', null, null, msg));
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

  return {
    inject: inject, update: update, show: show, hide: hide, toggle: toggle,
    updateTrust: updateTrust, updateMemoryAlignment: updateMemoryAlignment
  };
})();

// Restore the last response-quality score after a hard refresh (same idea
// as ui/badge.js's own restore block for the prompt score, just for
// trust — the panel would otherwise show "--" until the next AI response).
(function () {
  try {
    var cachedTrust = localStorage.getItem('__mnemox_last_trust_result');
    if (cachedTrust && typeof MnemoxCoach !== 'undefined') {
      MnemoxCoach.updateTrust(JSON.parse(cachedTrust));
    }
  } catch (e) {}
})();

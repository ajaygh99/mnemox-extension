// Mnemox - AI Response Quality Scorer
// Scores AI responses on 4 linguistic signal dimensions.
// 100% local — no API calls, no network. Runs in <3ms.
// Output: trustScore 0-100, grade A-F, per-dimension breakdown.

(function () {
  'use strict';

  // Phrases that signal the AI is uncertain or hedging
  var HEDGES = [
    'i think', "i'm not sure", 'i believe', 'i am not sure',
    'i cannot be sure', 'i may be wrong', 'i might be wrong',
    'perhaps', 'maybe', 'possibly', 'probably', 'might',
    'it seems', 'it appears', 'it could be', 'as far as i know',
    'to my knowledge', 'i cannot guarantee', 'i am uncertain',
    'i cannot confirm', "i'm not certain", 'i cannot verify',
  ];

  // Signals that the response contains specific, concrete information
  var SPECIFICITY_SIGNALS = [
    /\b\d+(\.\d+)?%/,           // percentages
    /\b\d{4}\b/,                 // 4-digit numbers (years, etc.)
    /`[^`\n]+`/,                 // inline code
    /```[\s\S]+?```/,            // code blocks
    /^#+\s/m,                    // markdown headers
    /^\s*[-*]\s/m,               // bullet lists
    /^\s*\d+\.\s/m,              // numbered lists
    /according to/i,
    /research shows/i,
    /the answer is/i,
    /in fact/i,
    /specifically/i,
    /for example/i,
  ];

  // Words that signal contradictions or flip-flopping
  var PIVOT_RE = /\b(however|nevertheless|on the other hand|conversely|that said|but wait|actually,)\b/gi;

  function scoreResponse(text) {
    if (!text || text.trim().length === 0) {
      return {
        trustScore: 0, trustScoreNormalized: 0, grade: 'F',
        quality: 'No response', signals: {}
      };
    }

    var lower   = text.toLowerCase();
    var trimmed = text.trim();
    var words   = trimmed.split(/\s+/).filter(Boolean);
    var wc      = words.length;

    // ── R1: Hedging density (0-30 pts) ────────────────────────────────────────
    var hedgeCount = 0;
    for (var i = 0; i < HEDGES.length; i++) {
      var idx = 0;
      while ((idx = lower.indexOf(HEDGES[i], idx)) !== -1) { hedgeCount++; idx++; }
    }
    var density = wc > 0 ? hedgeCount / wc : 0;
    var r1 = density < 0.02 ? 30 : density < 0.05 ? 20 : density < 0.10 ? 10 : 0;
    var r1msg = hedgeCount === 0
      ? 'No hedging — confident response'
      : hedgeCount + ' hedge phrase(s) detected';

    // ── R2: Completeness (0-30 pts) ───────────────────────────────────────────
    var r2, r2msg;
    if (trimmed.length < 30) {
      r2 = 0; r2msg = 'Response too short';
    } else if (trimmed.endsWith('...') || trimmed.endsWith('\u2026')) {
      r2 = 5;  r2msg = 'Response appears truncated';
    } else if (/[.!?]$/.test(trimmed) || /```$/.test(trimmed)) {
      r2 = 30; r2msg = 'Response ends cleanly';
    } else if (wc > 30) {
      r2 = 20; r2msg = 'Substantial response, no closing punctuation';
    } else {
      r2 = 12; r2msg = 'Short response, may be incomplete';
    }

    // ── R3: Specificity (0-25 pts) ────────────────────────────────────────────
    var sigHits = SPECIFICITY_SIGNALS.filter(function (s) { return s.test(text); }).length;
    var r3 = sigHits === 0 ? 0 : sigHits === 1 ? 10 : sigHits <= 3 ? 18 : 25;
    var r3msg = sigHits === 0
      ? 'No concrete signals (numbers, code, examples)'
      : sigHits + ' specificity signal(s): numbers, code, or structure';

    // ── R4: Consistency (0-15 pts) ────────────────────────────────────────────
    var pivots = (text.match(PIVOT_RE) || []).length;
    var r4 = pivots === 0 ? 15 : pivots === 1 ? 12 : pivots === 2 ? 8 : pivots <= 4 ? 4 : 0;
    var r4msg = pivots === 0
      ? 'Consistent — no contradicting pivots'
      : pivots + ' contradiction pivot(s) found';

    // ── Final ─────────────────────────────────────────────────────────────────
    var total      = r1 + r2 + r3 + r4;
    var trustScore = Math.min(100, Math.round(total));
    var grade      = trustScore >= 80 ? 'A' : trustScore >= 65 ? 'B' : trustScore >= 50 ? 'C' : trustScore >= 35 ? 'D' : 'F';
    var quality    = trustScore >= 80 ? 'High confidence'
                   : trustScore >= 65 ? 'Good'
                   : trustScore >= 50 ? 'Fair'
                   : trustScore >= 35 ? 'Low confidence'
                   : 'Very uncertain';

    return {
      trustScore:           trustScore,
      trustScoreNormalized: parseFloat((trustScore / 100).toFixed(2)),
      grade:                grade,
      quality:              quality,
      hedgeCount:           hedgeCount,
      wordCount:            wc,
      signals: {
        hedging:      { score: r1, max: 30, message: r1msg },
        completeness: { score: r2, max: 30, message: r2msg },
        specificity:  { score: r3, max: 25, message: r3msg },
        consistency:  { score: r4, max: 15, message: r4msg },
      },
    };
  }

  // ── Message bridge — listens for content.js requests ────────────────────────
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type !== 'MNEMOX_TRUST_SCORE') return;

    var payload = event.data.payload;
    var result  = scoreResponse(payload.text);

    // Attach metadata from the response capture
    result.platform      = payload.platform;
    result.tokenEstimate = payload.tokenEstimate;
    result.completedAt   = payload.completedAt;
    result.url           = payload.url;
    // Bug fixed 2026-07-10: background.js's trace logger already reads
    // scored.text (see RESPONSE_SCORED handler) but this result object never
    // set it, so response_text was silently always null in every logged
    // trace. Also needed locally for the opt-in memory-consistency check.
    result.text          = payload.text;

    window.postMessage({ type: 'MNEMOX_TRUST_RESULT', result: result }, '*');
    console.log('[Mnemox] trust score:', result.trustScore, result.grade, '—', result.quality);
  });

  window.MnemoxTrust = { scoreResponse: scoreResponse };
  console.log('[Mnemox] trust scorer ready');
})();

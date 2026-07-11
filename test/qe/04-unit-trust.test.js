// QE Suite 04 — scoring/trust.js (AI response quality / MnemoxTrust scorer)
// This is the core of Step 5 — tests both the scoreResponse() math directly
// and the window.postMessage bridge that content.js talks to in production.

const { describe, it, expect } = require('./lib/framework');
const { loadTrust } = require('./lib/loaders');

module.exports = async function run() {
  const Trust = loadTrust();

  await describe('scoring/trust.js — scoreResponse()', async () => {

    await describe('empty / degenerate input', async () => {
      await it('empty string scores 0, grade F, "No response"', () => {
        const r = Trust.scoreResponse('');
        expect(r.trustScore).toBe(0);
        expect(r.grade).toBe('F');
        expect(r.quality).toBe('No response');
      });

      await it('whitespace-only string is treated as empty', () => {
        const r = Trust.scoreResponse('   \n\t  ');
        expect(r.trustScore).toBe(0);
      });

      await it('null/undefined input does not throw', () => {
        expect(Trust.scoreResponse(null).trustScore).toBe(0);
        expect(Trust.scoreResponse(undefined).trustScore).toBe(0);
      });
    });

    await describe('R1 Hedging density (0-30 pts)', async () => {
      await it('zero hedge phrases scores the full 30 points', () => {
        const r = Trust.scoreResponse('The capital of France is Paris. It has a population of over two million people within the city proper.');
        expect(r.signals.hedging.score).toBe(30);
      });

      await it('a single hedge phrase in a long response barely dents the score (density < 2%)', () => {
        const text = 'This is a confident, detailed, and thorough answer. '.repeat(20) + 'I think that covers it.';
        const r = Trust.scoreResponse(text);
        expect(r.signals.hedging.score).toBe(30);
      });

      await it('heavy hedging (density >= 10%) scores 0 for this dimension', () => {
        const r = Trust.scoreResponse('maybe it is possibly this or perhaps that, i am not sure, it could be, it seems');
        expect(r.signals.hedging.score).toBe(0);
      });

      await it('hedgeCount is reported and matches actual phrase occurrences', () => {
        const r = Trust.scoreResponse('I think this works, but I am not sure, and it might be wrong.');
        expect(r.hedgeCount).toBeGreaterThanOrEqual(3);
      });
    });

    await describe('R2 Completeness (0-30 pts)', async () => {
      await it('very short response (<30 chars) scores 0', () => {
        const r = Trust.scoreResponse('Yes.');
        expect(r.signals.completeness.score).toBe(0);
      });

      await it('response ending in clean punctuation scores the full 30', () => {
        const r = Trust.scoreResponse('The answer is 42, and here is a complete explanation of why that is the case.');
        expect(r.signals.completeness.score).toBe(30);
      });

      await it('a response ending in a closed code fence scores the full 30', () => {
        const r = Trust.scoreResponse('Here is the function you need:\n```\nfunction add(a, b) { return a + b; }\n```');
        expect(r.signals.completeness.score).toBe(30);
      });

      // DEFECT (see QE_REPORT.md, Defect #1): the `trimmed.endsWith('...')`
      // branch that should score 5 ("appears truncated") is unreachable dead
      // code. Any string ending in '...' also ends in '.', which matches the
      // EARLIER `/[.!?]$/` check first and returns 30 ("ends cleanly") —
      // the truncation branch below it can never execute. This test pins
      // down the ACTUAL (buggy) behavior so it fails loudly the moment
      // someone reorders the branches without fixing the underlying logic,
      // and so this suite stays a trustworthy regression baseline rather
      // than silently asserting the intended-but-unreachable behavior.
      await it('[DEFECT-1] a response truncated with "..." is misclassified as "ends cleanly" (30, not 5) because the truncation check is unreachable dead code', () => {
        const r = Trust.scoreResponse('This response was cut off mid sentence and trails off like this...');
        expect(r.signals.completeness.score).toBe(30);
        expect(r.signals.completeness.message).toBe('Response ends cleanly');
      });

      await it('a long response with no closing punctuation scores 20', () => {
        const r = Trust.scoreResponse('word '.repeat(40).trim());
        expect(r.signals.completeness.score).toBe(20);
      });
    });

    await describe('R3 Specificity (0-25 pts)', async () => {
      await it('no concrete signals scores 0', () => {
        const r = Trust.scoreResponse('This is a general statement without any concrete or specific details in it at all whatsoever, generally speaking.');
        expect(r.signals.specificity.score).toBe(0);
      });

      await it('exactly one signal (a percentage) scores 10', () => {
        const r = Trust.scoreResponse('The success rate improved by 15% over the last quarter, and nothing else changed at all this time around.');
        expect(r.signals.specificity.score).toBe(10);
      });

      await it('4+ signals (numbers, code, headers, lists) scores the full 25', () => {
        const r = Trust.scoreResponse('# Results\n\nIn 2024, revenue grew 15%. For example, `calculateTotal()` returns the sum.\n- Item one\n- Item two\nAccording to the data, this is specifically accurate.');
        expect(r.signals.specificity.score).toBe(25);
      });
    });

    await describe('R4 Consistency / contradiction pivots (0-15 pts)', async () => {
      await it('no pivot words scores the full 15', () => {
        const r = Trust.scoreResponse('This approach works well and is the recommended solution for this problem.');
        expect(r.signals.consistency.score).toBe(15);
      });

      await it('a single pivot word ("however") scores 12', () => {
        const r = Trust.scoreResponse('This approach works well. However, there are some edge cases to consider carefully here.');
        expect(r.signals.consistency.score).toBe(12);
      });

      await it('5+ pivot words scores 0 (reads as flip-flopping)', () => {
        const r = Trust.scoreResponse('It works. However, it fails. Nevertheless, it works. On the other hand, it fails. Conversely, it works. That said, it fails. But wait, it works.');
        expect(r.signals.consistency.score).toBe(0);
      });
    });

    await describe('aggregate scoring + metadata', async () => {
      await it('trustScore is the sum of all 4 signal scores, capped at 100', () => {
        const r = Trust.scoreResponse('# Analysis\n\nIn 2024, results improved 20%. For example, `run()` executed correctly. This is a complete, confident, and well-structured answer with no hedging.');
        const sum = Object.values(r.signals).reduce((a, s) => a + s.score, 0);
        expect(r.trustScore).toBe(Math.min(100, Math.round(sum)));
      });

      await it('trustScoreNormalized is always trustScore / 100', () => {
        const r = Trust.scoreResponse('The answer is definitely correct and well explained in full detail here today.');
        expect(r.trustScoreNormalized).toBe(parseFloat((r.trustScore / 100).toFixed(2)));
      });

      await it('grade thresholds: A>=80, B>=65, C>=50, D>=35, F<35', () => {
        const strong = Trust.scoreResponse('# Result\n\nIn 2024, growth was 20%. For example, `run()` works correctly and completely, e.g. verified in production.');
        expect(strong.trustScore).toBeGreaterThanOrEqual(80);
        expect(strong.grade).toBe('A');

        const weak = Trust.scoreResponse('maybe possibly perhaps it could be, i am not sure, it seems, i think');
        expect(weak.grade).toBe('F');
      });

      await it('score is always within [0, 100] for arbitrary text', () => {
        const samples = [
          'ok', 'maybe. however. but wait. nevertheless. conversely.',
          ('This is a long, confident, well-structured, and complete response. '.repeat(30)),
        ];
        samples.forEach((t) => {
          const r = Trust.scoreResponse(t);
          expect(r.trustScore).toBeInRange(0, 100);
        });
      });
    });

    // The window.postMessage(MNEMOX_TRUST_SCORE) -> MNEMOX_TRUST_RESULT bridge
    // needs a real `window` with working postMessage/addEventListener
    // semantics, which this vm-sandbox loader deliberately doesn't provide
    // (see lib/loaders.js). That bridge — plus the metadata attachment bug
    // fix (result.text) — is covered end-to-end in
    // 07-integration-trust-panel.test.js instead.
  });
};

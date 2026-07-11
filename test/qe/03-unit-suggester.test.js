// QE Suite 03 — scoring/suggester.js (improved-prompt rewriter)

const { describe, it, expect } = require('./lib/framework');
const { loadSuggester, loadRules, fullDims } = require('./lib/loaders');

module.exports = async function run() {
  const S = loadSuggester();
  const scorePrompt = loadRules();

  await describe('scoring/suggester.js — suggest()', async () => {

    await it('returns null for missing text or missing dims', () => {
      expect(S.suggest('', fullDims())).toBeNull();
      expect(S.suggest('hello', null)).toBeNull();
      expect(S.suggest(null, fullDims())).toBeNull();
    });

    await it('returns null when every dimension is already strong (nothing to improve)', () => {
      const result = S.suggest('A perfectly good prompt.', fullDims());
      expect(result).toBeNull();
    });

    await it('weak R1 (clarity < 50%) prepends a role-setting prefix', () => {
      const dims = fullDims({ R1: { score: 2, max: 12 } });
      const result = S.suggest('do this', dims);
      expect(result).toContain('You are an expert assistant.');
    });

    await it('weak R2 (specificity < 40%) prepends a task-framing prefix', () => {
      const dims = fullDims({ R2: { score: 2, max: 12 } });
      const result = S.suggest('do this', dims);
      expect(result).toContain('Please complete the following task:');
    });

    await it('weak R3/R4/R5/R6/R7/R8 each append their respective suffix line', () => {
      const cases = [
        ['R3', 'Provide relevant context and background in your response.'],
        ['R4', 'Format your response clearly with sections and examples where helpful.'],
        ['R5', 'Keep your response concise and focused.'],
        ['R6', 'Please be thorough and detailed in your response.'],
        ['R7', 'Target your response for a general professional audience.'],
        ['R8', 'Be specific and precise in your answer.'],
      ];
      cases.forEach(([key, expectedLine]) => {
        const dims = fullDims({ [key]: { score: 0, max: 12 } });
        const result = S.suggest('base prompt text', dims);
        expect(result).toContain(expectedLine);
      });
    });

    await it('original prompt text is always preserved verbatim inside the suggestion', () => {
      const dims = fullDims({ R1: { score: 0, max: 12 } });
      const original = 'fix the login bug asap';
      const result = S.suggest(original, dims);
      expect(result).toContain(original);
    });

    await it('multiple weak dims combine prefix(es) and suffix(es) in one rewrite', () => {
      const dims = fullDims({ R1: { score: 0, max: 12 }, R2: { score: 0, max: 12 }, R3: { score: 0, max: 12 } });
      const result = S.suggest('help', dims);
      expect(result).toContain('You are an expert assistant.');
      expect(result).toContain('Please complete the following task:');
      expect(result).toContain('Provide relevant context and background in your response.');
    });

    await it('accepts the plain fractional dim format (0-1 float), not just {score,max} objects', () => {
      // getPct() supports typeof dim === 'number' too (dim*100) — legacy/alt shape.
      const dims = { R1: 0.1, R2: 1, R3: 1, R4: 1, R5: 1, R6: 1, R7: 1, R8: 1 };
      const result = S.suggest('short', dims);
      expect(result).toContain('You are an expert assistant.');
    });

    await it('missing individual dim keys default to 100% (treated as strong, no crash)', () => {
      // dims object missing R1 entirely — getPct(undefined) returns 100, so it must NOT trigger the R1 prefix.
      const dims = fullDims();
      delete dims.R1;
      const result = S.suggest('fine as-is', dims);
      expect(result).toBeNull();
    });

    await it('integrates end-to-end with a real low-scoring prompt from scorePrompt()', () => {
      const scored = scorePrompt('help');
      const result = S.suggest('help', scored.dims);
      expect(result).toBeTruthy();
      expect(result).toContain('help');
    });

    await it('integrates end-to-end with a real high-scoring prompt from scorePrompt() and returns null', () => {
      const strongPrompt = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      const scored = scorePrompt(strongPrompt);
      const result = S.suggest(strongPrompt, scored.dims);
      expect(result).toBeNull();
    });
  });
};

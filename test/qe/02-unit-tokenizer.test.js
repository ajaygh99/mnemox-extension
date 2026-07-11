// QE Suite 02 — scoring/tokenizer.js (client-side token estimator)

const { describe, it, expect } = require('./lib/framework');
const { loadTokenizer } = require('./lib/loaders');

module.exports = async function run() {
  const T = loadTokenizer();

  await describe('scoring/tokenizer.js — countTokens()', async () => {

    await it('empty string returns 0', () => {
      expect(T.countTokens('')).toBe(0);
    });

    await it('non-string input (null/undefined/number) returns 0, never throws', () => {
      expect(T.countTokens(null)).toBe(0);
      expect(T.countTokens(undefined)).toBe(0);
      expect(T.countTokens(42)).toBe(0);
    });

    await it('single short word (<=5 chars) counts as exactly 1 token', () => {
      expect(T.countTokens('hello')).toBe(1);
      expect(T.countTokens('cat')).toBe(1);
    });

    await it('medium word (6-8 chars) counts as 2 tokens', () => {
      expect(T.countTokens('bicycle')).toBe(2); // 7 chars
    });

    await it('long word (>8 chars) splits roughly every 4 chars', () => {
      // 16 chars -> ceil(16/4) = 4
      expect(T.countTokens('internationalize'.slice(0, 16))).toBe(4);
    });

    await it('punctuation is expanded into its own token(s)', () => {
      const withoutPunct = T.countTokens('hello world');
      const withPunct = T.countTokens('hello, world!');
      expect(withPunct).toBeGreaterThan(withoutPunct);
    });

    await it('longer prose scales roughly linearly with word count', () => {
      const short = T.countTokens('The quick brown fox jumps.');
      const long = T.countTokens('The quick brown fox jumps. '.repeat(10));
      expect(long).toBeGreaterThan(short * 5);
    });

    await it('is deterministic for identical input', () => {
      const text = 'Write a Python function that reads a CSV file and returns a list of dicts.';
      expect(T.countTokens(text)).toBe(T.countTokens(text));
    });

    await it('never returns a negative count', () => {
      ['', '   ', '!!!???...', 'a'.repeat(5000)].forEach((s) => {
        expect(T.countTokens(s)).toBeGreaterThanOrEqual(0);
      });
    });

    await it('handles unicode/emoji without throwing and returns a positive count for non-empty unicode text', () => {
      const n = T.countTokens('こんにちは世界 🚀🎉 héllo wörld');
      expect(n).toBeGreaterThan(0);
    });

    await it('whitespace-only input returns 0 (no real words after trim/split)', () => {
      expect(T.countTokens('     \n\t   ')).toBe(0);
    });

    await it('does not hang on a pathologically long single token', () => {
      const n = T.countTokens('a'.repeat(50000));
      expect(n).toBeGreaterThan(1000); // ceil(50000/4)
    });
  });
};

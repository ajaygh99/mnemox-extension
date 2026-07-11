// QE Suite 05 — scoring/cache.js (prompt hash LRU cache)
// Note: this module is currently NOT wired into the live scoring pipeline
// (ui/pageWorld.js calls scorePrompt() directly on every debounced input —
// see QE_REPORT.md "Dead code" section). It's tested here anyway because
// it's shipped, exercised by the project's own test/runner.js, and would
// silently break unnoticed otherwise if it's ever wired in later.

const { describe, it, expect } = require('./lib/framework');
const { loadCache } = require('./lib/loaders');

module.exports = async function run() {

  await describe('scoring/cache.js', async () => {

    await it('hashPrompt() is deterministic for identical text', async () => {
      const C = loadCache();
      const a = await C.hashPrompt('Hello World');
      const b = await C.hashPrompt('Hello World');
      expect(a).toBe(b);
    });

    await it('hashPrompt() normalizes case and surrounding whitespace to the same hash', async () => {
      const C = loadCache();
      const a = await C.hashPrompt('  Hello World  ');
      const b = await C.hashPrompt('hello world');
      expect(a).toBe(b);
    });

    await it('hashPrompt() produces different hashes for different text', async () => {
      const C = loadCache();
      const a = await C.hashPrompt('prompt one');
      const b = await C.hashPrompt('prompt two');
      if (a === b) throw new Error('expected different hashes, got the same one');
    });

    await it('getCached() returns null for a prompt that was never cached', async () => {
      const C = loadCache();
      const result = await C.getCached('never seen before');
      expect(result).toBeNull();
    });

    await it('setCached() then getCached() round-trips the exact stored value', async () => {
      const C = loadCache();
      const scoreResult = { score: 77, grade: 'B', dims: {} };
      await C.setCached('my prompt', scoreResult);
      const result = await C.getCached('my prompt');
      expect(result).toEqual(scoreResult);
    });

    await it('cache lookups are case/whitespace-insensitive (same hash -> hit)', async () => {
      const C = loadCache();
      await C.setCached('Hello World', { score: 50 });
      const result = await C.getCached('  hello world  ');
      expect(result).toEqual({ score: 50 });
    });

    await it('getCacheSize() reflects the number of distinct entries stored', async () => {
      const C = loadCache();
      expect(C.getCacheSize()).toBe(0);
      await C.setCached('a', { score: 1 });
      await C.setCached('b', { score: 2 });
      expect(C.getCacheSize()).toBe(2);
    });

    await it('clearCache() empties the cache', async () => {
      const C = loadCache();
      await C.setCached('a', { score: 1 });
      C.clearCache();
      expect(C.getCacheSize()).toBe(0);
      expect(await C.getCached('a')).toBeNull();
    });

    await it('LRU eviction: inserting a 101st distinct entry evicts the oldest one', async () => {
      const C = loadCache();
      for (let i = 0; i < 100; i++) {
        await C.setCached('prompt-' + i, { score: i });
      }
      expect(C.getCacheSize()).toBe(100);
      // Deliberately do NOT read prompt-0 here before triggering eviction —
      // getCached() touches recency (moves the entry to MRU), which would
      // make prompt-1 the new oldest instead and falsify this assertion.
      // (That exact behavior has its own dedicated test right below.)

      await C.setCached('prompt-100', { score: 100 });
      expect(C.getCacheSize()).toBe(100); // capacity held at 100, not 101
      expect(await C.getCached('prompt-0')).toBeNull(); // oldest (untouched) evicted
      expect(await C.getCached('prompt-100')).toEqual({ score: 100 }); // newest present
    });

    await it('LRU recency: reading an entry moves it to the back, protecting it from the next eviction', async () => {
      const C = loadCache();
      for (let i = 0; i < 100; i++) {
        await C.setCached('p' + i, { score: i });
      }
      // Touch p0 so it's no longer the least-recently-used entry.
      await C.getCached('p0');
      // Insert one more, forcing an eviction — should evict p1 (now the
      // actual oldest), not p0 (just touched).
      await C.setCached('p100', { score: 100 });
      expect(await C.getCached('p0')).toEqual({ score: 0 });
      expect(await C.getCached('p1')).toBeNull();
    });
  });
};

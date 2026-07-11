// Mnemox QE Suite — minimal describe/it framework
// Deliberately dependency-free (besides jsdom, used only by the jsdom-based
// suites) to match the project's existing zero-heavy-toolchain philosophy
// (see test/runner.js). Supports nested describe(), async it(), a small
// expect() surface, and before/after-each hooks scoped per describe block.

'use strict';

const results = { pass: 0, fail: 0, skip: 0, failures: [] };
const suiteStack = [];

function currentPath() {
  return suiteStack.map(s => s.name).join(' > ');
}

async function describe(name, fn) {
  const node = { name, beforeEach: [], afterEach: [] };
  suiteStack.push(node);
  try {
    await fn();
  } finally {
    suiteStack.pop();
  }
}

function beforeEach(fn) {
  if (suiteStack.length === 0) throw new Error('beforeEach() must be called inside describe()');
  suiteStack[suiteStack.length - 1].beforeEach.push(fn);
}

function afterEach(fn) {
  if (suiteStack.length === 0) throw new Error('afterEach() must be called inside describe()');
  suiteStack[suiteStack.length - 1].afterEach.push(fn);
}

async function runHooks(kind) {
  for (const node of suiteStack) {
    for (const fn of node[kind]) await fn();
  }
}

async function it(name, fn) {
  const path = currentPath() ? `${currentPath()} > ${name}` : name;
  try {
    await runHooks('beforeEach');
    await fn();
    await runHooks('afterEach');
    results.pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${path}`);
  } catch (e) {
    results.fail++;
    results.failures.push({ path, error: e });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${path}`);
    console.log(`        ${e.message}`);
  }
}

function xit(name) {
  results.skip++;
  console.log(`  \x1b[33mSKIP\x1b[0m  ${currentPath() ? currentPath() + ' > ' : ''}${name}`);
}

class AssertionError extends Error {}

function expect(actual) {
  const fail = (msg) => { throw new AssertionError(msg); };
  return {
    toBe(expected) {
      if (actual !== expected) fail(`expected ${stringify(actual)} to be ${stringify(expected)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) fail(`expected ${a} to equal ${b}`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) fail(`expected ${stringify(actual)} to be > ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) fail(`expected ${stringify(actual)} to be >= ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) fail(`expected ${stringify(actual)} to be < ${n}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n)) fail(`expected ${stringify(actual)} to be <= ${n}`);
    },
    toBeTruthy() {
      if (!actual) fail(`expected ${stringify(actual)} to be truthy`);
    },
    toBeFalsy() {
      if (actual) fail(`expected ${stringify(actual)} to be falsy`);
    },
    toBeNull() {
      if (actual !== null) fail(`expected ${stringify(actual)} to be null`);
    },
    toBeDefined() {
      if (actual === undefined) fail(`expected value to be defined`);
    },
    toContain(item) {
      const has = Array.isArray(actual) || typeof actual === 'string' ? actual.includes(item) : false;
      if (!has) fail(`expected ${stringify(actual)} to contain ${stringify(item)}`);
    },
    toMatch(re) {
      if (!re.test(actual)) fail(`expected ${stringify(actual)} to match ${re}`);
    },
    toHaveLength(n) {
      if (!actual || actual.length !== n) fail(`expected length ${actual && actual.length} to be ${n}`);
    },
    toBeInRange(min, max) {
      if (!(actual >= min && actual <= max)) fail(`expected ${stringify(actual)} to be within [${min}, ${max}]`);
    },
    toThrow() {
      let threw = false;
      try { actual(); } catch (e) { threw = true; }
      if (!threw) fail('expected function to throw');
    },
  };
}

function stringify(v) {
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function summary() {
  return results;
}

module.exports = { describe, it, xit, beforeEach, afterEach, expect, summary, results };

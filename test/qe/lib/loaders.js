// Mnemox QE Suite — pure-logic module loaders
// These load scoring/*.js into a minimal vm sandbox (no jsdom) for fast,
// isolated unit testing. `window` is aliased to the sandbox object itself,
// which is exactly how these files behave when loaded via injectScript()
// in production: `window.X = ...` and top-level `var X = ...` both end up
// as properties reachable off the same global.

'use strict';

const vm = require('vm');
const { readSrc } = require('./harness');
const nodeCrypto = require('crypto');

function freshSandbox(extra) {
  const sandbox = Object.assign({ console }, extra || {});
  sandbox.window = sandbox;
  sandbox.window.addEventListener = sandbox.window.addEventListener || (() => {});
  vm.createContext(sandbox);
  return sandbox;
}

function loadRules() {
  const sandbox = freshSandbox();
  vm.runInContext(readSrc('scoring/rules.js'), sandbox);
  return sandbox.scorePrompt;
}

function loadTokenizer() {
  const sandbox = freshSandbox();
  vm.runInContext(readSrc('scoring/tokenizer.js'), sandbox);
  return sandbox.MnemoxTokenizer;
}

function loadSuggester() {
  const sandbox = freshSandbox();
  vm.runInContext(readSrc('scoring/suggester.js'), sandbox);
  return sandbox.MnemoxSuggester;
}

function loadTrust() {
  const sandbox = freshSandbox();
  vm.runInContext(readSrc('scoring/trust.js'), sandbox);
  return sandbox.MnemoxTrust;
}

function loadCache() {
  const sandbox = freshSandbox({ crypto: nodeCrypto.webcrypto, TextEncoder });
  vm.runInContext(readSrc('scoring/cache.js'), sandbox);
  return { hashPrompt: sandbox.hashPrompt, getCached: sandbox.getCached, setCached: sandbox.setCached, getCacheSize: sandbox.getCacheSize, clearCache: sandbox.clearCache };
}

// Full 8-dim map for suggester tests, all rules maxed at 12 (R8 at 4).
function fullDims(overrides) {
  const base = {};
  ['R1','R2','R3','R4','R5','R6','R7'].forEach(k => { base[k] = { score: 12, max: 12 }; });
  base.R8 = { score: 4, max: 4 };
  return Object.assign(base, overrides || {});
}

module.exports = { loadRules, loadTokenizer, loadSuggester, loadTrust, loadCache, fullDims };

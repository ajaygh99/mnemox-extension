// Mnemox QE Suite — test harness
// Builds a realistic-enough runtime for the extension's two JS "worlds"
// without a real Chrome instance:
//   1. Page/MAIN world  — a jsdom window standing in for an AI chat tab.
//      scoring/*.js, ui/*.js, adapters/*.js, response-reader.js, and
//      content.js are eval'd into it, exactly mirroring the order
//      content.js's own injectScript() calls use in production.
//   2. Background/service-worker world — a separate, isolated vm context
//      (no DOM) that background.js is eval'd into, given its own chrome.*
//      + fetch mocks.
// A shared in-memory chrome.storage.local and a message bus connect the
// two, the same way chrome.runtime.sendMessage bridges content <-> bg in a
// real browser.
//
// Known simplification (documented, not hidden): content.js normally runs
// in an isolated JS world that only shares the DOM with the page world, not
// JS globals. This harness evals content.js into the SAME window realm as
// the page-world scripts for simplicity. This is safe for what these tests
// assert (message-passing behaviour, DOM output, network gating) because
// content.js and the page-world scripts don't share any variable names, and
// every real cross-world boundary in the extension (chrome.* calls,
// window.postMessage) is still exercised faithfully.

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { JSDOM } = require('jsdom');
const nodeCrypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..'); // repo root (test/qe/lib -> up 3)

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── Shared storage.local (mirrors real cross-context persistence) ──────────
function createStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    _data: data,
    get(keys, cb) {
      let result = {};
      if (keys == null) {
        result = Object.assign({}, data);
      } else if (typeof keys === 'string') {
        if (keys in data) result[keys] = data[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach(k => { if (k in data) result[k] = data[k]; });
      } else if (typeof keys === 'object') {
        Object.keys(keys).forEach(k => { result[k] = (k in data) ? data[k] : keys[k]; });
      }
      if (cb) setTimeout(() => cb(result), 0);
      return Promise.resolve(result);
    },
    set(obj, cb) {
      Object.assign(data, obj);
      if (cb) setTimeout(() => cb(), 0);
      return Promise.resolve();
    },
  };
}

// ── fetch mock — records every call, returns a scripted response ───────────
function createFetchMock(scriptedResponse) {
  const calls = [];
  const fn = function (url, opts) {
    calls.push({ url, opts, body: opts && opts.body ? safeParse(opts.body) : null });
    const resp = typeof scriptedResponse === 'function' ? scriptedResponse(url, opts) : scriptedResponse;
    if (resp instanceof Error) return Promise.reject(resp);
    return Promise.resolve({
      ok: resp.ok !== false,
      status: resp.status || 200,
      json: () => Promise.resolve(resp.body !== undefined ? resp.body : {}),
    });
  };
  fn.calls = calls;
  return fn;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return s; }
}

// ── Background service-worker world (no DOM) ────────────────────────────────
function createBackgroundWorld(storage, fetchMock) {
  const messageListeners = [];
  const chromeMock = {
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onInstalled: { addListener: (fn) => { chromeMock._onInstalled = fn; } },
      onStartup: { addListener: (fn) => { chromeMock._onStartup = fn; } },
      lastError: undefined,
    },
    storage: { local: storage },
  };

  const sandbox = {
    chrome: chromeMock,
    fetch: fetchMock,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
  };
  vm.createContext(sandbox);
  vm.runInContext(readSrc('background.js'), sandbox, { filename: 'background.js' });

  return {
    sandbox,
    chromeMock,
    /** Dispatch a message the way chrome.runtime.sendMessage would, invoking
     *  every registered onMessage listener and resolving with whatever the
     *  first one passes to sendResponse (mirrors real single-listener
     *  extension behaviour — background.js only registers one). */
    dispatch(message) {
      return new Promise((resolve) => {
        let responded = false;
        messageListeners.forEach((fn) => {
          fn(message, {}, (resp) => { if (!responded) { responded = true; resolve(resp); } });
        });
      });
    },
    triggerInstalled() { if (chromeMock._onInstalled) chromeMock._onInstalled(); },
  };
}

// ── Page/MAIN world (jsdom) ─────────────────────────────────────────────────
function createPageWorld({ url = 'https://claude.ai/chat/test', backgroundBus, storage, sentTabs } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url, runScripts: 'dangerously' });
  const window = dom.window;

  // Polyfills jsdom doesn't ship: WebCrypto (scoring/cache.js) + Clipboard API (coach.js copy button)
  Object.defineProperty(window, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: (text) => { window.__lastClipboardWrite = text; return Promise.resolve(); } },
    configurable: true,
  });

  // jsdom quirk (not a real-browser behaviour): a same-window
  // window.postMessage() delivers a 'message' event whose event.source is
  // NOT === window (real browsers set it to the sending window). Every
  // Mnemox script that listens for window messages (pageWorld.js,
  // content.js, trust.js) guards with `if (event.source !== window) return;`
  // — exactly as it should, to reject messages from other frames — so left
  // unpatched, jsdom would make every single message silently vanish and
  // every integration test would time out for a reason that has nothing to
  // do with the extension's actual code. Re-implementing postMessage here
  // to dispatch a real MessageEvent with source explicitly set fixes the
  // *harness* to match real browser semantics, without touching product code.
  const realPostMessage = window.postMessage.bind(window);
  window.postMessage = function (data, targetOrigin, transfer) {
    try {
      const ev = new window.MessageEvent('message', { data, source: window });
      window.dispatchEvent(ev);
    } catch (e) {
      realPostMessage(data, targetOrigin, transfer);
    }
  };

  const createdTabs = sentTabs || [];
  window.chrome = {
    runtime: {
      getURL: (f) => 'chrome-extension://mock-id/' + f,
      lastError: undefined,
      sendMessage: (message, cb) => {
        if (!backgroundBus) { if (cb) cb(undefined); return; }
        backgroundBus.dispatch(message).then((resp) => { if (cb) cb(resp); });
      },
      onMessage: { addListener: () => {} }, // content.js doesn't register one; no-op is correct
    },
    storage: { local: storage },
    tabs: { create: (opts) => createdTabs.push(opts) },
  };

  return { dom, window, createdTabs };
}

// Loads a file's source into a page-world window in the exact order
// content.js's own injectScript() calls use, so top-level `var`s attach to
// `window` the same way real <script src> injection does.
const PAGE_WORLD_LOAD_ORDER = [
  'scoring/rules.js',
  'scoring/tokenizer.js',
  'scoring/suggester.js',
  'scoring/trust.js',
  'ui/coach.js',
  'ui/badge.js',
  'ui/pageWorld.js',
  'adapters/chatgpt.js',
  'adapters/claude.js',
  'adapters/gemini.js',
  'adapters/copilot.js',
  'adapters/perplexity.js',
  'adapters/grok.js',
  'adapters/registry.js',
  'response-reader.js',
];

function loadPageWorldScripts(window, files) {
  (files || PAGE_WORLD_LOAD_ORDER).forEach((rel) => {
    window.eval(readSrc(rel));
  });
}

function loadContentScript(window) {
  window.eval(readSrc('content.js'));
}

module.exports = {
  ROOT, readSrc,
  createStorage, createFetchMock,
  createBackgroundWorld, createPageWorld,
  loadPageWorldScripts, loadContentScript,
  PAGE_WORLD_LOAD_ORDER,
};

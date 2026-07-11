// QE Suite 09 — full-stack privacy verification
// The single most safety-critical suite in this project: it drives a
// COMPLETE prompt-then-response cycle through the real content.js +
// pageWorld.js + trust.js + background.js, wired together exactly as they
// are in production (page world <-postMessage-> content.js
// <-chrome.runtime.sendMessage-> background.js), on a fresh-install/default
// flag state, and asserts that the ONLY network request made anywhere in
// that entire cycle is the documented /health warmup ping.
//
// This is what actually backs the "100% Local - No API" badge in
// popup.html and the "Zero external API calls by default" claim in
// STORE_LISTING.md -- if this suite is green, that claim is true; if a
// future change makes it red, the claim just became false and the store
// listing is now lying to users.

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, loadContentScript, createStorage, createFetchMock, createBackgroundWorld } = require('./lib/harness');
const { waitForMessage, sleep } = require('./lib/wait');

function nonHealthCalls(fetchMock) {
  return fetchMock.calls.filter(c => !c.url.includes('/health'));
}

module.exports = async function run() {

  await describe('Privacy: fresh-install default state makes zero network calls beyond /health', async () => {

    await it('a full prompt-scoring cycle makes no network calls', async () => {
      const storage = createStorage(); // no flags set -- pure defaults
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(storage, fetchMock);
      const { window } = createPageWorld({ storage, backgroundBus: bg });
      loadPageWorldScripts(window);
      loadContentScript(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a reasonably detailed prompt about something specific here' }, '*');
      await resultPromise;
      await sleep(50);

      expect(nonHealthCalls(fetchMock)).toHaveLength(0);
    });

    await it('a full response-scoring cycle (trust score + RESPONSE_SCORED + MEMORY_CHECK) makes no network calls on default flags', async () => {
      const storage = createStorage();
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(storage, fetchMock);
      const { window } = createPageWorld({ storage, backgroundBus: bg });
      loadPageWorldScripts(window);
      loadContentScript(window);

      // Simulate response-reader.js having captured a completed AI response
      // (bypassing its own MutationObserver/DOM-polling layer, which is
      // exercised separately) and feed it straight into content.js's own
      // debounce -> trust-score -> RESPONSE_SCORED/MEMORY_CHECK pipeline,
      // exactly as response-reader.js's real MNEMOX_RESPONSE payload would.
      window.postMessage({
        type: 'MNEMOX_RESPONSE',
        payload: { platform: 'claude.ai', text: 'The answer is 42, explained fully here today.', tokenEstimate: 10, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/1' },
      }, '*');

      // content.js debounces MNEMOX_RESPONSE -> MNEMOX_TRUST_SCORE by 1.5s
      await sleep(1700);
      // then trust.js -> MNEMOX_TRUST_RESULT -> content.js's chrome.runtime
      // messages (RESPONSE_SCORED, MEMORY_CHECK) -- both resolve on the next
      // microtask/timer tick once dispatched through the mock message bus.
      await sleep(100);

      expect(nonHealthCalls(fetchMock)).toHaveLength(0);
    });

    await it('enabling TRACE_LOGGING is the ONLY way to make the /traces network call happen', async () => {
      const storage = createStorage({ TRACE_LOGGING: true });
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(storage, fetchMock);
      const { window } = createPageWorld({ storage, backgroundBus: bg });
      loadPageWorldScripts(window);
      loadContentScript(window);

      window.postMessage({
        type: 'MNEMOX_RESPONSE',
        payload: { platform: 'claude.ai', text: 'The answer is 42, explained fully here today.', tokenEstimate: 10, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/1' },
      }, '*');
      await sleep(1700);
      await sleep(100);

      const traceCalls = fetchMock.calls.filter(c => c.url.includes('/traces'));
      expect(traceCalls).toHaveLength(1);
      // and MEMORY_CONSISTENCY, left at its default (false), still made no /search call
      const searchCalls = fetchMock.calls.filter(c => c.url.includes('/search'));
      expect(searchCalls).toHaveLength(0);
    });

    await it('storage.local writes on a default install never include response/prompt TEXT sent anywhere off-device implicitly', async () => {
      // This isn't a network assertion -- it's confirming that local caching
      // (chrome.storage.local) and network transmission are two genuinely
      // separate code paths, not that one silently implies the other.
      const storage = createStorage();
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(storage, fetchMock);
      const { window } = createPageWorld({ storage, backgroundBus: bg });
      loadPageWorldScripts(window);
      loadContentScript(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a prompt with some detail in it for scoring' }, '*');
      await resultPromise;
      await sleep(50);

      // Local storage SHOULD have the score result cached (that's the
      // legitimate "restore last score in the popup" feature) ...
      expect(storage._data.lastResult).toBeDefined();
      // ... but it must never have left the device via fetch.
      expect(nonHealthCalls(fetchMock)).toHaveLength(0);
    });
  });
};

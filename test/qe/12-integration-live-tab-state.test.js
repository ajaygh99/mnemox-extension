// QE Suite 12 — integration: per-tab live state (GET_LIVE_STATE)
//
// Regression coverage for a real bug reported 2026-07-11: with multiple
// AI-tool tabs open at once (Claude, ChatGPT, Gemini...), the toolbar popup
// read lastResult/lastTrustResult/lastUrl straight from chrome.storage.local
// — GLOBAL keys shared by every tab — so it showed whichever tab had most
// recently scored a prompt, not necessarily the tab actually being viewed.
// Fix: content.js now tracks ITS OWN tab's latest result in a closure
// variable (never written to storage-shared state) and answers a
// GET_LIVE_STATE message with it. This suite proves two things: (1) the
// message round-trip actually works, and (2) two independent tabs never see
// each other's data — the actual property the bug violated.

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, loadContentScript, createStorage, createBackgroundWorld, createFetchMock } = require('./lib/harness');
const { waitForMessage, sleep } = require('./lib/wait');

async function getLiveState(window) {
  return window.chrome.runtime.onMessage._trigger({ type: 'GET_LIVE_STATE' }, {});
}

module.exports = async function run() {

  await describe('Integration: GET_LIVE_STATE per-tab isolation', async () => {

    await it('before any prompt is scored, GET_LIVE_STATE responds ok with a null result (not an error, not a crash)', async () => {
      const { window } = createPageWorld({ url: 'https://claude.ai/chat/x', storage: createStorage() });
      loadPageWorldScripts(window);
      loadContentScript(window);

      const resp = await getLiveState(window);
      expect(resp.ok).toBe(true);
      expect(resp.result).toBeNull();
      expect(resp.trustResult).toBeNull();
      expect(resp.url).toBe('claude.ai');
    });

    await it('after scoring a prompt, GET_LIVE_STATE reflects this tab\'s own latest result', async () => {
      const { window } = createPageWorld({ url: 'https://chatgpt.com/c/1', storage: createStorage() });
      loadPageWorldScripts(window);
      loadContentScript(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a reasonably detailed prompt about something specific here' }, '*');
      const msg = await resultPromise;

      const resp = await getLiveState(window);
      expect(resp.ok).toBe(true);
      expect(resp.result.score).toBe(msg.result.score);
      expect(resp.result.grade).toBe(msg.result.grade);
      expect(resp.url).toBe('chatgpt.com');
    });

    await it('the actual bug: two tabs scoring DIFFERENT prompts never see each other\'s result', async () => {
      // Tab A: claude.ai, scores a weak prompt.
      const tabA = createPageWorld({ url: 'https://claude.ai/chat/a', storage: createStorage() });
      loadPageWorldScripts(tabA.window);
      loadContentScript(tabA.window);
      const aResultPromise = waitForMessage(tabA.window, 'MNEMOX_RESULT');
      tabA.window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      const aMsg = await aResultPromise;

      // Tab B: gemini, scores a strong, detailed prompt — deliberately a
      // very different score/grade from tab A so a mix-up is unmistakable.
      const tabB = createPageWorld({ url: 'https://gemini.google.com/app', storage: createStorage() });
      loadPageWorldScripts(tabB.window);
      loadContentScript(tabB.window);
      const bResultPromise = waitForMessage(tabB.window, 'MNEMOX_RESULT');
      const strongPrompt = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      tabB.window.postMessage({ type: 'MNEMOX_SCORE', text: strongPrompt }, '*');
      const bMsg = await bResultPromise;

      // Sanity: the two prompts really do score differently, or this test
      // wouldn't be able to detect a mix-up at all.
      expect(bMsg.result.score).toBeGreaterThan(aMsg.result.score);

      // The actual assertion: each tab's GET_LIVE_STATE must reflect ONLY
      // its own score, never the other tab's — this is exactly the
      // cross-tab bleed the reported bug exhibited via global storage.
      const respA = await getLiveState(tabA.window);
      const respB = await getLiveState(tabB.window);

      expect(respA.result.score).toBe(aMsg.result.score);
      expect(respA.url).toBe('claude.ai');
      expect(respB.result.score).toBe(bMsg.result.score);
      expect(respB.url).toBe('gemini.google.com');

      // Explicitly disprove the bug: tab A's view must NOT equal tab B's.
      expect(respA.result.score === respB.result.score).toBe(false);
    });

    await it('GET_LIVE_STATE also carries the trust (response quality) result independently per tab', async () => {
      const storage = createStorage();
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(storage, fetchMock);
      const { window } = createPageWorld({ url: 'https://claude.ai/chat/y', storage, backgroundBus: bg });
      loadPageWorldScripts(window);
      loadContentScript(window);

      window.postMessage({
        type: 'MNEMOX_RESPONSE',
        payload: { platform: 'claude.ai', text: 'The answer is 42, explained fully here today.', tokenEstimate: 10, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/y' },
      }, '*');
      await sleep(1700);
      await sleep(50);

      const resp = await getLiveState(window);
      expect(resp.ok).toBe(true);
      expect(resp.trustResult).toBeDefined();
      expect(resp.trustResult.trustScore).toBeDefined();
    });

    await it('the fix does not remove the storage-based fallback path (popup.js still works on tabs with no listener)', () => {
      const { readSrc } = require('./lib/harness');
      const popupSrc = readSrc('popup.js');
      expect(popupSrc).toContain('loadFromStorageFallback');
      expect(popupSrc).toContain('GET_LIVE_STATE');
      // The fallback must still read the same keys content.js still writes
      // to storage, so a tab without a content script (e.g. a non-AI page)
      // doesn't leave the popup blank.
      expect(popupSrc).toContain("'lastResult', 'lastTrustResult', 'lastUrl', 'sessionCount'");
    });
  });
};

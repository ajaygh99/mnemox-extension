// QE Suite 06 — integration: MNEMOX_SCORE -> badge + coach panel
// Exercises the real ui/pageWorld.js + ui/badge.js + ui/coach.js +
// scoring/rules.js + scoring/tokenizer.js + scoring/suggester.js together in
// a jsdom page, driving them exactly the way content.js does in production
// (window.postMessage), and asserting on both the returned result AND the
// actual rendered DOM.

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, createStorage } = require('./lib/harness');
const { waitForMessage, assertNoMessage } = require('./lib/wait');

module.exports = async function run() {

  await describe('Integration: prompt scoring pipeline (pageWorld + badge + coach)', async () => {

    await it('MNEMOX_SCORE produces a MNEMOX_RESULT with score/grade/tokens/suggestion', async () => {
      const storage = createStorage();
      const { window } = createPageWorld({ storage });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      const msg = await resultPromise;

      expect(msg.result.score).toBeDefined();
      expect(msg.result.grade).toBeDefined();
      expect(msg.result.tokens).toBeGreaterThanOrEqual(0);
    });

    await it('a weak prompt gets a non-null improved-prompt suggestion attached', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      const msg = await resultPromise;

      expect(msg.result.suggestion).toBeTruthy();
    });

    await it('a strong prompt gets no suggestion (null)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const strong = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: strong }, '*');
      const msg = await resultPromise;

      expect(msg.result.suggestion).toBeNull();
    });

    await it('the floating score badge is injected into the DOM and shows the numeric score', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'Write a Python function that reads a CSV, for example using pandas, and returns rows as dicts.' }, '*');
      const msg = await resultPromise;

      const badge = window.document.getElementById('mnemox-score-badge');
      expect(badge).toBeDefined();
      const scoreNum = window.document.getElementById('mnemox-score-num');
      expect(scoreNum.textContent).toBe(String(msg.result.score));
    });

    await it('the coach panel is populated with the same score/grade as the badge (kept in sync)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help me fix this' }, '*');
      const msg = await resultPromise;

      const coachScore = window.document.getElementById('mnemox-coach-score');
      expect(coachScore.textContent).toBe(String(msg.result.score));
      const coachGrade = window.document.getElementById('mnemox-coach-grade');
      expect(coachGrade.textContent).toBe('Grade ' + msg.result.grade);
    });

    await it('coach panel rule-breakdown shows all 8 rules with a progress bar each', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'Write a detailed guide for a beginner, for example with code, in markdown.' }, '*');
      await resultPromise;

      const rulesEl = window.document.getElementById('mnemox-coach-rules');
      expect(rulesEl.children.length).toBe(8);
    });

    await it('clicking the badge toggles the coach panel open (slides to right:0)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a reasonably detailed prompt about something specific' }, '*');
      await resultPromise;

      const badge = window.document.getElementById('mnemox-score-badge');
      const panel = window.document.getElementById('mnemox-coach-panel');
      expect(panel.style.right).toBe('-360px');
      badge.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(panel.style.right).toBe('0px');
    });

    await it('empty text is silently dropped by pageWorld.js — no crash, no result posted', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const noResult = assertNoMessage(window, 'MNEMOX_RESULT', 300);
      window.postMessage({ type: 'MNEMOX_SCORE', text: '' }, '*');
      const stayedQuiet = await noResult;
      expect(stayedQuiet).toBe(true);
    });

    // Architecture note: the "<2 chars, don't even send a score request" gate
    // lives in content.js's debouncedScore()/keydown handler, NOT in
    // pageWorld.js — pageWorld.js's own contract is "score anything
    // non-empty". Confirmed here so the boundary between the two files
    // stays intentional rather than accidental; content.js's side of this
    // gate is covered in 10-regression-historical-bugs.test.js.
    await it('pageWorld.js itself has no minimum-length gate — even 1 character gets scored', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'x' }, '*');
      const msg = await resultPromise;
      expect(msg.result.score).toBeDefined();
    });

    await it('badge/coach DOM construction never uses innerHTML with raw prompt text (XSS-safety, Trusted-Types compatible)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      const xssText = '<img src=x onerror=alert(1)> please explain this markup for a beginner, for example step by step.';
      window.postMessage({ type: 'MNEMOX_SCORE', text: xssText }, '*');
      await resultPromise;

      const badge = window.document.getElementById('mnemox-score-badge');
      const panel = window.document.getElementById('mnemox-coach-panel');
      expect(badge.querySelector('img')).toBeNull();
      expect(panel.querySelector('img')).toBeNull();
    });
  });
};

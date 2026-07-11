// QE Suite 13 — integration: badge "Momentum Ring" redesign
//
// Coverage for the 2026-07-11 badge redesign that replaced the letter-grade
// display (big "Grade F" in red) with a live-filling progress ring, a soft
// word ("Fair"/"Good"/etc — unchanged from getColor()), and one dynamically
// picked coaching tip. Verifies the new behavior AND that nothing outside
// ui/badge.js needed to change (the coach panel's kept-in-sync guarantee,
// the click-to-open handler, and the existing mnemox-score-num/mnemox-tokens
// contracts other code depends on).

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, createStorage, readSrc } = require('./lib/harness');
const { waitForMessage } = require('./lib/wait');

module.exports = async function run() {

  await describe('Badge redesign: no letter-grade text anywhere on the badge', async () => {
    await it('the shipped source no longer displays "Grade X" on the badge (mnemox-grade element removed)', () => {
      const src = readSrc('ui/badge.js');
      expect(src.includes('mnemox-grade')).toBe(false);
      expect(src.includes("'Grade '")).toBe(false);
    });

    await it('after scoring, the badge DOM contains no element whose text reads "Grade ..."', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      await resultPromise;

      const badge = window.document.getElementById('mnemox-score-badge');
      expect(/Grade\s+[A-F]/.test(badge.textContent)).toBe(false);
    });
  });

  await describe('Badge redesign: ring fill reflects the score', async () => {
    await it('the ring element exists and its conic-gradient fill angle is proportional to the score', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      const strong = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      window.postMessage({ type: 'MNEMOX_SCORE', text: strong }, '*');
      const msg = await resultPromise;

      const ring = window.document.getElementById('mnemox-ring');
      expect(ring).toBeDefined();
      const expectedDeg = Math.round((msg.result.score / 100) * 360);
      expect(ring.style.background).toContain(expectedDeg + 'deg');
    });

    await it('a low score produces a small fill angle, a high score produces a large one (monotonic, not inverted)', async () => {
      const weak = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(weak.window);
      const weakPromise = waitForMessage(weak.window, 'MNEMOX_RESULT');
      weak.window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      const weakMsg = await weakPromise;

      const strong = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(strong.window);
      const strongPromise = waitForMessage(strong.window, 'MNEMOX_RESULT');
      const strongText = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      strong.window.postMessage({ type: 'MNEMOX_SCORE', text: strongText }, '*');
      const strongMsg = await strongPromise;

      expect(strongMsg.result.score).toBeGreaterThan(weakMsg.result.score);

      // The gradient string is "conic-gradient(<color> 0deg <FILL>deg, <track> <FILL>deg 360deg)"
      // -- a plain /(\d+)deg/ match grabs the leading literal "0deg" boundary
      // instead of the actual fill angle. The fill angle is always the
      // number immediately followed by a comma, which is unambiguous.
      const weakDeg = parseInt(weak.window.document.getElementById('mnemox-ring').style.background.match(/(\d+)deg,/)[1], 10);
      const strongDeg = parseInt(strong.window.document.getElementById('mnemox-ring').style.background.match(/(\d+)deg,/)[1], 10);
      expect(strongDeg).toBeGreaterThan(weakDeg);
    });

    await it('score >= 70 adds a glow (box-shadow); below 70 has none', async () => {
      const good = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(good.window);
      const goodPromise = waitForMessage(good.window, 'MNEMOX_RESULT');
      const goodText = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      good.window.postMessage({ type: 'MNEMOX_SCORE', text: goodText }, '*');
      const goodMsg = await goodPromise;
      expect(goodMsg.result.score).toBeGreaterThanOrEqual(70);
      expect(good.window.document.getElementById('mnemox-ring').style.boxShadow === 'none').toBe(false);

      const bad = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(bad.window);
      const badPromise = waitForMessage(bad.window, 'MNEMOX_RESULT');
      bad.window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      await badPromise;
      expect(bad.window.document.getElementById('mnemox-ring').style.boxShadow).toBe('none');
    });
  });

  await describe('Badge redesign: coaching tip', async () => {
    await it('a weak prompt shows a specific tip pulled from the worst-scoring rule\'s own message (not a generic string)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      const msg = await resultPromise;

      const tipEl = window.document.getElementById('mnemox-tip');
      const worstId = Object.keys(msg.result.dims).sort((a, b) =>
        (msg.result.dims[a].score / msg.result.dims[a].max) - (msg.result.dims[b].score / msg.result.dims[b].max)
      )[0];
      expect(tipEl.textContent).toBe(msg.result.dims[worstId].message);
    });

    await it('a strong prompt with no weak rules shows the celebratory message instead', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      const strong = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, for example a sample token, under 500 words.';
      window.postMessage({ type: 'MNEMOX_SCORE', text: strong }, '*');
      const msg = await resultPromise;

      const tipEl = window.document.getElementById('mnemox-tip');
      if (msg.result.weak.length === 0) {
        expect(tipEl.textContent).toBe('Nice — this is a strong prompt.');
      } else {
        // Still weak on at least one rule -- tip must be that rule's own message, never blank.
        expect(tipEl.textContent.length).toBeGreaterThan(0);
      }
    });
  });

  await describe('Badge redesign: everything outside ui/badge.js stayed the same (scoped blast radius)', async () => {
    await it('mnemox-score-num and mnemox-tokens still exist with the same contract other code/tests rely on', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a reasonably detailed prompt about something specific here' }, '*');
      const msg = await resultPromise;

      expect(window.document.getElementById('mnemox-score-num').textContent).toBe(String(msg.result.score));
      expect(window.document.getElementById('mnemox-tokens').textContent).toContain('tokens');
    });

    await it('clicking the badge still opens the coach panel (unchanged handler)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help' }, '*');
      await resultPromise;

      const badge = window.document.getElementById('mnemox-score-badge');
      const panel = window.document.getElementById('mnemox-coach-panel');
      expect(panel.style.right).toBe('-360px');
      badge.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(panel.style.right).toBe('0px');
    });

    await it('the coach panel is still kept in sync with the badge\'s score (MnemoxCoach.update still called)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'help me fix this' }, '*');
      const msg = await resultPromise;

      const coachScore = window.document.getElementById('mnemox-coach-score');
      expect(coachScore.textContent).toBe(String(msg.result.score));
    });

    await it('no .innerHTML assignment was introduced (Trusted Types / XSS safety preserved)', () => {
      const src = readSrc('ui/badge.js');
      const codeOnly = src.split('\n').map(line => {
        const idx = line.indexOf('//');
        return idx === -1 ? line : line.slice(0, idx);
      }).join('\n');
      expect(/\.innerHTML\s*=/.test(codeOnly)).toBe(false);
    });
  });
};

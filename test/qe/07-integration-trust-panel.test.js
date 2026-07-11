// QE Suite 07 — integration: response trust scoring -> coach panel (Step 5)
// This is the suite that directly validates Step 5's two success criteria
// from the master plan: "score shown in coaching panel" and the (opt-in)
// memory-consistency signal, end to end through real window.postMessage
// traffic -- not just unit-level scoreResponse() math (see suite 04).

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, createStorage } = require('./lib/harness');
const { waitForMessage } = require('./lib/wait');

module.exports = async function run() {

  await describe('Integration: response trust score -> coach panel (Step 5)', async () => {

    await it('MNEMOX_TRUST_SCORE -> MNEMOX_TRUST_RESULT carries the response text (Defect fix regression)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_TRUST_RESULT');
      window.postMessage({
        type: 'MNEMOX_TRUST_SCORE',
        payload: { text: 'The answer is 42, explained in full detail here today.', platform: 'claude.ai', tokenEstimate: 12, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/1' },
      }, '*');
      const msg = await resultPromise;

      // This exact assertion would have failed before the Step 5 fix --
      // trust.js used to omit `result.text` entirely, so background.js's
      // trace logger always wrote response_text: null.
      expect(msg.result.text).toBe('The answer is 42, explained in full detail here today.');
      expect(msg.result.platform).toBe('claude.ai');
      expect(msg.result.trustScore).toBeDefined();
    });

    await it('the Response Quality section in the coach panel is populated after a trust result', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_TRUST_RESULT');
      window.postMessage({
        type: 'MNEMOX_TRUST_SCORE',
        payload: { text: '# Answer\n\nIn 2024, results improved 20%. For example, `run()` works correctly, e.g. verified in prod.', platform: 'claude.ai', tokenEstimate: 20, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/1' },
      }, '*');
      const msg = await resultPromise;

      const section = window.document.getElementById('mnemox-coach-trust-section');
      expect(section.style.display).toBe('block');
      const scoreEl = window.document.getElementById('mnemox-coach-trust-score');
      expect(scoreEl.textContent).toBe(String(msg.result.trustScore));
      const gradeEl = window.document.getElementById('mnemox-coach-trust-grade');
      expect(gradeEl.textContent).toBe('Grade ' + msg.result.grade);
    });

    await it('the Response Quality section renders a bar for each of the 4 trust signals', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      const resultPromise = waitForMessage(window, 'MNEMOX_TRUST_RESULT');
      window.postMessage({
        type: 'MNEMOX_TRUST_SCORE',
        payload: { text: 'A confident and complete answer with no hedging whatsoever provided here.', platform: 'chatgpt.com', tokenEstimate: 10, completedAt: new Date().toISOString(), url: 'https://chatgpt.com/c/1' },
      }, '*');
      await resultPromise;

      const signalsEl = window.document.getElementById('mnemox-coach-trust-signals');
      expect(signalsEl.children.length).toBe(4); // hedging, completeness, specificity, consistency
    });

    await it('trust section stays hidden (display:none) before any response has been scored', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);
      // Force the coach panel to construct its DOM without ever sending a
      // trust result, by triggering a prompt score first.
      const resultPromise = waitForMessage(window, 'MNEMOX_RESULT');
      window.postMessage({ type: 'MNEMOX_SCORE', text: 'a normal prompt about something' }, '*');
      await resultPromise;

      const section = window.document.getElementById('mnemox-coach-trust-section');
      expect(section.style.display).toBe('none');
    });

    await it('a coach-panel rendering error in updateTrust() cannot crash the pipeline (wrapped in try/catch)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);

      // Sabotage MnemoxCoach.updateTrust to always throw, simulating a DOM/
      // Trusted-Types failure the way ui/badge.js's own MnemoxBadge.update
      // wrapping already protects against for prompt scoring.
      window.eval("MnemoxCoach.updateTrust = function() { throw new Error('simulated render failure'); };");

      // Should not throw / hang -- MNEMOX_TRUST_RESULT still gets posted.
      const resultPromise = waitForMessage(window, 'MNEMOX_TRUST_RESULT');
      window.postMessage({
        type: 'MNEMOX_TRUST_SCORE',
        payload: { text: 'Some response text here for scoring purposes today.', platform: 'claude.ai', tokenEstimate: 8, completedAt: new Date().toISOString(), url: 'https://claude.ai/chat/1' },
      }, '*');
      const msg = await resultPromise;
      expect(msg.result.trustScore).toBeDefined();
    });
  });

  await describe('Integration: Memory Alignment (Step 5 opt-in signal)', async () => {

    await it('updateMemoryAlignment(null/disabled) keeps the alignment box hidden', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);
      window.eval('MnemoxCoach.inject();');
      window.eval("MnemoxCoach.updateMemoryAlignment({ enabled: false });");

      const box = window.document.getElementById('mnemox-coach-memory-alignment');
      expect(box.style.display).toBe('none');
    });

    await it('updateMemoryAlignment() with no related memories shows the "no memories" message', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);
      window.eval('MnemoxCoach.inject();');
      window.eval("MnemoxCoach.updateMemoryAlignment({ enabled: true, available: false });");

      const box = window.document.getElementById('mnemox-coach-memory-alignment');
      expect(box.style.display).toBe('block');
      expect(box.textContent).toContain('No related memories found');
    });

    await it('updateMemoryAlignment() with high similarity shows a "consistent" message with the percentage', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);
      window.eval('MnemoxCoach.inject();');
      window.eval("MnemoxCoach.updateMemoryAlignment({ enabled: true, available: true, count: 3, avgSimilarity: 0.82 });");

      const box = window.document.getElementById('mnemox-coach-memory-alignment');
      expect(box.textContent).toContain('82%');
      expect(box.textContent).toContain('Consistent');
    });

    await it('updateMemoryAlignment() with low similarity shows a "may diverge" warning', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      loadPageWorldScripts(window);
      window.eval('MnemoxCoach.inject();');
      window.eval("MnemoxCoach.updateMemoryAlignment({ enabled: true, available: true, count: 2, avgSimilarity: 0.15 });");

      const box = window.document.getElementById('mnemox-coach-memory-alignment');
      expect(box.textContent).toContain('15%');
      expect(box.textContent).toContain('may diverge');
    });
  });
};

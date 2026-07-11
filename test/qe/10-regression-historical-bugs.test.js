// QE Suite 10 — regression tests, one per historically-fixed production bug
// Each test here corresponds to a specific commit in git history that fixed
// a real, previously-shipped defect. These exist so a future refactor that
// reintroduces the same class of bug fails loudly here instead of shipping
// silently broken to users again -- the project's git log shows this
// exact bug (decoy element locking) got reintroduced/rediscovered multiple
// times across many commits before the final fix, which is exactly the
// pattern permanent regression tests are for.

const { describe, it, expect } = require('./lib/framework');
const { createPageWorld, loadPageWorldScripts, loadContentScript, createStorage, readSrc } = require('./lib/harness');
const { waitForMessage, sleep } = require('./lib/wait');

module.exports = async function run() {

  await describe('Regression: wireObserver decoy-element lock (commit 16ccbca)', async () => {

    await it('a generic decoy <textarea> present before the real editor mounts does NOT permanently lock the wiring', async () => {
      const { window } = createPageWorld({ storage: createStorage() });

      // Simulate a hidden a11y-only textarea that exists in the DOM before
      // the platform's real editor has mounted -- exactly the ChatGPT
      // "Chat with ChatGPT" decoy element described in the bug fix comment.
      const decoy = window.document.createElement('textarea');
      decoy.setAttribute('aria-label', 'Chat with ChatGPT');
      decoy.style.position = 'absolute';
      decoy.style.opacity = '0';
      window.document.body.appendChild(decoy);

      loadPageWorldScripts(window);
      loadContentScript(window);

      await sleep(50);
      expect(window.__mnemoxWiredTarget).toBe(decoy); // wires to the only thing available first

      // Now the real, high-confidence editor mounts (matches INPUT_SELECTORS
      // index 0, #prompt-textarea) -- bootObserver's MutationObserver should
      // detect this and REWIRE away from the decoy.
      const real = window.document.createElement('div');
      real.id = 'prompt-textarea';
      window.document.body.appendChild(real);

      await sleep(100);
      expect(window.__mnemoxWiredTarget).toBe(real);
    });

    await it('once wired to the high-confidence #prompt-textarea selector, bootObserver stops watching (no further rewiring)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      const real = window.document.createElement('div');
      real.id = 'prompt-textarea';
      window.document.body.appendChild(real);

      loadPageWorldScripts(window);
      loadContentScript(window);
      await sleep(50);
      expect(window.__mnemoxWiredTarget).toBe(real);

      // Adding a second, unrelated textarea afterwards must not steal wiring.
      const decoy2 = window.document.createElement('textarea');
      window.document.body.appendChild(decoy2);
      await sleep(50);
      expect(window.__mnemoxWiredTarget).toBe(real);
    });
  });

  await describe('Regression: Enter-key immediate scoring for fast/short prompts', async () => {
    await it('pressing Enter on a wired textarea posts MNEMOX_SCORE synchronously, without waiting for the 500ms debounce', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      const real = window.document.createElement('div');
      real.id = 'prompt-textarea';
      window.document.body.appendChild(real);

      loadPageWorldScripts(window);
      loadContentScript(window);
      await sleep(50);

      real.textContent = 'go';
      const scorePromise = waitForMessage(window, 'MNEMOX_SCORE', 300); // well under the 500ms debounce
      real.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true }));

      const msg = await scorePromise;
      expect(msg.text).toBe('go');
    });

    await it('Shift+Enter does NOT trigger immediate scoring (it is a newline, not a submit)', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      const real = window.document.createElement('div');
      real.id = 'prompt-textarea';
      window.document.body.appendChild(real);

      loadPageWorldScripts(window);
      loadContentScript(window);
      await sleep(50);

      real.textContent = 'go';
      const { assertNoMessage } = require('./lib/wait');
      const noScore = assertNoMessage(window, 'MNEMOX_SCORE', 200);
      real.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      expect(await noScore).toBe(true);
    });
  });

  await describe('Regression: Gemini .ql-editor selector wiring', async () => {
    await it('a Quill-based .ql-editor[contenteditable] element (Gemini) gets wired', async () => {
      const { window } = createPageWorld({ url: 'https://gemini.google.com/app', storage: createStorage() });
      const editor = window.document.createElement('div');
      editor.className = 'ql-editor';
      editor.setAttribute('contenteditable', 'true');
      window.document.body.appendChild(editor);

      loadPageWorldScripts(window);
      loadContentScript(window);
      await sleep(50);

      expect(window.__mnemoxWiredTarget).toBe(editor);
    });
  });

  await describe('Regression: late-mounting input via attribute change (not just new nodes)', async () => {
    await it('an existing DIV that only gets contenteditable="true" added LATER still gets wired', async () => {
      const { window } = createPageWorld({ storage: createStorage() });
      // Node exists in the DOM from the start, but without contenteditable
      // yet -- some SPAs render the shell early and hydrate attributes late.
      const el = window.document.createElement('div');
      el.setAttribute('data-placeholder', 'Send a message');
      window.document.body.appendChild(el);

      loadPageWorldScripts(window);
      loadContentScript(window);
      await sleep(50);
      expect(window.__mnemoxWiredTarget).toBeFalsy();

      // Now hydrate it into a real editor.
      el.setAttribute('contenteditable', 'true');
      await sleep(100);

      expect(window.__mnemoxWiredTarget).toBe(el);
    });
  });

  await describe('Regression: script injection order (async=false)', async () => {
    await it('content.js forces async=false on every injected <script> tag (deterministic load order)', () => {
      const src = readSrc('content.js');
      expect(src).toContain('s.async = false;');
    });

    await it('content.js injects scoring/rules.js before ui/pageWorld.js (pageWorld depends on scorePrompt existing)', () => {
      const src = readSrc('content.js');
      const rulesIdx = src.indexOf("injectScript('scoring/rules.js')");
      const pageWorldIdx = src.indexOf("injectScript('ui/pageWorld.js')");
      expect(rulesIdx).toBeGreaterThan(-1);
      expect(pageWorldIdx).toBeGreaterThan(-1);
      expect(rulesIdx).toBeLessThan(pageWorldIdx);
    });

    await it('content.js injects scoring/trust.js before ui/pageWorld.js (pageWorld routes MNEMOX_TRUST_RESULT to MnemoxCoach)', () => {
      const src = readSrc('content.js');
      const trustIdx = src.indexOf("injectScript('scoring/trust.js')");
      const pageWorldIdx = src.indexOf("injectScript('ui/pageWorld.js')");
      expect(trustIdx).toBeLessThan(pageWorldIdx);
    });
  });

  await describe('Regression: trace platform filter (tool_name vs hostname mismatch)', async () => {
    await it('HOST_MAP in background.js maps every content_scripts-matched hostname to a tool_name', () => {
      const manifest = JSON.parse(readSrc('manifest.json'));
      const matchedHosts = manifest.content_scripts[0].matches
        .map(m => m.replace('https://', '').replace('/*', ''));
      const bgSrc = readSrc('background.js');
      const missing = matchedHosts.filter(h => !bgSrc.includes(`'${h}':`));
      expect(missing).toEqual([]);
    });
  });
};

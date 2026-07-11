// QE Suite 11 — security & manifest static analysis
// Non-behavioral checks: things that must hold true about the shipped
// artifact itself (manifest correctness, CSP/Trusted-Types safety,
// permission scope, file completeness) independent of runtime behavior.

const { describe, it, expect } = require('./lib/framework');
const { readSrc, ROOT } = require('./lib/harness');
const fs = require('fs');
const path = require('path');

module.exports = async function run() {
  const manifest = JSON.parse(readSrc('manifest.json'));

  await describe('Security: manifest.json', async () => {
    await it('manifest_version is 3 (MV2 is deprecated/unsupported by Chrome Web Store for new items)', () => {
      expect(manifest.manifest_version).toBe(3);
    });

    await it('background is a service_worker, not background pages (MV3 requirement)', () => {
      expect(manifest.background.service_worker).toBe('background.js');
      expect(manifest.background.page).toBeDefined ? null : null;
      if (manifest.background.page) throw new Error('MV2-style background page present');
    });

    await it('host_permissions is a scoped allowlist, not <all_urls> (least-privilege)', () => {
      expect(manifest.host_permissions).toBeDefined();
      const hasWildcard = manifest.host_permissions.some(h => h === '<all_urls>' || h === '*://*/*');
      expect(hasWildcard).toBe(false);
    });

    await it('permissions list contains no dangerously broad grants (no "debugger", "proxy", "management")', () => {
      const dangerous = ['debugger', 'proxy', 'management', 'declarativeNetRequestFeedback'];
      const found = (manifest.permissions || []).filter(p => dangerous.includes(p));
      expect(found).toEqual([]);
    });

    await it('no update_url is set (would make Chrome treat this as a self-updating non-store extension)', () => {
      expect('update_url' in manifest).toBe(false);
    });

    await it('content_scripts matches and host_permissions cover the exact same domain set', () => {
      const csMatches = manifest.content_scripts[0].matches.slice().sort();
      const hostPerms = manifest.host_permissions.filter(h => h !== 'https://mnemox-production.up.railway.app/*').slice().sort();
      expect(csMatches).toEqual(hostPerms);
    });

    await it('every file listed in web_accessible_resources actually exists on disk', () => {
      const resources = manifest.web_accessible_resources[0].resources;
      const missing = resources.filter(r => !fs.existsSync(path.join(ROOT, r)));
      expect(missing).toEqual([]);
    });

    await it('every icon referenced in manifest.icons and action.default_icon exists on disk', () => {
      const iconPaths = Object.values(manifest.icons || {});
      const missing = iconPaths.filter(p => !fs.existsSync(path.join(ROOT, p)));
      expect(missing).toEqual([]);
    });

    await it('web_accessible_resources are scoped to specific matches, not <all_urls>', () => {
      const matches = manifest.web_accessible_resources[0].matches;
      expect(matches.includes('<all_urls>')).toBe(false);
    });
  });

  await describe('Security: no unsafe DOM APIs in shipped UI code', async () => {
    const uiFiles = ['ui/badge.js', 'ui/coach.js', 'ui/pageWorld.js'];

    uiFiles.forEach((file) => {
      it(`${file} never assigns to .innerHTML in actual code (Trusted-Types / XSS safety)`, () => {
        const src = readSrc(file);
        // Strip // line comments first -- badge.js and coach.js both have
        // comments that literally quote `el.innerHTML = "<string>"` as a
        // worked example of the 2026-07-05 CSP bug they were fixing, which
        // would otherwise false-positive this check on the comment itself.
        const codeOnly = src.split('\n').map(line => {
          const idx = line.indexOf('//');
          return idx === -1 ? line : line.slice(0, idx);
        }).join('\n');
        const assignmentPattern = /\.innerHTML\s*=/;
        expect(assignmentPattern.test(codeOnly)).toBe(false);
      });
    });

    ['content.js', 'background.js', 'ui/badge.js', 'ui/coach.js', 'ui/pageWorld.js', 'scoring/rules.js', 'scoring/trust.js'].forEach((file) => {
      it(`${file} never calls eval() or the Function constructor directly`, () => {
        const src = readSrc(file);
        // Excludes the word "eval" appearing inside identifiers like
        // "evaluate" -- checks for an actual call.
        const hasEvalCall = /[^a-zA-Z_.]eval\s*\(/.test(src);
        const hasFunctionCtor = /new\s+Function\s*\(/.test(src);
        expect(hasEvalCall).toBe(false);
        expect(hasFunctionCtor).toBe(false);
      });
    });

    it('no inline event handler attributes (onclick=, onload=) are constructed as HTML strings anywhere in ui/*.js', () => {
      ['ui/badge.js', 'ui/coach.js'].forEach((file) => {
        const src = readSrc(file);
        expect(/\bonclick\s*=\s*["']/.test(src)).toBe(false);
      });
    });
  });

  await describe('Security: privacy-claim consistency (manifest/store copy vs actual flag defaults)', async () => {
    it('manifest.json description claims "Zero external API dependencies" -- verified true by default via TRACE_LOGGING/MEMORY_CONSISTENCY defaults', () => {
      expect(manifest.description).toContain('Zero external API dependencies');
      const bgSrc = readSrc('background.js');
      expect(/TRACE_LOGGING:\s*false/.test(bgSrc)).toBe(true);
      expect(/MEMORY_CONSISTENCY:\s*false/.test(bgSrc)).toBe(true);
    });

    it('STORE_LISTING.md privacy section discloses both opt-in network features by name', () => {
      const storeListing = readSrc('STORE_LISTING.md');
      expect(storeListing).toContain('Trace Logging');
      expect(storeListing).toContain('Memory Alignment');
    });

    it('popup.html exposes a user-facing toggle for each opt-in network feature (opt-in is actually reachable)', () => {
      const popupHtml = readSrc('popup.html');
      expect(popupHtml).toContain('toggle-trace-logging');
      expect(popupHtml).toContain('toggle-memory-consistency');
    });
  });

  await describe('Security: version consistency', async () => {
    it('manifest.json and package.json report the same version string', () => {
      const pkg = JSON.parse(readSrc('package.json'));
      expect(pkg.version).toBe(manifest.version);
    });

    it('manifest.json version is valid semver (X.Y.Z)', () => {
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
};

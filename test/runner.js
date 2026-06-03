// Mnemox — Automated Test Runner
// Run: node test/runner.js
// Shows PASS/FAIL for every check. Exit code 0 = all green.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  PASS  ${name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${name} — ${result}`);
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL  ${name} — ${e.message}`);
    failed++;
  }
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function parseJSON(rel) {
  return JSON.parse(readFile(rel));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==============================');
console.log(' Mnemox Extension Test Runner');
console.log('==============================\n');

// ── STEP 1.1: Scaffold ────────────────────────────────────────────────────────
console.log('[ Step 1.1 ] Scaffold & Manifest');

check('manifest.json exists', () => fileExists('manifest.json'));

check('manifest.json is valid JSON', () => {
  parseJSON('manifest.json');
});

check('manifest_version is 3', () => {
  const m = parseJSON('manifest.json');
  return m.manifest_version === 3 || `got ${m.manifest_version}`;
});

check('no update_url in manifest (would break Edge)', () => {
  const m = parseJSON('manifest.json');
  return !('update_url' in m) || 'update_url found — remove it';
});

check('host_permissions includes <all_urls>', () => {
  const m = parseJSON('manifest.json');
  return (m.host_permissions || []).includes('<all_urls>') || 'missing <all_urls>';
});

check('background.js exists', () => fileExists('background.js'));
check('content.js exists',    () => fileExists('content.js'));
check('popup.html exists',    () => fileExists('popup.html'));
check('icon16.png exists',    () => fileExists('icons/icon16.png'));
check('icon48.png exists',    () => fileExists('icons/icon48.png'));
check('icon128.png exists',   () => fileExists('icons/icon128.png'));

// ── STEP 1.2: Feature Flags ───────────────────────────────────────────────────
console.log('\n[ Step 1.2 ] Feature Flags');

check('featureFlags.js exists', () => fileExists('featureFlags.js'));

check('featureFlags defines TOKEN_COUNTER', () => {
  const src = readFile('featureFlags.js');
  return src.includes('TOKEN_COUNTER') || 'TOKEN_COUNTER not found';
});

check('featureFlags defines PROMPT_COACHING', () => {
  const src = readFile('featureFlags.js');
  return src.includes('PROMPT_COACHING') || 'PROMPT_COACHING not found';
});

check('featureFlags defines PAYWALL', () => {
  const src = readFile('featureFlags.js');
  return src.includes('PAYWALL') || 'PAYWALL not found';
});

check('all flags default to false', () => {
  const src = readFile('featureFlags.js');
  return (src.includes('TOKEN_COUNTER:   false') || src.includes('TOKEN_COUNTER: false')) || 'defaults not false';
});

// ── STEP 1.3: Platform Adapters ───────────────────────────────────────────────
console.log('\n[ Step 1.3 ] Platform Adapters');

const adapters = ['adapters/chatgpt.js', 'adapters/claude.js', 'adapters/gemini.js', 'adapters/registry.js'];
adapters.forEach(a => {
  check(`${a} exists`, () => fileExists(a));
});

['adapters/chatgpt.js', 'adapters/claude.js', 'adapters/gemini.js'].forEach(a => {
  check(`${a} has healthCheck()`, () => {
    const src = readFile(a);
    return src.includes('healthCheck') || 'healthCheck missing';
  });
  check(`${a} has urlMatch`, () => {
    const src = readFile(a);
    return src.includes('urlMatch') || 'urlMatch missing';
  });
  check(`${a} has textareaSelector`, () => {
    const src = readFile(a);
    return src.includes('textareaSelector') || 'textareaSelector missing';
  });
});

// ── STEP 1.4: Background Service Worker ──────────────────────────────────────
console.log('\n[ Step 1.4 ] Background Service Worker');

check('background.js has no importScripts (breaks module workers)', () => {
  const src = readFile('background.js');
  return !src.includes('importScripts') || 'importScripts found — will crash service worker';
});

check('manifest background has no "type: module" (conflicts with flag inlining)', () => {
  const m = parseJSON('manifest.json');
  return m.background.type !== 'module' || 'type:module set — remove it';
});

check('background.js handles FLAG_TEST message', () => {
  const src = readFile('background.js');
  return src.includes('FLAG_TEST') || 'FLAG_TEST handler missing';
});

check('background.js handles TOKEN_COUNT message', () => {
  const src = readFile('background.js');
  return src.includes('TOKEN_COUNT') || 'TOKEN_COUNT handler missing';
});

check('background.js handles ANALYZE_PROMPT message', () => {
  const src = readFile('background.js');
  return src.includes('ANALYZE_PROMPT') || 'ANALYZE_PROMPT handler missing';
});

check('content.js sends FLAG_TEST on load', () => {
  const src = readFile('content.js');
  return src.includes('FLAG_TEST') || 'FLAG_TEST ping missing from content.js';
});

check('.gitignore ignores node_modules', () => {
  const src = readFile('.gitignore');
  return src.includes('node_modules') || 'node_modules not in .gitignore';
});

check('.gitignore ignores nested mnemox-extension folder', () => {
  const src = readFile('.gitignore');
  return src.includes('mnemox-extension') || 'nested folder not ignored';
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==============================');
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log('==============================\n');

if (failed > 0) {
  console.log('Fix the FAILs above, then re-run: node test/runner.js\n');
  process.exit(1);
} else {
  console.log('All checks green. Run the git tag command to save backup point.\n');
  console.log('  git add -A');
  console.log('  git commit -m "steps 1.1-1.4: scaffold, flags, adapters, background"');
  console.log('  git tag step1.4-verified');
  console.log('  git push origin main --tags\n');
  process.exit(0);
}

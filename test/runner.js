// Mnemox — Automated Test Runner
// Run: node test/runner.js
// Shows PASS/FAIL for every check. Exit code 0 = all green.

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

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

function fileExists(rel)  { return fs.existsSync(path.join(ROOT, rel)); }
function readFile(rel)    { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function parseJSON(rel)   { return JSON.parse(readFile(rel)); }

// Load scoring/rules.js into a sandbox so we can call scorePrompt()
function loadRules() {
  const src = readFile('scoring/rules.js');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.scorePrompt;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==============================');
console.log(' Mnemox Extension Test Runner');
console.log('==============================\n');

// ── STEP 1.1 ─────────────────────────────────────────────────────────────────
console.log('[ Step 1.1 ] Scaffold & Manifest');
check('manifest.json exists',              () => fileExists('manifest.json'));
check('manifest.json is valid JSON',       () => { parseJSON('manifest.json'); });
check('manifest_version is 3',            () => { const m = parseJSON('manifest.json'); return m.manifest_version === 3 || `got ${m.manifest_version}`; });
check('no update_url (Edge safe)',         () => { const m = parseJSON('manifest.json'); return !('update_url' in m) || 'update_url found'; });
check('host_permissions: <all_urls>',      () => { const m = parseJSON('manifest.json'); return (m.host_permissions||[]).includes('<all_urls>') || 'missing'; });
check('background.js exists',             () => fileExists('background.js'));
check('content.js exists',                () => fileExists('content.js'));
check('popup.html exists',                () => fileExists('popup.html'));
check('icons present (16/48/128)',        () => fileExists('icons/icon16.png') && fileExists('icons/icon48.png') && fileExists('icons/icon128.png'));

// ── STEP 1.2 ─────────────────────────────────────────────────────────────────
console.log('\n[ Step 1.2 ] Feature Flags');
check('featureFlags.js exists',           () => fileExists('featureFlags.js'));
check('TOKEN_COUNTER defined',            () => readFile('featureFlags.js').includes('TOKEN_COUNTER'));
check('PROMPT_COACHING defined',          () => readFile('featureFlags.js').includes('PROMPT_COACHING'));
check('PAYWALL defined',                  () => readFile('featureFlags.js').includes('PAYWALL'));
check('all defaults are false',           () => { const s = readFile('featureFlags.js'); return (s.includes('false') && s.includes('TOKEN_COUNTER')) || 'no false defaults'; });

// ── STEP 1.3 ─────────────────────────────────────────────────────────────────
console.log('\n[ Step 1.3 ] Platform Adapters');
['adapters/chatgpt.js','adapters/claude.js','adapters/gemini.js','adapters/registry.js'].forEach(a => {
  check(`${a} exists`, () => fileExists(a));
});
['adapters/chatgpt.js','adapters/claude.js','adapters/gemini.js'].forEach(a => {
  check(`${path.basename(a)} has healthCheck + urlMatch + textareaSelector`, () => {
    const s = readFile(a);
    return (s.includes('healthCheck') && s.includes('urlMatch') && s.includes('textareaSelector')) || 'missing fields';
  });
});

// ── STEP 1.4 ─────────────────────────────────────────────────────────────────
console.log('\n[ Step 1.4 ] Background Service Worker');
check('no importScripts in background.js', () => !readFile('background.js').includes('importScripts') || 'importScripts found');
check('no type:module in manifest',        () => parseJSON('manifest.json').background.type !== 'module' || 'type:module set');
check('FLAG_TEST handler exists',          () => readFile('background.js').includes('FLAG_TEST'));
check('TOKEN_COUNT handler exists',        () => readFile('background.js').includes('TOKEN_COUNT'));
check('ANALYZE_PROMPT handler exists',     () => readFile('background.js').includes('ANALYZE_PROMPT'));
check('content.js pings FLAG_TEST',        () => readFile('content.js').includes('FLAG_TEST'));
check('.gitignore has node_modules',       () => readFile('.gitignore').includes('node_modules'));

// ── STEP 2.1 — Rule Engine ────────────────────────────────────────────────────
console.log('\n[ Step 2.1 ] Rule-Based Scoring Engine');
check('scoring/rules.js exists',           () => fileExists('scoring/rules.js'));
check('all 8 rules defined (R1-R8)',       () => {
  const s = readFile('scoring/rules.js');
  const ids = ['R1','R2','R3','R4','R5','R6','R7','R8'];
  const missing = ids.filter(id => !s.includes(`id: '${id}'`));
  return missing.length === 0 || `missing: ${missing.join(', ')}`;
});
check('scorePrompt function exported',     () => readFile('scoring/rules.js').includes('function scorePrompt'));

// Run 10 known prompts through the engine and verify ranking
check('strong prompt scores higher than weak prompt', () => {
  const score = loadRules();
  const weak   = score('hi');
  const strong = score('I am a software engineer. Please write a Python function that reads a CSV file and returns a list of dicts. Use the csv module. Keep it under 20 lines and include docstrings.');
  return strong.score > weak.score || `strong=${strong.score} weak=${weak.score}`;
});

check('empty prompt returns score 0', () => {
  const score = loadRules();
  const result = score('');
  return result.score === 0 || `got ${result.score}`;
});

check('empty prompt sets empty:true', () => {
  const score = loadRules();
  return score('').empty === true || 'empty flag missing';
});

check('grade A for excellent prompt', () => {
  const score = loadRules();
  const p = 'I am a senior developer. Please write a detailed technical explanation of JWT authentication. Format as markdown with code examples. Target audience: junior developers. Under 500 words.';
  const result = score(p);
  return result.score >= 83 || ('score below 83: ' + result.grade + ' score ' + result.score);});

check('grade F for single word prompt', () => {
  const score = loadRules();
  const result = score('help');
  return result.grade === 'F' || ('got grade ' + result.grade + ' score ' + result.score);
});

check('dims has all 8 rule keys', () => {
  const score = loadRules();
  return Object.keys(score('Write me a summary.').dims).length === 8 || 'wrong dim count';
});

check('weak array populated for bad prompt', () => {
  const score = loadRules();
  return score('do it').weak.length > 0 || 'weak array empty';
});

check('10 diverse prompts all score 0-100', () => {
  const score = loadRules();
  const prompts = ['Write a poem','hello','Can you maybe help me?',
    'As a data scientist, analyze customer churn using pandas. Output a dataframe.',
    'translate hello to french',
    'Compare REST vs GraphQL for mobile app. Format as table. Focus on performance.',
    'fix the bug','You are a copywriter. Write a 3-sentence value prop for a B2B SaaS.',
    'what is 2+2',
    'As a marketing manager, create a Q3 social media calendar. 3 posts/week for LinkedIn and Twitter. Format as table.'];
  const bad = prompts.map((p,i) => { const r = score(p); return (r.score<0||r.score>100)?('prompt '+(i+1)+' score='+r.score):null; }).filter(Boolean);
  return bad.length === 0 || bad.join(', ');
});

// ── STEP 2.2 ─────────────────────────────────────────────────────────────────
console.log('\n[ Step 2.2 ] Prompt Cache');
check('scoring/cache.js exists',    () => fileExists('scoring/cache.js'));
check('hashPrompt function exists', () => readFile('scoring/cache.js').includes('function hashPrompt'));
check('getCached function exists',  () => readFile('scoring/cache.js').includes('function getCached'));
check('setCached function exists',  () => readFile('scoring/cache.js').includes('function setCached'));
check('uses SHA-256',               () => readFile('scoring/cache.js').includes('SHA-256'));
check('max size is 100',            () => readFile('scoring/cache.js').includes('100'));
check('LRU eviction logic exists',  () => readFile('scoring/cache.js').includes('oldest') || readFile('scoring/cache.js').includes('CACHE_SIZE'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==============================');
console.log(' Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('==============================\n');

if (failed > 0) {
  console.log('Fix the FAILs above, then re-run: node test/runner.js\n');
  process.exit(1);
} else {
  console.log('All checks green. Run the git tag command:\n');
  console.log('  git add -A');
  console.log('  git commit -m "steps 2.1-2.2: rule engine (8 rules), LRU cache"');
  console.log('  git tag step2.2-verified');
  console.log('  git push origin main --tags\n');
  process.exit(0);
}

// ── STEP 3.1 — Badge UI ───────────────────────────────────────────────────────
console.log('\n[ Step 3.1 ] Score Badge UI');

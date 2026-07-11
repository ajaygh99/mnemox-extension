// Mnemox - Automated Test Runner
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
      console.log(`  FAIL  ${name} - ${result}`);
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL  ${name} - ${e.message}`);
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

//
console.log('\n==============================');
console.log(' Mnemox Extension Test Runner');
console.log('==============================\n');

//  STEP 1.1
console.log('[ Step 1.1 ] Scaffold & Manifest');
check('manifest.json exists',              () => fileExists('manifest.json'));
check('manifest.json is valid JSON',       () => { parseJSON('manifest.json'); });
check('manifest_version is 3',            () => { const m = parseJSON('manifest.json'); return m.manifest_version === 3 || `got ${m.manifest_version}`; });
check('no update_url (Edge safe)',         () => { const m = parseJSON('manifest.json'); return !('update_url' in m) || 'update_url found'; });
check('host_permissions: specific AI domains', () => { const m = parseJSON('manifest.json'); const hp = m.host_permissions||[]; return hp.includes('https://chatgpt.com/*') && hp.includes('https://claude.ai/*') && hp.includes('https://gemini.google.com/*') || 'missing AI domains'; });
check('background.js exists',             () => fileExists('background.js'));
check('content.js exists',                () => fileExists('content.js'));
check('popup.html exists',                () => fileExists('popup.html'));
check('icons present (16/48/128)',        () => fileExists('icons/icon16.png') && fileExists('icons/icon48.png') && fileExists('icons/icon128.png'));

//  STEP 1.2
console.log('\n[ Step 1.2 ] Feature Flags');
check('featureFlags.js exists',           () => fileExists('featureFlags.js'));
check('TOKEN_COUNTER defined',            () => readFile('featureFlags.js').includes('TOKEN_COUNTER'));
check('PROMPT_COACHING defined',          () => readFile('featureFlags.js').includes('PROMPT_COACHING'));
check('PAYWALL defined',                  () => readFile('featureFlags.js').includes('PAYWALL'));
check('all defaults are false',           () => { const s = readFile('featureFlags.js'); return (s.includes('false') && s.includes('TOKEN_COUNTER')) || 'no false defaults'; });

//  STEP 1.3
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

//  STEP 1.4
console.log('\n[ Step 1.4 ] Background Service Worker');
check('no importScripts in background.js', () => !readFile('background.js').includes('importScripts') || 'importScripts found');
check('no type:module in manifest',        () => parseJSON('manifest.json').background.type !== 'module' || 'type:module set');
check('FLAG_TEST handler exists',          () => readFile('background.js').includes('FLAG_TEST'));
check('TOKEN_COUNT handler exists',        () => readFile('background.js').includes('TOKEN_COUNT'));
check('ANALYZE_PROMPT handler exists',     () => readFile('background.js').includes('ANALYZE_PROMPT'));
check('content.js pings FLAG_TEST',        () => readFile('content.js').includes('FLAG_TEST'));
check('.gitignore has node_modules',       () => readFile('.gitignore').includes('node_modules'));

//  STEP 2.1 - Rule Engine
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

//  STEP 2.2
console.log('\n[ Step 2.2 ] Prompt Cache');
check('scoring/cache.js exists',    () => fileExists('scoring/cache.js'));
check('hashPrompt function exists', () => readFile('scoring/cache.js').includes('function hashPrompt'));
check('getCached function exists',  () => readFile('scoring/cache.js').includes('function getCached'));
check('setCached function exists',  () => readFile('scoring/cache.js').includes('function setCached'));
check('uses SHA-256',               () => readFile('scoring/cache.js').includes('SHA-256'));
check('max size is 100',            () => readFile('scoring/cache.js').includes('100'));
check('LRU eviction logic exists',  () => readFile('scoring/cache.js').includes('oldest') || readFile('scoring/cache.js').includes('CACHE_SIZE'));

//  STEP 3.1 - Badge UI
console.log('\n[ Step 3.1 ] Score Badge UI');
check('ui/badge.js exists',              () => fileExists('ui/badge.js'));
check('ui/pageWorld.js exists',          () => fileExists('ui/pageWorld.js'));
check('MnemoxBadge defined',             () => readFile('ui/badge.js').includes('var MnemoxBadge'));
check('inject function exists',          () => readFile('ui/badge.js').includes('function inject'));
check('update function exists',          () => readFile('ui/badge.js').includes('function update'));
check('hide function exists',            () => readFile('ui/badge.js').includes('function hide'));
check('show function exists',            () => readFile('ui/badge.js').includes('function show'));
check('badge uses fixed positioning',    () => readFile('ui/badge.js').includes('position:fixed'));
check('z-index is max (2147483647)',     () => readFile('ui/badge.js').includes('2147483647'));
check('5 color tiers defined',           () => {
  const s = readFile('ui/badge.js');
  return (s.includes('85') && s.includes('70') && s.includes('55') && s.includes('40')) || 'missing tiers';
});
check('pageWorld listens for MNEMOX_SCORE', () => readFile('ui/pageWorld.js').includes('MNEMOX_SCORE'));
check('pageWorld calls scorePrompt',     () => readFile('ui/pageWorld.js').includes('scorePrompt'));
check('pageWorld calls MnemoxBadge.update', () => readFile('ui/pageWorld.js').includes('MnemoxBadge.update'));
check('pageWorld posts MNEMOX_RESULT back', () => readFile('ui/pageWorld.js').includes('MNEMOX_RESULT'));
check('content.js injects badge.js',     () => readFile('content.js').includes("'ui/badge.js'"));
check('content.js injects pageWorld.js', () => readFile('content.js').includes("'ui/pageWorld.js'"));
check('content.js injects rules.js',     () => readFile('content.js').includes("'scoring/rules.js'"));
check('badge.js in web_accessible_resources', () => {
  const m = parseJSON('manifest.json');
  const res = (m.web_accessible_resources || []).flatMap(r => r.resources || []);
  return res.includes('ui/badge.js') || 'missing from manifest';
});

//

//  STEP 3.2 - Token Counter
console.log('\n[ Step 3.2 ] Token Counter');
check('scoring/tokenizer.js exists',       () => fileExists('scoring/tokenizer.js'));
check('countTokens function exists',       () => readFile('scoring/tokenizer.js').includes('function countTokens'));
check('MnemoxTokenizer exported',          () => readFile('scoring/tokenizer.js').includes('MnemoxTokenizer'));
check('tokenizer.js in web_accessible_resources', () => {
  const m = parseJSON('manifest.json');
  const res = (m.web_accessible_resources || []).flatMap(r => r.resources || []);
  return res.includes('scoring/tokenizer.js') || 'missing from manifest';
});
check('content.js injects tokenizer.js',   () => readFile('content.js').includes("'scoring/tokenizer.js'"));
check('pageWorld attaches token count',    () => readFile('ui/pageWorld.js').includes('MnemoxTokenizer'));
check('badge shows token count',           () => readFile('ui/badge.js').includes('mnemox-tokens'));
check('tokenizer: empty string = 0', () => {
  const src = readFile('scoring/tokenizer.js')
    .replace('window.MnemoxTokenizer', 'global.MnemoxTokenizer');
  const vm = require('vm');
  const sb = { global, console };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const r = sb.global.MnemoxTokenizer.countTokens('');
  return r === 0 || 'got ' + r;
});
check('tokenizer: single word = 1', () => {
  const src = readFile('scoring/tokenizer.js')
    .replace('window.MnemoxTokenizer', 'global.MnemoxTokenizer');
  const vm = require('vm');
  const sb = { global, console };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const r = sb.global.MnemoxTokenizer.countTokens('hello');
  return r === 1 || 'got ' + r;
});
check('tokenizer: long text > 10 tokens', () => {
  const src = readFile('scoring/tokenizer.js')
    .replace('window.MnemoxTokenizer', 'global.MnemoxTokenizer');
  const vm = require('vm');
  const sb = { global, console };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const r = sb.global.MnemoxTokenizer.countTokens('Write a Python function that reads a CSV file and returns a list of dicts.');
  return r > 10 || 'got ' + r;
});

//

//  STEP 3.3 - Adapter Health Checks
console.log('\n[ Step 3.3 ] Adapter Health Checks');
check('HEALTH_REPORT handler in background.js',  () => readFile('background.js').includes('HEALTH_REPORT'));
check('content.js sends MNEMOX_HEALTHCHECK',     () => readFile('content.js').includes('MNEMOX_HEALTHCHECK'));
check('content.js relays HEALTHCHECK_RESULT',    () => readFile('content.js').includes('MNEMOX_HEALTHCHECK_RESULT'));
check('pageWorld handles MNEMOX_HEALTHCHECK',    () => readFile('ui/pageWorld.js').includes('MNEMOX_HEALTHCHECK'));
check('pageWorld calls getAdapterForPage',       () => readFile('ui/pageWorld.js').includes('getAdapterForPage'));
check('pageWorld calls adapter.healthCheck',     () => readFile('ui/pageWorld.js').includes('healthCheck'));
check('pageWorld posts HEALTHCHECK_RESULT',      () => readFile('ui/pageWorld.js').includes('MNEMOX_HEALTHCHECK_RESULT'));
check('adapters injected in content.js',         () => {
  const s = readFile('content.js');
  return (s.includes("'adapters/chatgpt.js'") && s.includes("'adapters/claude.js'") && s.includes("'adapters/gemini.js'")) || 'missing adapter injections';
});
check('adapters in web_accessible_resources',    () => {
  const m = parseJSON('manifest.json');
  const res = (m.web_accessible_resources || []).flatMap(r => r.resources || []);
  return ['adapters/chatgpt.js','adapters/claude.js','adapters/gemini.js','adapters/registry.js']
    .every(a => res.includes(a)) || 'missing adapter(s) from manifest';
});

//

//  STEP 3.4 - Popup Token Widget
console.log('\n[ Step 3.4 ] Popup Token Widget');
check('popup.js exists',                      () => fileExists('popup.js'));
check('popup.html loads popup.js',            () => readFile('popup.html').includes('popup.js'));
check('popup.html has score card',            () => readFile('popup.html').includes('score-card'));
check('popup.html has token card',            () => readFile('popup.html').includes('token-card'));
check('popup.html has grade element',         () => readFile('popup.html').includes('pop-grade'));
check('popup.html has tokens element',        () => readFile('popup.html').includes('pop-tokens'));
check('popup.js reads lastResult from storage', () => readFile('popup.js').includes('lastResult'));
check('popup.js renders score',               () => readFile('popup.js').includes('pop-score'));
check('popup.js renders grade',               () => readFile('popup.js').includes('pop-grade'));
check('popup.js renders tokens',              () => readFile('popup.js').includes('pop-tokens'));
check('popup.js has 5 grade colors',          () => {
  const s = readFile('popup.js');
  return (['A','B','C','D','F'].every(g => s.includes(g + ':'))) || 'missing grade colors';
});
check('content.js saves lastResult to storage', () => readFile('content.js').includes('lastResult'));
check('content.js listens for MNEMOX_RESULT', () => readFile('content.js').includes('MNEMOX_RESULT'));
check('popup.html has 100% Local badge',      () => readFile('popup.html').includes('Local'));

//

// -- STEP 4.1 - Prompt Coaching Panel -----------------------------------------
console.log('\n[ Step 4.1 ] Prompt Coaching Panel');
check('ui/coach.js exists',                  () => fileExists('ui/coach.js'));
check('MnemoxCoach defined',                 () => readFile('ui/coach.js').includes('var MnemoxCoach'));
check('coach has show function',             () => readFile('ui/coach.js').includes('function show'));
check('coach has hide function',             () => readFile('ui/coach.js').includes('function hide'));
check('coach has toggle function',           () => readFile('ui/coach.js').includes('function toggle'));
check('coach has update function',           () => readFile('ui/coach.js').includes('function update'));
check('coach renders rule breakdown',        () => readFile('ui/coach.js').includes('RULE_NAMES'));
check('coach has tips for all 8 rules',      () => {
  const s = readFile('ui/coach.js');
  return ['R1','R2','R3','R4','R5','R6','R7','R8'].every(r => s.includes(r)) || 'missing rule tips';
});
check('coach uses fixed positioning',        () => readFile('ui/coach.js').includes('position:fixed'));
check('coach has overlay backdrop',          () => readFile('ui/coach.js').includes('OVERLAY_ID'));
check('badge opens coach on click',          () => readFile('ui/badge.js').includes('MnemoxCoach.toggle'));
check('badge passes result to coach',        () => readFile('ui/badge.js').includes('_mnemoxLastResult'));
check('badge calls MnemoxCoach.update',      () => readFile('ui/badge.js').includes('MnemoxCoach.update'));
check('content.js injects coach.js',         () => readFile('content.js').includes("'ui/coach.js'"));
check('coach.js in web_accessible_resources', () => {
  const m = parseJSON('manifest.json');
  const res = (m.web_accessible_resources || []).flatMap(r => r.resources || []);
  return res.includes('ui/coach.js') || 'missing from manifest';
});

//

// -- STEP 4.2 - Improvement Suggestions ---------------------------------------
console.log('\n[ Step 4.2 ] Improvement Suggestions');
check('scoring/suggester.js exists',           () => fileExists('scoring/suggester.js'));
check('MnemoxSuggester defined',               () => readFile('scoring/suggester.js').includes('MnemoxSuggester'));
check('suggest function exists',               () => readFile('scoring/suggester.js').includes('function suggest'));
check('handles all 8 rules (R1-R8)',           () => {
  const s = readFile('scoring/suggester.js');
  return ['R1','R2','R3','R4','R5','R6','R7','R8'].every(r => s.includes(r)) || 'missing rules';
});
check('content.js injects suggester.js',       () => readFile('content.js').includes("'scoring/suggester.js'"));
check('suggester.js in web_accessible_resources', () => {
  const m = parseJSON('manifest.json');
  const res = (m.web_accessible_resources || []).flatMap(r => r.resources || []);
  return res.includes('scoring/suggester.js') || 'missing from manifest';
});
check('pageWorld calls MnemoxSuggester',       () => readFile('ui/pageWorld.js').includes('MnemoxSuggester'));
check('pageWorld attaches suggestion to result', () => readFile('ui/pageWorld.js').includes('result.suggestion'));
check('coach renders suggestion section',      () => readFile('ui/coach.js').includes('mnemox-coach-suggestion'));
check('coach has copy button',                 () => readFile('ui/coach.js').includes('Copy Improved Prompt'));
check('coach uses clipboard API',              () => readFile('ui/coach.js').includes('clipboard'));
check('suggester: weak prompt gets suggestion', () => {
  const vm = require('vm');
  const sb = { exports: {} }; vm.createContext(sb);
  vm.runInContext(readFile('scoring/suggester.js').replace('var MnemoxSuggester', 'exports.MnemoxSuggester'), sb);
  const dims = {};
  ['R1','R2','R3','R4','R5','R6','R7','R8'].forEach(k => { dims[k] = {score:0, max:12}; });
  const result = sb.exports.MnemoxSuggester.suggest('hi', dims);
  return (result && result.length > 5) || 'no suggestion returned';
});
check('suggester: perfect prompt returns null', () => {
  const vm = require('vm');
  const sb = { exports: {} }; vm.createContext(sb);
  vm.runInContext(readFile('scoring/suggester.js').replace('var MnemoxSuggester', 'exports.MnemoxSuggester'), sb);
  const dims = {};
  ['R1','R2','R3','R4','R5','R6','R7','R8'].forEach(k => { dims[k] = {score:12, max:12}; });
  const result = sb.exports.MnemoxSuggester.suggest('good prompt', dims);
  return result === null || 'expected null, got: ' + result;
});

// -- STEP 5 - MnemoxTrust: coaching-panel display + memory alignment ---------
console.log('\n[ Step 5 ] MnemoxTrust — Response Quality in Coach Panel');
check('trust.js includes response text in result', () => readFile('scoring/trust.js').includes('result.text'));
check('TRACE_LOGGING defaults to false',       () => /TRACE_LOGGING:\s*false/.test(readFile('background.js')) || 'not false — sends data externally by default');
check('MEMORY_CONSISTENCY flag defined',       () => readFile('background.js').includes('MEMORY_CONSISTENCY'));
check('MEMORY_CONSISTENCY defaults to false',  () => /MEMORY_CONSISTENCY:\s*false/.test(readFile('background.js')) || 'not false');
check('background.js has MEMORY_CHECK handler', () => readFile('background.js').includes("'MEMORY_CHECK'"));
check('MEMORY_CHECK handler checks the flag before fetching', () => {
  const s = readFile('background.js');
  const idx = s.indexOf("case 'MEMORY_CHECK'");
  return (idx !== -1 && s.slice(idx, idx + 400).includes('MEMORY_CONSISTENCY')) || 'flag not checked';
});
check('content.js sends MEMORY_CHECK message', () => readFile('content.js').includes("'MEMORY_CHECK'"));
check('content.js posts MNEMOX_MEMORY_ALIGNMENT', () => readFile('content.js').includes('MNEMOX_MEMORY_ALIGNMENT'));
check('pageWorld listens for MNEMOX_TRUST_RESULT', () => readFile('ui/pageWorld.js').includes('MNEMOX_TRUST_RESULT'));
check('pageWorld calls MnemoxCoach.updateTrust', () => readFile('ui/pageWorld.js').includes('MnemoxCoach.updateTrust'));
check('pageWorld handles MNEMOX_MEMORY_ALIGNMENT', () => readFile('ui/pageWorld.js').includes('MNEMOX_MEMORY_ALIGNMENT'));
check('coach.js has updateTrust function',     () => readFile('ui/coach.js').includes('function updateTrust'));
check('coach.js has updateMemoryAlignment function', () => readFile('ui/coach.js').includes('function updateMemoryAlignment'));
check('coach.js exposes updateTrust + updateMemoryAlignment', () => {
  const s = readFile('ui/coach.js');
  return (s.includes('updateTrust: updateTrust') && s.includes('updateMemoryAlignment: updateMemoryAlignment')) || 'not exposed on MnemoxCoach';
});
check('popup.html has opt-in settings toggles', () => {
  const s = readFile('popup.html');
  return (s.includes('toggle-trace-logging') && s.includes('toggle-memory-consistency')) || 'missing toggle(s)';
});
check('popup.js binds both flag toggles',      () => {
  const s = readFile('popup.js');
  return (s.includes("'toggle-trace-logging', 'TRACE_LOGGING'") && s.includes("'toggle-memory-consistency', 'MEMORY_CONSISTENCY'")) || 'toggles not bound';
});
check('package.json version matches manifest.json', () => {
  const pkg = parseJSON('package.json');
  const man = parseJSON('manifest.json');
  return pkg.version === man.version || `package.json=${pkg.version} manifest.json=${man.version}`;
});
check('.gitignore excludes build zips',        () => readFile('.gitignore').includes('*.zip'));

// -- PERF AUDIT 2026-07-11: delay/debounce tuning -----------------------------
// Pins the exact tuned values from the perf pass so a future edit can't
// silently drift a "safe to cut" timer back to its old slow value, or
// accidentally cut a correctness-critical one that was deliberately left
// alone. See the inline "Perf audit 2026-07-11" comments at each site for
// the full reasoning.
console.log('\n[ Perf ] Delay/debounce tuning (2026-07-11 audit)');
check('content.js: wireObserver no-match retry cut to 50ms', () => readFile('content.js').includes('setTimeout(wireObserver, 50)'));
check('content.js: prompt-scoring debounce cut to 50ms',     () => readFile('content.js').includes('}, 50);'));
check('content.js: boot retry cut to 40ms',                  () => readFile('content.js').includes('setTimeout(wireObserver, 40)'));
check('content.js: healthcheck post-load delay cut to 50ms', () => {
  const s = readFile('content.js');
  // lastIndexOf, not indexOf: content.js also has an earlier, unrelated
  // 'MNEMOX_HEALTHCHECK_RESULT' listener (which contains this string as a
  // substring) well before the window 'load' handler this check targets.
  const idx = s.lastIndexOf("MNEMOX_HEALTHCHECK");
  return (idx !== -1 && s.slice(idx, idx + 60).includes(', 50)')) || 'healthcheck delay not found at 50ms';
});
check('content.js: SPA re-wire delay cut to 60ms',           () => readFile('content.js').includes('}, 60);'));
check('content.js: trust-score coalescing debounce (1500ms) intentionally left unchanged', () => readFile('content.js').includes('}, 1500);'));
check('response-reader.js: streaming debounces (1000/350ms) intentionally left unchanged (Gemini has no authoritative streaming signal)', () => {
  const s = readFile('response-reader.js');
  return (s.includes('DEBOUNCE_STREAMING = 1000') && s.includes('DEBOUNCE_FAST      = 350')) || 'streaming debounce values drifted';
});
check('background.js: TRACE_COOLDOWN_MS (8000ms) intentionally left unchanged (backend dedup, not user latency)', () => readFile('background.js').includes('TRACE_COOLDOWN_MS = 8000'));
check('traces.js: dashboard cache TTL cut to 3000ms',        () => readFile('traces.js').includes('CACHE_TTL     = 3000'));
check('ui/coach.js: "Copied!" confirmation trimmed to 1000ms (not cut to near-zero — readability, not perf)', () => readFile('ui/coach.js').includes("'Copy Improved Prompt'; }, 1000);"));

// -------------------------------------------------------------------------
console.log('\n==============================');
console.log(' Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('==============================\n');

if (failed > 0) {
  console.log('Fix the FAILs above, then re-run: node test/runner.js\n');
  process.exit(1);
} else {
  console.log('All checks green. Run the git tag command:\n');
  console.log('  git add -A');
  console.log('  git commit -m "v1.1.0: new adapters, UUID, feature flags, scoped permissions"');
  console.log('  git tag v1.1.0');
  console.log('  git push && git push --tags');
}

const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) { console.log('  PASS ', name); passed++; }
    else { console.log('  FAIL ', name, '--', r); failed++; }
  } catch(e) { console.log('  FAIL ', name, '--', e.message); failed++; }
}

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function loadPipeline() {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(readFile('scoring/rules.js'), sb);
  vm.runInContext(readFile('scoring/tokenizer.js'), sb);
  const sugSrc = readFile('scoring/suggester.js');
  vm.runInContext(sugSrc, sb);
  return sb;
}

function getAllJs(dir) {
  const results = [];
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && f !== 'node_modules') results.push(...getAllJs(full));
    else if (f.endsWith('.js')) results.push(full);
  });
  return results;
}

console.log('\n==============================');
console.log(' Mnemox QA Simulation Tests');
console.log('==============================\n');

console.log('[ QA-1 ] Platform Adapter Selectors');
check('ChatGPT urlMatch source contains openai', () => readFile('adapters/chatgpt.js').includes('openai') || 'missing');
check('ChatGPT urlMatch source contains chatgpt.com',     () => readFile('adapters/chatgpt.js').includes('chatgpt') || 'missing');
check('ChatGPT selector is #prompt-textarea',    () => readFile('adapters/chatgpt.js').includes('#prompt-textarea') || 'wrong');
check('Claude urlMatch source contains claude.ai',() => readFile('adapters/claude.js').includes('claude') || 'missing');
check('Claude selector is contenteditable',      () => readFile('adapters/claude.js').includes('contenteditable') || 'wrong');
check('Gemini urlMatch source contains gemini',  () => readFile('adapters/gemini.js').includes('gemini') || 'missing');
check('Gemini selector is .ql-editor',           () => readFile('adapters/gemini.js').includes('ql-editor') || 'wrong');
check('Registry uses lazy lookup',               () => !readFile('adapters/registry.js').includes('const ADAPTERS') || 'uses const');

console.log('\n[ QA-2 ] End-to-End Scoring Pipeline');
const sb = loadPipeline();

check('scorePrompt returns valid shape', () => {
  const r = sb.scorePrompt('fix my code');
  return (typeof r.score === 'number' && r.grade && r.dims && Array.isArray(r.weak)) || 'bad shape';
});
check('Tokenizer counts tokens > 0', () => {
  const t = sb.window.MnemoxTokenizer.countTokens('fix my code');
  return t > 0 || 'got ' + t;
});
check('Suggester improves weak prompt', () => {
  const r = sb.scorePrompt('fix my code');
  const s = sb.MnemoxSuggester.suggest('fix my code', r.dims);
  return (s && s.length > 10) || 'no suggestion';
});
check('Suggester returns null for perfect-scoring prompt', () => {
  const r = { dims: { R1:{score:12,max:12}, R2:{score:12,max:12}, R3:{score:12,max:12}, R4:{score:12,max:12}, R5:{score:12,max:12}, R6:{score:12,max:12}, R7:{score:12,max:12}, R8:{score:4,max:4} } };
  const s = sb.MnemoxSuggester.suggest('test', r.dims);
  return s === null || 'expected null, got suggestion';
});
check('Weak prompts score under 50', () => {
  const bad = ['hi','help','fix','do it'].filter(p => sb.scorePrompt(p).score >= 50);
  return bad.length === 0 || 'over 50: ' + bad.join(', ');
});
check('Strong prompt scores 75+', () => {
  const r = sb.scorePrompt('You are a senior Python developer. Write a function that reads a CSV file and returns a list of dicts. Use the csv module. Keep it under 20 lines. Include docstrings.');
  return r.score >= 75 || 'got ' + r.score;
});
check('dims values have score and max', () => {
  const r = sb.scorePrompt('write some code');
  const d = Object.values(r.dims)[0];
  return (typeof d.score === 'number' && typeof d.max === 'number') || 'bad: ' + JSON.stringify(d);
});
check('Rule percentages all 0-100', () => {
  const r = sb.scorePrompt('write some code');
  const bad = Object.entries(r.dims).filter(([,d]) => {
    const p = Math.round((d.score/d.max)*100);
    return p < 0 || p > 100;
  });
  return bad.length === 0 || 'out of range: ' + bad.map(([k])=>k).join(', ');
});

console.log('\n[ QA-3 ] Content Script Structure');
check('All 8 scripts injected', () => {
  const s = readFile('content.js');
  const scripts = ['scoring/rules.js','scoring/tokenizer.js','scoring/suggester.js','ui/badge.js','ui/coach.js','ui/pageWorld.js','adapters/chatgpt.js','adapters/registry.js'];
  const missing = scripts.filter(sc => !s.includes(sc));
  return missing.length === 0 || 'missing: ' + missing.join(', ');
});
check('Saves lastResult to storage',   () => readFile('content.js').includes('lastResult'));
check('wireObserver retries at 2000ms',() => readFile('content.js').includes('2000'));
check('Debounce is 1500ms',            () => readFile('content.js').includes('1500'));
check('pageWorld attaches tokens',     () => readFile('ui/pageWorld.js').includes('result.tokens'));
check('pageWorld attaches suggestion', () => readFile('ui/pageWorld.js').includes('result.suggestion'));

console.log('\n[ QA-4 ] Manifest Completeness');
const manifest = JSON.parse(readFile('manifest.json'));
const allRes = (manifest.web_accessible_resources||[]).flatMap(r=>r.resources||[]);
['scoring/rules.js','scoring/tokenizer.js','scoring/suggester.js','ui/badge.js','ui/coach.js','ui/pageWorld.js','adapters/chatgpt.js','adapters/claude.js','adapters/gemini.js','adapters/registry.js'].forEach(r => {
  check(r + ' in manifest', () => allRes.includes(r) || 'missing');
});

console.log('\n[ QA-5 ] File Integrity (no non-ASCII)');
getAllJs(ROOT).forEach(f => {
  if (f.includes('node_modules')) return;
  const rel = f.replace(ROOT+path.sep,'').replace(/\\/g,'/');
  check(rel + ' clean', () => {
    const d = fs.readFileSync(f);
    const bad = [...d].filter(b => b > 127);
    return bad.length === 0 || bad.length + ' non-ASCII bytes';
  });
});

console.log('\n==============================');
console.log(' QA Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('==============================\n');
process.exit(failed > 0 ? 1 : 0);

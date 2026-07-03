#!/usr/bin/env node
// Mnemox MCP - Test Suite
// Tests scorer, tokenizer, and MCP JSON-RPC protocol.
// Run: node mcp/test/runner.js

'use strict';

const { scorePrompt }         = require('../lib/scorer');
const { countTokens, estimateCost } = require('../lib/tokenizer');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.log(`  FAIL  ${label}: ${result}`);
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL  ${label}: threw ${e.message}`);
    failed++;
  }
}

// ── Scorer tests ──────────────────────────────────────────────────────────────

console.log('\nScorer');

check('empty string returns score 0 grade F', () => {
  const r = scorePrompt('');
  return r.score === 0 && r.grade === 'F' || `got score=${r.score} grade=${r.grade}`;
});

check('single word scores low', () => {
  const r = scorePrompt('hello');
  return r.score < 30 || `got ${r.score}`;
});

check('high-quality prompt scores A', () => {
  const text = 'As a senior developer, I need you to write a Python function that validates email addresses using regex. It should handle edge cases like subdomains and plus-addressing. Return a boolean. For example: validate("user+tag@sub.domain.com") should return True.';
  const r = scorePrompt(text);
  return r.score >= 80 || `got ${r.score} (${r.grade})`;
});

check('vague opener reduces clarity score', () => {
  const r = scorePrompt('Can you please help me with something about coding maybe');
  return r.dims.R1.score < 12 || `R1 score was ${r.dims.R1.score}`;
});

check('returns dims for all 8 rules', () => {
  const r = scorePrompt('Write me a blog post.');
  const keys = Object.keys(r.dims);
  return keys.length === 8 || `got ${keys.length} dims`;
});

check('grade A for score >= 85', () => {
  const r = scorePrompt('As a senior data scientist at a fintech startup, I need a concise Python script that reads a CSV of transaction amounts, detects outliers using IQR, and outputs a detailed JSON summary report. For example: `{"outliers": 12, "total": 500}`. Handle missing values gracefully.');
  return r.grade === 'A' || `got grade ${r.grade} (${r.score})`;
});

check('grade F for score < 40', () => {
  const r = scorePrompt('do it');
  return r.grade === 'F' || `got grade ${r.grade} (${r.score})`;
});

check('weak array populated for poor rules', () => {
  const r = scorePrompt('hi what');
  return r.weak.length > 0 || 'weak array was empty';
});

check('example signals boost R8', () => {
  const r = scorePrompt('Write a function. For example: add(1, 2) should return 3.');
  return r.dims.R8.score === 4 || `R8 score was ${r.dims.R8.score}`;
});

check('no examples gives R8 score 0', () => {
  const r = scorePrompt('Write me a short poem about the ocean with a calm tone.');
  return r.dims.R8.score === 0 || `R8 score was ${r.dims.R8.score}`;
});

// ── Tokenizer tests ───────────────────────────────────────────────────────────

console.log('\nTokenizer');

check('empty string returns 0', () => {
  return countTokens('') === 0 || `got ${countTokens('')}`;
});

check('null returns 0', () => {
  return countTokens(null) === 0 || `got ${countTokens(null)}`;
});

check('single word returns 1', () => {
  return countTokens('hello') === 1 || `got ${countTokens('hello')}`;
});

check('punctuation counts as tokens', () => {
  const t = countTokens('Hello, world!');
  return t >= 3 || `got ${t}`;
});

check('long word gets subword split', () => {
  const t = countTokens('internationalization');
  return t >= 2 || `got ${t}`;
});

check('typical sentence within reasonable range', () => {
  const t = countTokens('The quick brown fox jumps over the lazy dog');
  return t >= 8 && t <= 12 || `got ${t}`;
});

check('estimateCost returns cost object', () => {
  const c = estimateCost(1000, 'gpt-4o');
  return c.input_cost_usd !== undefined && c.model === 'gpt-4o' || `got ${JSON.stringify(c)}`;
});

check('estimateCost for 1000 tokens gpt-4o is $0.0025', () => {
  const c = estimateCost(1000, 'gpt-4o');
  return parseFloat(c.input_cost_usd) === 0.0025 || `got ${c.input_cost_usd}`;
});

check('estimateCost for claude-haiku is cheaper than gpt-4o', () => {
  const haiku = estimateCost(1000, 'claude-haiku');
  const gpt4o = estimateCost(1000, 'gpt-4o');
  return parseFloat(haiku.input_cost_usd) < parseFloat(gpt4o.input_cost_usd) || 'haiku not cheaper';
});

// ── MCP protocol smoke test ───────────────────────────────────────────────────

console.log('\nMCP Protocol (stdio smoke test)');

const { spawn } = require('child_process');
const path = require('path');

function mcpRequest(proc, msg) {
  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk;
      if (buf.includes('\n')) {
        proc.stdout.removeListener('data', onData);
        try { resolve(JSON.parse(buf.trim())); }
        catch { resolve(null); }
      }
    };
    proc.stdout.on('data', onData);
    proc.stdin.write(JSON.stringify(msg) + '\n');
  });
}

async function runProtocolTests() {
  const serverPath = path.join(__dirname, '..', 'index.js');
  const proc = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Give server a moment to boot
  await new Promise(r => setTimeout(r, 200));

  let r;

  // initialize
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  check('initialize returns protocolVersion', () => r?.result?.protocolVersion === '2024-11-05' || `got ${JSON.stringify(r)}`);
  check('initialize serverInfo name is mnemox-mcp', () => r?.result?.serverInfo?.name === 'mnemox-mcp' || `got ${JSON.stringify(r?.result?.serverInfo)}`);

  // tools/list
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = r?.result?.tools || [];
  check('tools/list returns 4 tools', () => tools.length === 4 || `got ${tools.length}`);
  check('tools/list includes score_prompt', () => tools.some(t => t.name === 'score_prompt') || 'missing score_prompt');
  check('tools/list includes count_tokens', () => tools.some(t => t.name === 'count_tokens') || 'missing count_tokens');
  check('tools/list includes get_memory', () => tools.some(t => t.name === 'get_memory') || 'missing get_memory');
  check('tools/list includes save_memory', () => tools.some(t => t.name === 'save_memory') || 'missing save_memory');

  // tools/call score_prompt
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'score_prompt', arguments: { prompt: 'As a developer, write a Python function to validate emails, returning a boolean. Example: validate("a@b.com") returns True.' } } });
  check('score_prompt call returns content', () => r?.result?.content?.[0]?.type === 'text' || `got ${JSON.stringify(r)}`);
  check('score_prompt output contains Score:', () => r?.result?.content?.[0]?.text?.includes('Score:') || `got ${r?.result?.content?.[0]?.text}`);

  // tools/call count_tokens
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'count_tokens', arguments: { text: 'Hello world', model: 'gpt-4o' } } });
  check('count_tokens call returns content', () => r?.result?.content?.[0]?.type === 'text' || `got ${JSON.stringify(r)}`);
  check('count_tokens output contains Token count:', () => r?.result?.content?.[0]?.text?.includes('Token count:') || `got ${r?.result?.content?.[0]?.text}`);

  // ping
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 5, method: 'ping', params: {} });
  check('ping returns empty result', () => r?.result !== undefined || `got ${JSON.stringify(r)}`);

  // unknown method
  r = await mcpRequest(proc, { jsonrpc: '2.0', id: 6, method: 'unknown/method', params: {} });
  check('unknown method returns error -32601', () => r?.error?.code === -32601 || `got ${JSON.stringify(r)}`);

  proc.stdin.end();
  proc.kill();
}

runProtocolTests().then(() => {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal error in protocol tests:', err);
  process.exit(1);
});

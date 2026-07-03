#!/usr/bin/env node
// Mnemox MCP Server v1.0.0
// stdio transport — zero hosting cost, works with Claude Code, Cowork, Cursor.
// Protocol: JSON-RPC 2.0 over stdin/stdout (MCP spec 2024-11-05)

'use strict';

const { scorePrompt } = require('./lib/scorer');
const { countTokens, estimateCost, COST_PER_1K } = require('./lib/tokenizer');
const memory = require('./lib/memory');

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'score_prompt',
    description: 'Score a prompt using Mnemox\'s 8-rule engine (Clarity, Specificity, Context, Clear Goal, Constraints, Structure, Length Balance, Examples). Returns score 0-100, grade A-F, per-rule breakdown, and which rules are weak. 100% local — no API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt text to score.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'count_tokens',
    description: 'Estimate token count for a text string using Mnemox\'s local tokenizer (within ~5% of tiktoken for English prose). Optionally returns cost estimate for a given model. 100% local — no API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to count tokens for.',
        },
        model: {
          type: 'string',
          description: 'Model for cost estimation. Options: gpt-4o, gpt-4o-mini, claude-sonnet, claude-haiku, gemini-flash. Defaults to gpt-4o.',
          enum: Object.keys(COST_PER_1K),
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_memory',
    description: 'Retrieve saved AI interaction memories from Mnemox backend. Supports semantic search (if query provided) or listing recent memories. Requires MNEMOX_API_URL env var to be set (defaults to Railway deployment).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Semantic search query. If omitted, returns most recent memories.',
        },
        user_id: {
          type: 'string',
          description: 'Filter by user ID (optional).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return (1-50, default 10).',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'save_memory',
    description: 'Save a memory/note to the Mnemox backend for future retrieval. Memories persist across sessions and can be searched semantically. Requires MNEMOX_API_URL env var.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to save as a memory.',
        },
        source: {
          type: 'string',
          description: 'Source tool/platform (chatgpt, claude, gemini, copilot, perplexity, grok, copilot_ms).',
          enum: ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'grok', 'copilot_ms'],
        },
        user_id: {
          type: 'string',
          description: 'User ID to associate with this memory (optional).',
        },
      },
      required: ['content', 'source'],
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleToolCall(name, args) {
  switch (name) {

    case 'score_prompt': {
      const { prompt } = args;
      if (!prompt || typeof prompt !== 'string') {
        throw new Error('prompt is required and must be a string');
      }
      const result = scorePrompt(prompt);
      const lines = [
        `Score: ${result.score}/100  Grade: ${result.grade}`,
        '',
        'Rule breakdown:',
        ...Object.values(result.dims).map(d =>
          `  ${d.name}: ${d.score}/${d.max} — ${d.message}`
        ),
      ];
      if (result.weak && result.weak.length > 0) {
        lines.push('', `Weak rules: ${result.weak.join(', ')}`);
      }
      lines.push('', `Token count: ~${countTokens(prompt)}`);
      return lines.join('\n');
    }

    case 'count_tokens': {
      const { text, model = 'gpt-4o' } = args;
      if (!text || typeof text !== 'string') {
        throw new Error('text is required and must be a string');
      }
      const tokens = countTokens(text);
      const cost = estimateCost(tokens, model);
      return [
        `Token count: ${tokens}`,
        `Model: ${model}`,
        `Estimated input cost:  $${cost.input_cost_usd}`,
        `Estimated output cost: $${cost.output_cost_usd}`,
        `(Cost estimates are approximate and based on current public pricing)`,
      ].join('\n');
    }

    case 'get_memory': {
      const { query, user_id, limit = 10 } = args || {};
      let result;
      if (query) {
        result = await memory.searchMemories({ query, user_id, limit });
        const items = result.results || [];
        if (items.length === 0) return 'No memories found matching that query.';
        return items.map((m, i) =>
          `[${i + 1}] (score: ${m.score?.toFixed(2) || 'n/a'}) [${m.source}] ${m.content_preview}`
        ).join('\n');
      } else {
        result = await memory.getMemories({ user_id, limit });
        const items = result.memories || [];
        if (items.length === 0) return 'No memories saved yet.';
        return items.map((m, i) =>
          `[${i + 1}] [${m.source}] ${m.content.slice(0, 200)}${m.content.length > 200 ? '…' : ''}`
        ).join('\n');
      }
    }

    case 'save_memory': {
      const { content, source, user_id } = args;
      if (!content) throw new Error('content is required');
      if (!source)  throw new Error('source is required');
      const result = await memory.saveMemory({ content, source, user_id });
      return `Memory saved. ID: ${result.id}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── JSON-RPC over stdio ───────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  // Notifications — no response
  if (method === 'notifications/initialized') return;

  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mnemox-mcp', version: '1.0.0' },
      });
      break;

    case 'ping':
      sendResult(id, {});
      break;

    case 'tools/list':
      sendResult(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const text = await handleToolCall(toolName, toolArgs);
        sendResult(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        sendResult(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      break;
    }

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
  }
}

// ── Stdin reader ──────────────────────────────────────────────────────────────

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handleMessage(msg).catch(err => {
        process.stderr.write(`[mnemox-mcp] handler error: ${err.message}\n`);
      });
    } catch (err) {
      process.stderr.write(`[mnemox-mcp] parse error: ${err.message}\n`);
    }
  }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

process.stderr.write('[mnemox-mcp] ready\n');

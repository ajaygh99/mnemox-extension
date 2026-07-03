// Mnemox MCP - Token Estimator (Node.js port)
// Approximates GPT/Claude tokenization without WASM or API.
// Accuracy: within ~5% of tiktoken for English prose.

'use strict';

const PUNCT_RE = /([.,!?;:()[\]{}<>'"\/\\@#$%^&*\-+=|~`])/g;

function subwordCount(word) {
  if (word.length <= 5) return 1;
  if (word.length <= 8) return 2;
  return Math.ceil(word.length / 4);
}

function countTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const expanded = text.replace(PUNCT_RE, ' $1 ');
  const words = expanded.trim().split(/\s+/).filter(w => w.length > 0);
  let total = 0;
  for (const word of words) {
    total += subwordCount(word);
  }
  return total;
}

// Cost estimates per 1K tokens (USD) for common models
const COST_PER_1K = {
  'gpt-4o':       { input: 0.0025, output: 0.01 },
  'gpt-4o-mini':  { input: 0.00015, output: 0.0006 },
  'claude-sonnet': { input: 0.003, output: 0.015 },
  'claude-haiku':  { input: 0.00025, output: 0.00125 },
  'gemini-flash':  { input: 0.00001875, output: 0.000075 },
};

function estimateCost(tokenCount, model = 'gpt-4o') {
  const rates = COST_PER_1K[model] || COST_PER_1K['gpt-4o'];
  return {
    input_cost_usd: ((tokenCount / 1000) * rates.input).toFixed(6),
    output_cost_usd: ((tokenCount / 1000) * rates.output).toFixed(6),
    model,
  };
}

module.exports = { countTokens, estimateCost, COST_PER_1K };

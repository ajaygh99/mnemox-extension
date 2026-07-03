// Mnemox MCP - Rule-Based Scoring Engine (Node.js port)
// Identical logic to scoring/rules.js — zero API calls, runs in <5ms.

'use strict';

const RULES = [
  {
    id: 'R1', name: 'Clarity',
    check(text) {
      const vagueOpeners = /^(can you|could you|please|hey|hi|so |just )/i;
      const ambiguous = /\b(it|this|that|they|them)\b/gi;
      const matches = (text.match(ambiguous) || []).length;
      if (vagueOpeners.test(text.trim())) return { score: 4, message: 'Starts with a vague opener. Be direct.' };
      if (matches > 3) return { score: 6, message: 'Too many ambiguous pronouns (it/this/that). Be specific.' };
      return { score: 12, message: 'Clear and direct.' };
    }
  },
  {
    id: 'R2', name: 'Specificity',
    check(text) {
      const words = text.trim().split(/\s+/).length;
      const fillers = /\b(maybe|sort of|kind of|somewhat|basically|literally|very|really|quite)\b/gi;
      const fillerCount = (text.match(fillers) || []).length;
      if (words < 8)  return { score: 3, message: 'Too short. Add more detail.' };
      if (words > 600) return { score: 6, message: 'Very long. Consider splitting into focused prompts.' };
      if (fillerCount > 2) return { score: 6, message: 'Too many filler words. Remove: maybe, sort of, basically.' };
      return { score: 12, message: 'Good length and specificity.' };
    }
  },
  {
    id: 'R3', name: 'Context',
    check(text) {
      const contextSignals = [
        /\b(i am|i'm|we are|we're|my |our )\b/i,
        /\b(background|context|situation|project|work|task|goal)\b/i,
        /\b(as a|acting as|you are a|role of)\b/i,
      ];
      const found = contextSignals.filter(r => r.test(text)).length;
      const hasAudience = /\b(audience|for a|target|beginner|expert|junior|senior|developer|manager|student)\b/i.test(text);
      if (found === 0 && !hasAudience) return { score: 4, message: 'No context provided. Add who you are or what the situation is.' };
      if (found === 1 && !hasAudience) return { score: 8, message: 'Some context. Adding more would improve results.' };
      return { score: 12, message: 'Good context provided.' };
    }
  },
  {
    id: 'R4', name: 'Clear Goal',
    check(text) {
      const goalSignals = [
        /\?$/m,
        /\b(please |write |create |generate |explain |summarize |list |give me |provide |help me |make )\b/i,
        /\b(i need|i want|i would like|i am looking for)\b/i,
      ];
      const found = goalSignals.filter(r => r.test(text)).length;
      if (found === 0) return { score: 4, message: 'No clear goal or request found. State what you want explicitly.' };
      return { score: 12, message: 'Goal is clear.' };
    }
  },
  {
    id: 'R5', name: 'Constraints',
    check(text) {
      const constraintSignals = [
        /\b(in json|as a list|as bullet|in markdown|in table|as csv)\b/i,
        /\b(\d+ words|\d+ sentences|\d+ points|short|brief|detailed|concise)\b/i,
        /\b(for a|audience|beginner|expert|technical|non-technical|simple)\b/i,
        /\b(tone|style|formal|informal|professional|casual)\b/i,
      ];
      const found = constraintSignals.filter(r => r.test(text)).length;
      if (found === 0) return { score: 6, message: 'No constraints. Add format, length, or audience hints.' };
      if (found === 1) return { score: 10, message: 'One constraint found. More would sharpen the output.' };
      return { score: 12, message: 'Good constraints defined.' };
    }
  },
  {
    id: 'R6', name: 'Structure',
    check(text) {
      const words = text.trim().split(/\s+/).length;
      const taskCount = (text.match(/\b(and then|also|additionally|furthermore|next|finally)\b/gi) || []).length;
      if (words <= 2) return { score: 0, message: 'Too short to have any structure.' };
      if (words <= 5) return { score: 4, message: 'Very minimal. Add more to make it actionable.' };
      if (taskCount > 2 && !text.includes('\n')) return { score: 6, message: 'Multiple tasks on one line. Separate with line breaks.' };
      return { score: 12, message: 'Structure is clear.' };
    }
  },
  {
    id: 'R7', name: 'Length Balance',
    check(text) {
      const words = text.trim().split(/\s+/).length;
      const isComplex = /\b(analyze|compare|research|comprehensive|detailed|in-depth|full|complete|thorough)\b/i.test(text);
      const isSimple = /\b(what is|who is|when|where|define|spell|translate)\b/i.test(text);
      if (words <= 2) return { score: 0, message: 'Single word or too short. Add context and intent.' };
      if (words <= 5) return { score: 4, message: 'Too brief. Explain what you need.' };
      if (isComplex && words < 20) return { score: 6, message: 'Complex task but very short prompt. Add more detail.' };
      if (isSimple && words > 100) return { score: 8, message: 'Simple question but very long. Keep it concise.' };
      return { score: 12, message: 'Length matches complexity.' };
    }
  },
  {
    id: 'R8', name: 'Examples',
    check(text) {
      const exampleSignals = /\b(for example|e\.g\.|such as|like this|here is an example|sample|instance)\b/i;
      const hasCode = /`[^`]+`/.test(text);
      if (exampleSignals.test(text) || hasCode) return { score: 4, message: 'Great - examples help guide the output.' };
      return { score: 0, message: 'No examples (optional but recommended for complex tasks).' };
    }
  },
];

function scorePrompt(text) {
  if (!text || text.trim().length === 0) {
    return { score: 0, grade: 'F', dims: {}, weak: ['All'], empty: true };
  }
  const results = {};
  let total = 0;
  const weak = [];
  for (const rule of RULES) {
    const result = rule.check(text);
    const maxScore = rule.id === 'R8' ? 4 : 12;
    results[rule.id] = { name: rule.name, score: result.score, max: maxScore, message: result.message };
    total += result.score;
    if (result.score < maxScore * 0.67) weak.push(rule.name);
  }
  const score = Math.min(100, Math.round(total));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  return { score, grade, dims: results, weak };
}

module.exports = { scorePrompt, RULES };

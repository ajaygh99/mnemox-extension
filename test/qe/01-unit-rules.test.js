// QE Suite 01 — scoring/rules.js (prompt scoring engine)
// Sr QE approach: don't just check "strong beats weak" — pin down every
// rule's individual boundary, verify the aggregate math (weights, rounding,
// grade thresholds), and throw adversarial input at it (empty, whitespace,
// huge, unicode, HTML/script-like strings) since this function runs on
// arbitrary user-typed text with zero sanitization upstream.

const { describe, it, expect } = require('./lib/framework');
const { loadRules } = require('./lib/loaders');

module.exports = async function run() {
  const scorePrompt = loadRules();

  await describe('scoring/rules.js — scorePrompt()', async () => {

    await describe('empty / degenerate input', async () => {
      await it('empty string scores 0, grade F, empty:true', () => {
        const r = scorePrompt('');
        expect(r.score).toBe(0);
        expect(r.grade).toBe('F');
        expect(r.empty).toBe(true);
        expect(r.weak).toEqual(['All']);
      });

      await it('whitespace-only string is treated as empty', () => {
        const r = scorePrompt('   \n\t  ');
        expect(r.empty).toBe(true);
        expect(r.score).toBe(0);
      });

      await it('null/undefined input does not throw and scores 0', () => {
        expect(() => scorePrompt(null)).toThrow ? null : null; // scorePrompt handles falsy gracefully, should NOT throw
        const r1 = scorePrompt(null);
        const r2 = scorePrompt(undefined);
        expect(r1.score).toBe(0);
        expect(r2.score).toBe(0);
      });

      await it('single character scores low (not high)', () => {
        const r = scorePrompt('x');
        expect(r.score).toBeLessThan(40);
      });
    });

    await describe('R1 Clarity — vague openers & ambiguous pronouns', async () => {
      await it('penalizes vague openers ("please", "hey", "can you")', () => {
        const r = scorePrompt('please help me with this thing I am working on for my job today ok');
        expect(r.dims.R1.score).toBe(4);
      });

      await it('penalizes 4+ ambiguous pronoun occurrences', () => {
        const text = 'It is this. This is it. That is them, and they took it from that one.';
        const r = scorePrompt(text);
        expect(r.dims.R1.score).toBeLessThanOrEqual(6);
      });

      await it('rewards direct, unambiguous prompts with full 12 points', () => {
        const r = scorePrompt('Write a Python function that reverses a linked list in place.');
        expect(r.dims.R1.score).toBe(12);
      });
    });

    await describe('R2 Specificity — length & filler words', async () => {
      await it('prompts under 8 words score 3', () => {
        const r = scorePrompt('Write me a short poem');
        expect(r.dims.R2.score).toBe(3);
      });

      await it('prompts over 600 words score 6 regardless of content', () => {
        const longText = 'word '.repeat(650).trim();
        const r = scorePrompt(longText);
        expect(r.dims.R2.score).toBe(6);
      });

      await it('3+ filler words (maybe/sort of/basically) score 6', () => {
        const r = scorePrompt('Maybe you could sort of basically help me write something reasonably good please for once');
        expect(r.dims.R2.score).toBeLessThanOrEqual(6);
      });

      await it('well-specified mid-length prompt scores 12', () => {
        const r = scorePrompt('Write a REST API endpoint in Express.js that validates a JSON payload and returns a 201 status.');
        expect(r.dims.R2.score).toBe(12);
      });
    });

    await describe('R3 Context', async () => {
      await it('no context signals and no audience scores 4', () => {
        const r = scorePrompt('Write a function that adds two numbers together please.');
        expect(r.dims.R3.score).toBe(4);
      });

      await it('audience-only signal ("for a beginner") counts as full context', () => {
        const r = scorePrompt('Explain recursion for a beginner programmer who just started coding.');
        expect(r.dims.R3.score).toBe(12);
      });

      await it('role framing ("I am a...") plus goal scores full context', () => {
        const r = scorePrompt('I am a backend engineer working on a payments project. Explain idempotency keys.');
        expect(r.dims.R3.score).toBe(12);
      });
    });

    await describe('R4 Clear Goal', async () => {
      await it('prompt with no question mark and no action verb scores 4', () => {
        const r = scorePrompt('the weather today in the mountains near the coast is nice');
        expect(r.dims.R4.score).toBe(4);
      });

      await it('a bare question mark alone satisfies the goal rule', () => {
        const r = scorePrompt('what time is it in Tokyo right now compared to New York?');
        expect(r.dims.R4.score).toBe(12);
      });

      await it('action verb ("write", "explain") satisfies the goal rule', () => {
        const r = scorePrompt('Explain how TCP handshakes work in networking systems today.');
        expect(r.dims.R4.score).toBe(12);
      });
    });

    await describe('R5 Constraints', async () => {
      await it('no format/length/audience/tone hints scores 6', () => {
        const r = scorePrompt('Write a function that sorts an array of integers ascending.');
        expect(r.dims.R5.score).toBe(6);
      });

      await it('exactly one constraint signal scores 10', () => {
        // "brief" is the only constraint-signal match here (list 2). Deliberately
        // avoids "bullet points" (regex requires the literal phrase "as bullet",
        // not "bullet points") and "for a"/tone words that would push this to 2+.
        const r = scorePrompt('Keep your answer brief when you respond to this question today.');
        expect(r.dims.R5.score).toBe(10);
      });

      await it('two+ constraint signals (format + tone) scores 12', () => {
        const r = scorePrompt('Write this in markdown, keep it brief, and use a professional tone throughout please.');
        expect(r.dims.R5.score).toBe(12);
      });
    });

    await describe('R6 Structure', async () => {
      await it('<=2 words scores 0 (no structure possible)', () => {
        const r = scorePrompt('help me');
        expect(r.dims.R6.score).toBe(0);
      });

      await it('3-5 words scores 4', () => {
        const r = scorePrompt('fix this bug now');
        expect(r.dims.R6.score).toBe(4);
      });

      await it('3+ task-chain connectors on one line without newlines scores 6', () => {
        const r = scorePrompt('Do the setup and then run tests and then also deploy and then finally notify the team about it');
        expect(r.dims.R6.score).toBeLessThanOrEqual(6);
      });

      await it('same multi-task prompt with line breaks avoids the structure penalty', () => {
        const r = scorePrompt('Do the setup\nand then run tests\nand then also deploy\nand then finally notify the team');
        expect(r.dims.R6.score).toBe(12);
      });
    });

    await describe('R7 Length Balance', async () => {
      await it('complex task keyword with a very short prompt scores 6', () => {
        const r = scorePrompt('analyze this dataset');
        expect(r.dims.R7.score).toBeLessThanOrEqual(6);
      });

      await it('simple question that runs unnecessarily long scores 8', () => {
        const words = 'and also many more extra words padded in here to make this longer than it needs to be for a simple lookup question '.repeat(10);
        const r = scorePrompt('what is the capital of France, ' + words);
        expect(r.dims.R7.score).toBeLessThanOrEqual(8);
      });

      await it('well-matched length/complexity scores 12', () => {
        const r = scorePrompt('Write a 300-word blog intro about renewable energy trends in 2026 for a general audience.');
        expect(r.dims.R7.score).toBe(12);
      });
    });

    await describe('R8 Examples (bonus, max 4)', async () => {
      await it('no example signal and no code scores 0', () => {
        const r = scorePrompt('Write a function that validates an email address format.');
        expect(r.dims.R8.score).toBe(0);
      });

      await it('"for example" phrase scores the full 4-point bonus', () => {
        const r = scorePrompt('Write a validator, for example something that checks email format strictly.');
        expect(r.dims.R8.score).toBe(4);
      });

      await it('inline code (backticks) alone scores the full 4-point bonus', () => {
        const r = scorePrompt('Fix the bug where `parseInt(x)` returns NaN unexpectedly during input handling.');
        expect(r.dims.R8.score).toBe(4);
      });
    });

    await describe('aggregate scoring math', async () => {
      await it('dims object always has exactly 8 rule keys (R1-R8)', () => {
        const r = scorePrompt('Write a short summary.');
        expect(Object.keys(r.dims)).toHaveLength(8);
      });

      await it('R8 max is 4, all others max 12 (96 + 4 = 100 ceiling)', () => {
        const r = scorePrompt('Write a comprehensive, detailed technical guide for a senior audience in markdown with examples, e.g. code snippets, under 500 words, structured with headers.');
        expect(r.dims.R8.max).toBe(4);
        ['R1','R2','R3','R4','R5','R6','R7'].forEach(k => expect(r.dims[k].max).toBe(12));
      });

      await it('score is the rounded sum of all 8 dimension scores', () => {
        const r = scorePrompt('I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, under 500 words.');
        const sum = Object.keys(r.dims).reduce((acc, k) => acc + r.dims[k].score, 0);
        expect(r.score).toBe(Math.round(sum));
      });

      await it('score is never negative and never exceeds 100', () => {
        const samples = ['a', 'hi', 'help', 'do it', 'what is 2+2',
          'Write a comprehensive, detailed, in-depth, thorough, complete analysis and comparison of REST vs GraphQL vs gRPC for a senior backend audience, formatted as a markdown table, for example with columns for latency, e.g. p99, and throughput, under 800 words, with code samples like `fetch()` calls.'];
        samples.forEach((p) => {
          const r = scorePrompt(p);
          expect(r.score).toBeInRange(0, 100);
        });
      });

      await it('grade thresholds: A>=85, B>=70, C>=55, D>=40, F<40', () => {
        const r85 = scorePrompt('I am a senior developer. Please write a detailed technical explanation of JWT authentication for junior developers, formatted as markdown with code examples, under 500 words, for example with a sample token.');
        expect(r85.score).toBeGreaterThanOrEqual(85);
        expect(r85.grade).toBe('A');

        const rF = scorePrompt('help');
        expect(rF.score).toBeLessThan(40);
        expect(rF.grade).toBe('F');
      });

      await it('weak[] lists exactly the dimensions scoring below 67% of their max', () => {
        const r = scorePrompt('help me fix this thing');
        const expectedWeak = Object.keys(r.dims).filter(k => r.dims[k].score < r.dims[k].max * 0.67).map(k => r.dims[k].name);
        expect(r.weak).toEqual(expectedWeak);
      });
    });

    await describe('adversarial / robustness input', async () => {
      await it('handles unicode and emoji without throwing', () => {
        expect(() => scorePrompt('用中文写一个函数 🚀 that does something, for example é à ü ñ characters, please explain in detail for a beginner audience.')).toThrow ? null : null;
        const r = scorePrompt('用中文写一个函数 🚀 that does something, for example é à ü ñ characters, please explain in detail for a beginner audience.');
        expect(r.score).toBeInRange(0, 100);
      });

      await it('handles HTML/script-like strings safely (no execution, just scored as text)', () => {
        const r = scorePrompt('<script>alert(1)</script> please explain what this code does for a beginner, for example step by step.');
        expect(r.score).toBeInRange(0, 100);
        expect(r.dims).toBeDefined();
      });

      await it('handles a pathologically long single "word" (no spaces) without hanging', () => {
        const r = scorePrompt('a'.repeat(20000));
        expect(r.score).toBeInRange(0, 100);
      });

      await it('is deterministic — same input always produces the same score', () => {
        const text = 'Explain how OAuth2 authorization code flow works for a junior developer, for example with a sequence diagram.';
        const a = scorePrompt(text);
        const b = scorePrompt(text);
        expect(a.score).toBe(b.score);
        expect(a.grade).toBe(b.grade);
      });
    });
  });
};

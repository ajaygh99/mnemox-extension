# Mnemox Extension — Roadmap & Status (as of 2026-07-04)

Not shipped anywhere yet. Manifest name "Mnemox", version 1.3.0. Separate from the live `mnemox` product (mnemoxpro.com, Chrome Store). Homepage URL already points to mnemoxpro.com, suggesting this is meant to become (or feed into) the next version of that product.

## Finished

**Prompt scoring (local, no API calls)** — `scoring/rules.js`. 8 rules (Clarity, Specificity, Context, Clear Goal, Constraints, Structure, Length Balance, Examples-bonus), 0-100 score, A-F grade, per-rule breakdown, weak-rule list. Runs in the page via `ui/pageWorld.js`.

**Response trust scoring** — `scoring/trust.js`. Scores AI *responses* (not prompts) on 4 signals: hedging density, completeness, specificity, consistency. 0-100 trust score, A-F grade.

**Token counting** — `scoring/tokenizer.js`, plus a separate implementation in `mcp/lib/tokenizer.js` with per-model cost estimates (gpt-4o, gpt-4o-mini, claude-sonnet, claude-haiku, gemini-flash).

**Suggestion engine** — `scoring/suggester.js`, surfaces an improved-prompt rewrite for weak prompts.

**In-page UI** — floating score badge (`ui/badge.js`) and a sliding coaching panel (`ui/coach.js`) with rule breakdown, tips, and a copy-to-clipboard improved prompt. Badge restores last score across SPA navigation via `localStorage` cache.

**Platform coverage** — 6 adapters (`adapters/chatgpt.js`, `claude.js`, `gemini.js`, `copilot.js`, `perplexity.js`, `grok.js`) selected via `adapters/registry.js` (`getAdapterForPage()` matches `urlMatch` regex against current URL). Manifest host_permissions cover 9 domains including chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, x.com, grok.com, plus the Railway backend.

**Content script wiring** — `content.js` hooks the prompt textarea/contenteditable across all platforms, saves prompt text every keystroke, debounces scoring 500ms after typing stops, re-wires automatically on SPA navigation (MutationObserver on `<title>` + `popstate`).

**Response capture + trust pipeline** — `response-reader.js` (not reviewed in depth this pass) feeds `MNEMOX_RESPONSE` events into `content.js`, which debounces to one trust score per response (1.5s after stream settles) and reports it to `background.js`.

**Trace logging to backend** — `background.js` posts prompt+response text (truncated to 5000 chars), trust score, prompt score, and token count to the Railway backend (`mnemox-production.up.railway.app/traces`), gated by a `TRACE_LOGGING` feature flag with an 8s per-tool cooldown to dedupe streaming re-fires. Anonymous UUID generated on install (no account required — different model from the live `mnemox` product, which requires Supabase auth).

**MnemoxTrace dashboard** — `traces.html` + `traces.js`. Standalone page (opened from popup) listing logged interactions, filterable by platform, with per-entry prompt/response text, score breakdowns, and aggregate stats (total logged, avg prompt score, avg trust score). CSP-compliant (no inline handlers), 1-minute localStorage cache with background refresh.

**Feature flags** — `background.js` `FLAG_DEFAULTS`: `TOKEN_COUNTER`, `PROMPT_COACHING`, `TRUST_SCORING`, `TRACE_LOGGING` all on by default; `PAYWALL` off (no monetization wired yet).

**MCP server** (`mcp/`) — stdio JSON-RPC 2.0 server exposing 4 tools: `score_prompt`, `count_tokens` (with cost estimate), `get_memory`, `save_memory` (the latter two proxy to the Railway backend). Package metadata (`mcp/package.json`) looks publish-ready (bin, files, repository, MIT license, engines). **Not yet published to npm** — confirmed via registry lookup, `npm view mnemox-mcp` returns 404.

**Test coverage** — `test/runner.js`: 125/125 passing (confirmed just now after fixing a sandbox file-sync artifact that had nothing to do with the real code — see note below). `mcp/test/runner.js`: 32/32 passing.

**Git history** — 14 tags from `step1.1-verified` through `v1.3.0`, tracking incremental feature build-out (adapters → feature flags → trust scoring → trace dashboard).

## In progress / uncommitted right now

You have local uncommitted changes to `adapters/chatgpt.js`, `adapters/claude.js`, `background.js`, `popup.html`, `popup.js`, `response-reader.js`, `traces.html`, `ui/badge.js` — left untouched this session since they're your own WIP, not something I created.

## What's not done yet

- **npm publish** for `mnemox-mcp` — package looks ready, never actually published.
- **No monetization** — `PAYWALL` flag exists but is off; no billing/entitlement logic like the live product's Stripe integration.
- **No account system** — this version is fully anonymous (UUID-based), unlike `mnemox`'s required Supabase auth. Worth deciding deliberately whether that's permanent or a placeholder.
- **No packaging for Chrome Web Store** — this has never been zipped/submitted anywhere; if the intent is eventually to replace or merge into the live `mnemox` listing, that migration path (data model, auth, permissions) isn't planned yet.
- `scoring/cache.js` and `mcp/lib/memory.js` haven't been reviewed in this pass — worth a look before calling the memory/caching layer done.
- `README.md` is effectively a placeholder ("# mnemox-extension") — no setup or architecture docs for future-you or collaborators.

## Note on this session's detour

Before writing this, 7 test failures turned out to be a sandbox artifact (the shell's view of `content.js` and `ui/pageWorld.js` was truncated independently of what's actually on disk/in git) rather than real regressions — confirmed by rewriting both files and getting 125/125 passing with zero net git diff on those two files. Nothing in your actual code was broken.

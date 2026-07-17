# Mnemox - Chrome Web Store Listing

## Name
Mnemox Extension

## Short Description (up to 132 chars)
Real-time prompt scorer and token counter. Works on any site. Zero API dependencies.

## Full Description (up to 16,000 chars)
Mnemox scores your prompts in real time as you type - on ChatGPT, Claude, Gemini, or any website with a text box. No API key required. No data leaves your browser by default.

**What it does**

- Scores your prompt from 0-100 across 8 quality rules
- Shows a floating badge with score, grade (A-F), and token estimate
- Click the badge to open the coaching panel with a full rule breakdown
- Each rule shows a coloured progress bar so you know exactly what to fix
- Generates an improved version of your prompt with one click to copy
- Works on any website - not just AI chat tools

**The 8 scoring rules**

1. Clarity - is the language clear and unambiguous?
2. Specificity - does the prompt include enough detail?
3. Context - is relevant background information provided?
4. Clear Goal - is there a specific, actionable request?
5. Constraints - are format, length, or scope limits defined?
6. Structure - is the prompt logically organised?
7. Length Balance - is it the right length for the task?
8. Examples - are examples provided where helpful?

**Why Mnemox?**

Most people type the same weak prompts and wonder why AI gives generic answers. Mnemox teaches you to write better prompts by showing you exactly which dimensions are weak and what to do about it.

**Top use cases**

1. Catch a weak prompt before you send it - the badge scores every prompt in real time, and the coach panel flags exactly which rule is weak with a rewritten version ready to copy in.
2. Sanity-check an AI's answer before you trust it - the response trust score flags hedging, incompleteness, and inconsistency in what the model just said.
3. Track token spend across tools - a running token count with per-model cost estimates, without checking each platform's own usage page.
4. Review your own prompting habits over time - the MnemoxTrace dashboard logs every prompt/response pair with score breakdowns so you can see whether your prompting is improving.
5. Wire prompt-quality scoring into an agent or automation pipeline - the MCP server exposes score_prompt and count_tokens as callable tools for coding agents and workflows, not just humans typing in a browser.

**Privacy**

- Zero external API calls by default
- No data leaves your browser unless you explicitly turn on an optional feature
- All prompt and response scoring runs locally in your browser
- No account required
- Two optional features are off by default and must be enabled in the popup settings: Trace Logging (saves your prompt/response text to the MnemoxTrace dashboard so you can review your history) and Memory Alignment (sends AI response text to our backend to compare it against your saved memories)

## Category
Tools (under the Productivity group)

## Language
English

## Keywords
prompt, AI, ChatGPT, scoring, token counter, prompt coach, Claude, Gemini, productivity

## Privacy Policy URL
https://github.com/ajaygh99/mnemox-extension#privacy-policy

## Privacy Policy Text

By default, Mnemox does not collect, transmit, or store any personal data on external servers. All prompt and response scoring is processed entirely within your browser using local JavaScript.

Two features are opt-in and off by default, changeable any time in the popup: Trace Logging sends prompt/response text (truncated) plus your scores to the Mnemox backend so the Traces dashboard can show your history. Memory Alignment sends AI response text to the same backend to compare it against memories you've saved. Neither is active until you turn it on.

The extension uses chrome.storage.local to remember your last prompt score and an anonymous device UUID between page loads. This data stays on your device unless one of the opt-in features above is enabled.

## Permissions Justification

- storage: Used to save the last prompt/response score, feature-flag settings, and an anonymous device UUID so the popup can display them
- scripting: Used to inject the scoring engine into web pages
- activeTab: Used to access the current tab's text input fields
- host_permissions (specific AI tool domains + the Mnemox backend): Required to run the scorer on supported AI chat sites, and to reach the backend only when an opt-in feature (Trace Logging or Memory Alignment) is turned on

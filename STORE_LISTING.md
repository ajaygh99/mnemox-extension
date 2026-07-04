# Mnemox - Chrome Web Store Listing

## Name
Mnemox

## Short Description (up to 132 chars)
Real-time prompt scorer and token counter. Works on any site. Zero API dependencies.

## Full Description (up to 16,000 chars)
Mnemox scores your prompts in real time as you type - on ChatGPT, Claude, Gemini, Copilot, Perplexity, and Grok. No API key required for scoring.

**What it does**

- Scores your prompt from 0-100 across 8 quality rules
- Shows a floating badge with score, grade (A-F), and token estimate
- Click the badge to open the coaching panel with a full rule breakdown
- Each rule shows a coloured progress bar so you know exactly what to fix
- Generates an improved version of your prompt with one click to copy
- Scores the AI's response quality too (MnemoxTrust: hedging, completeness, specificity, consistency)
- Works on ChatGPT, Claude, Gemini, Copilot, Perplexity, and Grok

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

**Privacy**

- Prompt scoring, token counting, and response quality scoring run entirely locally in your browser — nothing is sent anywhere for these features.
- An optional "Cloud Traces" toggle (off by default, in the popup) lets you send prompt/response text to Mnemox's Traces dashboard if you want a history view. No account or email is required — an anonymous device ID is used instead.
- See the full privacy policy for details on exactly what is stored locally vs. sent if you opt in.

## Category
Productivity

## Language
English

## Keywords
prompt, AI, ChatGPT, scoring, token counter, prompt coach, Claude, Gemini, productivity

## Privacy Policy URL
https://mnemoxpro.com/privacy

NOTE: the previous URL here (https://github.com/ajjukak123/mnemox-extension#privacy) pointed at a
GitHub username that does not match this repo's actual owner (ajaygh99) and 404s. That broken link
is a likely contributor to the "privacy policy missing information" rejection — Chrome could not
have read a policy that doesn't resolve. The corrected privacy policy content itself also needs to be
updated on mnemoxpro.com/privacy to describe the opt-in Cloud Traces feature and drop the
account/JWT/Stripe language, which doesn't match what's actually implemented yet — see PRIVACY_POLICY.md
in this repo for corrected copy to paste in.

## Permissions Justification

- storage: Used to save prompt scores, session stats, and feature-flag/consent preferences locally
- scripting: Used to inject the local scoring engine into supported AI chat pages
- activeTab: Used to access the current tab's text input fields
- tabs: Used to open the Traces dashboard tab from the popup
- host_permissions (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com,
  perplexity.ai, x.com, grok.com, mnemox-production.up.railway.app): Scoped to the specific AI platforms
  Mnemox supports, plus the Mnemox API host used only when the optional Cloud Traces toggle is on.

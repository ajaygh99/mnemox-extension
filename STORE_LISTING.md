# Mnemox - Chrome Web Store Listing

## Name
Mnemox

## Short Description (up to 132 chars)
Real-time prompt scorer and token counter. Works on any site. Zero API dependencies.

## Full Description (up to 16,000 chars)
Mnemox scores your prompts in real time as you type - on ChatGPT, Claude, Gemini, or any website with a text box. No API key required. No data leaves your browser.

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

**Privacy**

- Zero external API calls
- No data is sent to any server
- All scoring runs locally in your browser
- No account required

## Category
Productivity

## Language
English

## Keywords
prompt, AI, ChatGPT, scoring, token counter, prompt coach, Claude, Gemini, productivity

## Privacy Policy URL
https://github.com/ajjukak123/mnemox-extension#privacy

## Privacy Policy Text

Mnemox does not collect, transmit, or store any personal data on external servers.

All prompt text is processed entirely within your browser using local JavaScript. No text, scores, or usage data is ever sent to any external server or third party.

The extension uses chrome.storage.local solely to remember your last prompt score between page loads. This data stays on your device and is never shared.

## Permissions Justification

- storage: Used to save the last prompt score so the popup can display it
- scripting: Used to inject the scoring engine into web pages
- activeTab: Used to access the current tab's text input fields
- host_permissions (<all_urls>): Required to run on any website the user visits, since prompts can be typed on any site

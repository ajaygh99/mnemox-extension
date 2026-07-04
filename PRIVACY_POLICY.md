# Privacy Policy — Mnemox

**Last updated:** July 4, 2026

Mnemox ("the Extension," "we," "us") is a browser extension that provides real-time prompt scoring, token counting, and AI response quality scoring on supported AI chat platforms (ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity, and Grok/X). This policy explains what data the Extension collects, how it is handled, where it is stored, and whether it is shared with anyone. It reflects what the currently published version of the Extension actually does.

## 1. What runs entirely on your device (no data sent anywhere)

By default, all of the following happen locally in your browser and are never transmitted:

- Reading the prompt you're typing and the AI's response text on supported platforms, to compute a prompt-quality score, an estimated token count, and a response-quality ("MnemoxTrust") score
- Showing the floating score badge and coaching panel
- Storing your last score, last response-quality result, session count, and feature preferences in `chrome.storage.local` — this stays on your device

The Extension does not collect passwords, payment information, or data from any site outside the supported AI platforms.

## 2. Optional: Cloud Traces (off by default)

The popup includes a "Cloud Traces" toggle that is **off by default**. If — and only if — you turn it on:

- The text of your prompt and the AI's response (each truncated to 5,000 characters), the platform name, your prompt/trust scores, and token count are sent to our backend (`mnemox-production.up.railway.app`) so they can appear in the in-extension Traces dashboard
- This is tied to a randomly generated device ID (`mnemox_uuid`) created on install. No account, email, or sign-up is required or used by the Extension itself, and this ID cannot be linked to your identity by us
- You can turn this off at any time from the popup; no further data is sent to the Traces dashboard from the point you turn it off

Separately, the Extension pings our backend's `/health` endpoint on browser startup to keep it warm — this request carries no prompt content or identifiers.

## 3. Data retention

- Locally stored data persists until you clear the Extension's storage or remove the Extension.
- If you've enabled Cloud Traces, traces are retained on our backend, keyed to your anonymous device ID, until you request deletion (contact below) or we implement in-dashboard deletion.

## 4. Optional local MCP integration

Mnemox also offers a separately-installed developer companion tool (`mnemox-mcp`) that lets tools such as Claude Code or Cursor query Mnemox memory. If you install and configure this optional tool with your own backend credentials, memory you explicitly save through it is sent to the backend URL *you* configure. This component is opt-in, runs independently of the browser extension, and is not installed or activated by the Extension itself.

## 5. Data sharing

We do not sell, rent, or share your data with third parties. We do not use your data for advertising, and we do not allow third parties to use it for creditworthiness or lending purposes. Cloud Traces data (only if you opt in) is processed by our hosting provider (Railway) solely to run the backend.

## 6. Your controls

- Toggle Cloud Traces on/off anytime from the popup.
- Clear or delete all locally stored data by removing the Extension from your browser, or via your browser's extension storage settings.
- Request deletion of any Cloud Traces data tied to your device ID by contacting us below.

## 7. Children's privacy

Mnemox is not directed at children under 13, and we do not knowingly collect data from children.

## 8. Changes to this policy

If this policy changes, we will update the "Last updated" date above and, for material changes, note them in the Extension's Chrome Web Store listing.

## 9. Contact

Questions about this policy or your data can be sent to: ajjukak123@gmail.com

// Mnemox — Adapter Registry
// Maps the current hostname to the correct platform adapter.
// Adding a new platform = add one file + one entry here. Zero changes to core logic.

const ADAPTERS = [
  ChatGPTAdapter,
  ClaudeAdapter,
  GeminiAdapter,
];

function getAdapterForPage() {
  const url = window.location.href;
  const adapter = ADAPTERS.find(a => a.urlMatch.test(url));
  if (adapter) {
    console.log('[Mnemox] adapter matched:', adapter.name);
  } else {
    console.log('[Mnemox] no adapter for this page (generic mode)');
  }
  return adapter || null;
}

// Mnemox - Adapter Registry
// Maps the current hostname to the correct platform adapter.
// Adapters are looked up lazily so script load order does not matter.

function getAdapterForPage() {
  var adapters = [];
  if (typeof ChatGPTAdapter !== 'undefined') adapters.push(ChatGPTAdapter);
  if (typeof ClaudeAdapter  !== 'undefined') adapters.push(ClaudeAdapter);
  if (typeof GeminiAdapter  !== 'undefined') adapters.push(GeminiAdapter);

  var url = window.location.href;
  var adapter = null;
  for (var i = 0; i < adapters.length; i++) {
    if (adapters[i].urlMatch && adapters[i].urlMatch.test(url)) {
      adapter = adapters[i];
      break;
    }
  }

  if (adapter) {
    console.log('[Mnemox] adapter matched:', adapter.name);
  } else {
    console.log('[Mnemox] no adapter for this page (generic mode)');
  }
  return adapter;
}

// Mnemox — ChatGPT Platform Adapter (stub)
// Implements the PlatformAdapter interface.
// Real parsing logic added in Day 3-4 (token counter phase).

const ChatGPTAdapter = {
  name: 'chatgpt',
  urlMatch: /chatgpt\.com|chat\.openai\.com/,
  textareaSelector: '#prompt-textarea',

  healthCheck() {
    const el = document.querySelector(this.textareaSelector);
    const found = !!el;
    console.log('[Mnemox][chatgpt] healthCheck:', found ? 'PASS' : 'FAIL - selector not found');
    return found;
  },

  parseChunk(line) {
    // Stub — will parse SSE token deltas in Day 3-4
    return null;
  },

  onHealthFail() {
    console.warn('[Mnemox][chatgpt] selector broken - platform may have updated');
  },
};

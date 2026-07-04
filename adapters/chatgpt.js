// Mnemox - ChatGPT Platform Adapter
// Updated selectors: ChatGPT now uses div[contenteditable] not <textarea>

const ChatGPTAdapter = {
  name: 'chatgpt',
  urlMatch: /chatgpt\.com|chat\.openai\.com/,

  // Multiple fallbacks — ChatGPT UI changes frequently
  textareaSelectors: [
    '#prompt-textarea',
    'div[contenteditable="true"][aria-label]',
    'div[id="prompt-textarea"]',
    'textarea',
  ],

  healthCheck() {
    for (var i = 0; i < this.textareaSelectors.length; i++) {
      var el = document.querySelector(this.textareaSelectors[i]);
      if (el) {
        console.log('[Mnemox][chatgpt] healthCheck: PASS (' + this.textareaSelectors[i] + ')');
        return true;
      }
    }
    console.log('[Mnemox][chatgpt] healthCheck: FAIL — no input found');
    return false;
  },

  parseChunk(line) {
    return null;
  },

  onHealthFail() {
    console.warn('[Mnemox][chatgpt] selectors outdated — ChatGPT may have updated its UI');
  },
};

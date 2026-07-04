// Mnemox - Claude.ai Platform Adapter

const ClaudeAdapter = {
  name: 'claude',
  urlMatch: /claude\.ai/,

  // Try specific selectors before generic contenteditable
  textareaSelectors: [
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"][role="textbox"]',
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"]',
  ],

  healthCheck() {
    for (var i = 0; i < this.textareaSelectors.length; i++) {
      var el = document.querySelector(this.textareaSelectors[i]);
      if (el) {
        console.log('[Mnemox][claude] healthCheck: PASS (' + this.textareaSelectors[i] + ')');
        return true;
      }
    }
    console.log('[Mnemox][claude] healthCheck: FAIL');
    return false;
  },

  parseChunk(line) { return null; },
  onHealthFail() { console.warn('[Mnemox][claude] selector broken - platform may have updated'); },
};

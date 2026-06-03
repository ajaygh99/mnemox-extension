// Mnemox — Claude.ai Platform Adapter (stub)

const ClaudeAdapter = {
  name: 'claude',
  urlMatch: /claude\.ai/,
  textareaSelector: '[contenteditable="true"]',

  healthCheck() {
    const el = document.querySelector(this.textareaSelector);
    const found = !!el;
    console.log('[Mnemox][claude] healthCheck:', found ? 'PASS' : 'FAIL - selector not found');
    return found;
  },

  parseChunk(line) {
    return null;
  },

  onHealthFail() {
    console.warn('[Mnemox][claude] selector broken - platform may have updated');
  },
};

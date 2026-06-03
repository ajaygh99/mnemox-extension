// Mnemox — Gemini Platform Adapter (stub)

const GeminiAdapter = {
  name: 'gemini',
  urlMatch: /gemini\.google\.com/,
  textareaSelector: '.ql-editor',

  healthCheck() {
    const el = document.querySelector(this.textareaSelector);
    const found = !!el;
    console.log('[Mnemox][gemini] healthCheck:', found ? 'PASS' : 'FAIL - selector not found');
    return found;
  },

  parseChunk(line) {
    return null;
  },

  onHealthFail() {
    console.warn('[Mnemox][gemini] selector broken - platform may have updated');
  },
};

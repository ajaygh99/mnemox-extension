// Mnemox - Grok (xAI) Adapter
var GrokAdapter = {
  name: 'grok',
  urlMatch: /x\.com|grok\.com/,
  getInputSelector: function() {
    return 'div[contenteditable="true"][role="textbox"], textarea[placeholder], textarea';
  },
  healthCheck: function() {
    var sel = this.getInputSelector();
    var el = document.querySelector(sel);
    return { adapter: this.name, found: !!el, selector: sel, url: window.location.href };
  }
};

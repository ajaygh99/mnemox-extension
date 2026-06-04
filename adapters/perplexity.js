// Mnemox - Perplexity Adapter
var PerplexityAdapter = {
  name: 'perplexity',
  urlMatch: /perplexity\.ai/,
  getInputSelector: function() {
    return 'textarea[placeholder], div[contenteditable="true"][role="textbox"], textarea';
  },
  healthCheck: function() {
    var sel = this.getInputSelector();
    var el = document.querySelector(sel);
    return { adapter: this.name, found: !!el, selector: sel, url: window.location.href };
  }
};

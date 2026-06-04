// Mnemox - Microsoft Copilot Adapter
var CopilotAdapter = {
  name: 'copilot',
  urlMatch: /copilot\.microsoft\.com/,
  getInputSelector: function() {
    return '#userInput, textarea[name="userInput"], div[contenteditable="true"][role="textbox"], textarea';
  },
  healthCheck: function() {
    var sel = this.getInputSelector();
    var el = document.querySelector(sel);
    return { adapter: this.name, found: !!el, selector: sel, url: window.location.href };
  }
};

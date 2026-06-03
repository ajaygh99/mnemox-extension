// Mnemox — Feature Flags
// All features default OFF.
// Cowork toggles these programmatically. Zero manual DevTools needed.

const DEFAULTS = {
  TOKEN_COUNTER:   false,
  PROMPT_COACHING: false,
  PAYWALL:         false,
};

function getFlag(key, callback) {
  chrome.storage.local.get(key, result => {
    callback(key in result ? result[key] : DEFAULTS[key]);
  });
}

function setFlag(key, value, callback) {
  chrome.storage.local.set({ [key]: value }, callback || (() => {}));
}

function getAllFlags(callback) {
  chrome.storage.local.get(Object.keys(DEFAULTS), result => {
    callback({ ...DEFAULTS, ...result });
  });
}

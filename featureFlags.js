// Mnemox — Feature Flags
// All features default OFF. Toggle via DevTools:
//   chrome.storage.local.set({ TOKEN_COUNTER: true })
// Instant rollback without republishing to any store.

const DEFAULTS = {
  TOKEN_COUNTER:    false,
  PROMPT_COACHING:  false,
  PAYWALL:          false,
};

export async function getFlag(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      resolve(key in result ? result[key] : DEFAULTS[key]);
    });
  });
}

export async function setFlag(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

export async function getAllFlags() {
  return new Promise(resolve => {
    chrome.storage.local.get(Object.keys(DEFAULTS), result => {
      resolve({ ...DEFAULTS, ...result });
    });
  });
}

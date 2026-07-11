// Mnemox QE Suite — postMessage wait helper
// window.postMessage in jsdom (like a real browser) delivers asynchronously
// on a future tick, so integration tests need to await the response event
// rather than reading state synchronously right after posting.

'use strict';

function waitForMessage(window, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`timed out waiting for window message type "${type}" after ${timeoutMs || 2000}ms`));
    }, timeoutMs || 2000);

    function handler(event) {
      if (!event.data || event.data.type !== type) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve(event.data);
    }
    window.addEventListener('message', handler);
  });
}

// For asserting something does NOT happen within a window — resolves true if
// no message of `type` arrives before timeoutMs elapses, false if one does.
function assertNoMessage(window, type, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(true);
    }, timeoutMs || 300);

    function handler(event) {
      if (!event.data || event.data.type !== type) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve(false);
    }
    window.addEventListener('message', handler);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { waitForMessage, assertNoMessage, sleep };

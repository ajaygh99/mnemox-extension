// Mnemox — Prompt Hash Cache
// SHA-256 hash -> score result. Max 100 entries (LRU eviction).
// Zero API calls. Cache hits return in <1ms.

const CACHE_SIZE = 100;
const cache = new Map();

async function hashPrompt(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getCached(text) {
  const hash = await hashPrompt(text);
  if (cache.has(hash)) {
    // Move to end (most recently used)
    const val = cache.get(hash);
    cache.delete(hash);
    cache.set(hash, val);
    return val;
  }
  return null;
}

async function setCached(text, result) {
  const hash = await hashPrompt(text);
  // Evict oldest if at capacity
  if (cache.size >= CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(hash, result);
}

function getCacheSize() {
  return cache.size;
}

function clearCache() {
  cache.clear();
}

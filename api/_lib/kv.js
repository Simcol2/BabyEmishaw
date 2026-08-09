// Shared key/value storage helpers for the guessing game board.
// Backed by Upstash Redis (via @upstash/redis) in production. When no store
// is linked (e.g. local `vercel dev` without env vars), falls back to an
// in-memory store scoped to the running process so local testing still works.
// NOTE: the in-memory fallback does NOT persist across serverless
// invocations on Vercel - a real Redis store must be connected for
// production, or guesses will silently vanish between requests.

let kvClient = null;
let kvUnavailableReason = null;

function getKv() {
  if (kvClient || kvUnavailableReason) return kvClient;

  // Vercel's old standalone "KV" product (KV_REST_API_URL / KV_REST_API_TOKEN)
  // was folded into the Marketplace under Upstash. Depending on which flow
  // the dashboard puts you through, it may inject the Vercel-KV-style names
  // or the raw Upstash names (UPSTASH_REDIS_REST_URL / _TOKEN) - accept
  // either so connecting a store through any current path actually works.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    kvUnavailableReason = 'no_kv_env';
    return null;
  }
  try {
    // Lazy require so the module still loads (for the memory fallback)
    // even if @upstash/redis isn't installed yet in a fresh checkout.
    const { Redis } = require('@upstash/redis');
    kvClient = new Redis({ url, token });
  } catch (e) {
    kvUnavailableReason = 'kv_module_missing';
  }
  return kvClient;
}

const memoryStore = global.__shower_memory_store || (global.__shower_memory_store = new Map());

// Values are always wrapped as { v: <original> } before hitting the store.
// Upstash/Vercel KV auto-JSON-parses string values that happen to look like
// JSON on read, which would silently corrupt entries that are themselves
// JSON strings (every guess is stored as JSON.stringify(entry)). Wrapping
// keeps the round trip type-stable regardless of backend.
async function get(key) {
  const kv = getKv();
  const raw = kv ? await kv.get(key) : (memoryStore.has(key) ? memoryStore.get(key) : null);
  if (raw == null) return null;
  if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'v')) return raw.v;
  return raw;
}
async function set(key, value) {
  const kv = getKv();
  if (kv) return kv.set(key, { v: value });
  memoryStore.set(key, { v: value });
}
async function del(key) {
  const kv = getKv();
  if (kv) return kv.del(key);
  memoryStore.delete(key);
}
async function keys(prefix) {
  const kv = getKv();
  if (kv) return kv.keys(`${prefix}*`);
  return [...memoryStore.keys()].filter(k => k.startsWith(prefix));
}

module.exports = { get, set, del, keys };

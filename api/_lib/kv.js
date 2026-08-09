// Shared key/value storage helpers for the guessing game board.
// Backed by Vercel KV (Upstash Redis) in production. When no KV store is
// linked (e.g. local `vercel dev` without env vars), falls back to an
// in-memory store scoped to the running process so local testing still works.
// NOTE: the in-memory fallback does NOT persist across serverless
// invocations on Vercel - a real KV store must be connected for production.

let kvClient = null;
let kvUnavailableReason = null;

function getKv() {
  if (kvClient || kvUnavailableReason) return kvClient;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    kvUnavailableReason = 'no_kv_env';
    return null;
  }
  try {
    // Lazy require so the module still loads (for the memory fallback)
    // even if @vercel/kv isn't installed yet in a fresh checkout.
    const { kv } = require('@vercel/kv');
    kvClient = kv;
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

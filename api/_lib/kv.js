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
  if (kv) {
    const result = await kv.set(key, { v: value });
    // A healthy Redis SET replies "OK". Anything else (a read-only token,
    // a rejected write, etc.) can come back without the SDK throwing, which
    // would otherwise look like a successful save that silently never
    // happened - surface it instead of swallowing it.
    if (result !== 'OK') {
      const err = new Error('Unexpected SET result: ' + JSON.stringify(result));
      err.code = 'kv_set_unexpected_result';
      throw err;
    }
    return result;
  }
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

// Reports which backend is actually active on THIS running instance, plus a
// live write/read/delete round trip against it. Used by the /api/storage
// ?op=diag endpoint so a real deployment can be checked from the browser
// without touching any guest-facing data (diag:selftest: keys never appear
// on the board, which only lists the shower:entry: prefix).
async function diagnose() {
  const varSource = process.env.KV_REST_API_URL
    ? 'KV_REST_API_URL/KV_REST_API_TOKEN'
    : process.env.UPSTASH_REDIS_REST_URL
      ? 'UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN'
      : null;
  const kv = getKv();
  const result = {
    backend: kv ? 'redis' : 'memory',
    envVarsFound: varSource,
    unavailableReason: kv ? null : kvUnavailableReason,
  };
  if (kv) {
    const testKey = 'diag:selftest:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
    const testVal = 'ok-' + Math.random().toString(36).slice(2, 8);
    try {
      // Raw client calls (bypassing the get/set/del wrapper's {v:...} shape)
      // so the actual SDK/REST responses are visible for debugging, not just
      // our own pass/fail interpretation of them.
      const rawSetResult = await kv.set(testKey, testVal);
      const rawGetResult = await kv.get(testKey);
      const rawDelResult = await kv.del(testKey);
      result.raw = { set: rawSetResult, get: rawGetResult, del: rawDelResult };
      result.selfTest = rawGetResult === testVal ? 'passed' : 'failed_mismatch';
      if (result.selfTest !== 'passed') result.selfTestDetail = { wrote: testVal, read: rawGetResult };
    } catch (e) {
      result.selfTest = 'errored';
      result.selfTestError = String((e && e.message) || e);
    }
  }
  return result;
}

module.exports = { get, set, del, keys, diagnose };

// Shared key/value storage for the guessing game board.
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
async function storeGet(key) {
  const kv = getKv();
  const raw = kv ? await kv.get(key) : (memoryStore.has(key) ? memoryStore.get(key) : null);
  if (raw == null) return null;
  if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'v')) return raw.v;
  return raw;
}
async function storeSet(key, value) {
  const kv = getKv();
  if (kv) return kv.set(key, { v: value });
  memoryStore.set(key, { v: value });
}
async function storeDel(key) {
  const kv = getKv();
  if (kv) return kv.del(key);
  memoryStore.delete(key);
}
async function storeKeys(prefix) {
  const kv = getKv();
  if (kv) return kv.keys(`${prefix}*`);
  return [...memoryStore.keys()].filter(k => k.startsWith(prefix));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { op, key, prefix } = req.query || {};
      if (op === 'list') {
        if (!prefix) return res.status(400).json({ error: 'prefix required' });
        const keys = await storeKeys(prefix);
        return res.status(200).json({ keys });
      }
      if (!key) return res.status(400).json({ error: 'key required' });
      const value = await storeGet(key);
      return res.status(200).json({ value: value == null ? null : value });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { key, value } = body;
      if (!key) return res.status(400).json({ error: 'key required' });
      await storeSet(key, value);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { key } = req.query || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      await storeDel(key);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('storage handler error', e);
    return res.status(500).json({ error: 'storage_unavailable' });
  }
};

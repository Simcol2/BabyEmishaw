// HTTP surface for the client's window.storage shim. Actual persistence
// lives in ./_lib/kv.js, shared with the daily reminder cron function.
const kv = require('./_lib/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { op, key, prefix } = req.query || {};
      if (op === 'diag') {
        const diag = await kv.diagnose();
        diag.vercelEnv = process.env.VERCEL_ENV || null;
        diag.deploymentUrl = process.env.VERCEL_URL || null;
        diag.commit = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null;
        return res.status(200).json(diag);
      }
      if (op === 'list') {
        if (!prefix) return res.status(400).json({ error: 'prefix required' });
        const listKeys = await kv.keys(prefix);
        return res.status(200).json({ keys: listKeys });
      }
      if (!key) return res.status(400).json({ error: 'key required' });
      const value = await kv.get(key);
      return res.status(200).json({ value: value == null ? null : value });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { key, value } = body;
      if (!key) return res.status(400).json({ error: 'key required' });
      await kv.set(key, value);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { key } = req.query || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      await kv.del(key);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('storage handler error', e);
    return res.status(500).json({ error: 'storage_unavailable' });
  }
};

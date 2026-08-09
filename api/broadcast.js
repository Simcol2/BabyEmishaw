// Lets Britt send an ad-hoc update to everyone who left a reminder email -
// e.g. "false labor, still waiting" or "today might be the day". Separate
// from the daily cron, which only fires automatically when a guessed date
// lands. This is triggered on demand from her page (/BabyEmishaw).
const kv = require('./_lib/kv');
const { sendEmail } = require('./_lib/mail');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { passcode, message } = body;

    // Same soft-gate model as the host passcode: not real security (it's
    // one shared code), but it stops this URL from being hit blindly by
    // anyone who isn't going through Britt's page.
    const expected = process.env.BRITT_PASSCODE || '6132';
    if (!passcode || passcode !== expected) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'message required' });
    if (text.length > 2000) return res.status(400).json({ error: 'message too long' });

    const entries = await kv.loadEntries();
    const subscribers = [...new Set(entries.filter(e => e.email).map(e => e.email))];
    if (!subscribers.length) {
      return res.status(200).json({ ok: true, sent: 0, reason: 'no_subscribers' });
    }

    const subject = 'Update from Britt: Baby Emishaw';
    const results = await Promise.allSettled(subscribers.map(email => sendEmail(email, subject, text)));
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (failed) console.error('broadcast: some sends failed', results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message));

    return res.status(200).json({ ok: true, sent, failed });
  } catch (e) {
    console.error('broadcast handler error', e);
    return res.status(500).json({ error: 'broadcast_failed' });
  }
};

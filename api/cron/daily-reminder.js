// Runs once a day (see vercel.json "crons"). Checks the board for any
// guess whose date is today, and if there is one, emails every guest who
// left a reminder address - not just the guest who made that particular
// guess. That's the whole point of the reminder: everyone who opted in
// gets a heads-up whenever any guessed day comes up, so the group keeps
// watching together.
const kv = require('../_lib/kv');

const K_ENTRY = 'shower:entry:';
const NOTIFIED_PREFIX = 'shower:notified:';

function todayKeyUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

async function loadEntries() {
  const keys = await kv.keys(K_ENTRY);
  const out = [];
  for (const k of keys) {
    const raw = await kv.get(k);
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); } catch (e) { /* skip corrupt entry */ }
  }
  return out;
}

async function sendEmail(to, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const from = process.env.FROM_EMAIL || 'Baby Emishaw <onboarding@resend.dev>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Resend send failed (${resp.status}): ${body}`);
  }
}

function namesList(names) {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' and ' + names.slice(-1);
}

module.exports = async function handler(req, res) {
  // Vercel automatically sends this header on scheduled invocations when
  // CRON_SECRET is set as a project env var - stops anyone else from
  // hitting this public URL to trigger emails on demand.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const today = todayKeyUTC();
    const notifiedKey = NOTIFIED_PREFIX + today;

    if (await kv.get(notifiedKey)) {
      return res.status(200).json({ ok: true, skipped: 'already_notified', date: today });
    }

    const entries = await loadEntries();
    const todaysGuesses = entries.filter(e => e.date === today);
    if (!todaysGuesses.length) {
      return res.status(200).json({ ok: true, sent: 0, reason: 'no_guesses_today', date: today });
    }

    const subscribers = [...new Set(entries.filter(e => e.email).map(e => e.email))];
    if (!subscribers.length) {
      await kv.set(notifiedKey, 'true');
      return res.status(200).json({ ok: true, sent: 0, reason: 'no_subscribers', date: today });
    }

    const who = namesList(todaysGuesses.map(e => e.name));
    const site = process.env.SITE_URL ? `\n\nSee the board: ${process.env.SITE_URL}` : '';
    const subject = `Baby Emishaw: ${who} guessed today (${today})`;
    const text = `${who} guessed ${today} for when Baby Emishaw arrives. Keep an eye on your phone!${site}`;

    const results = await Promise.allSettled(subscribers.map(email => sendEmail(email, subject, text)));
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (failed) console.error('daily-reminder: some sends failed', results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message));

    await kv.set(notifiedKey, 'true');
    return res.status(200).json({ ok: true, sent, failed, date: today });
  } catch (e) {
    console.error('daily-reminder handler error', e);
    return res.status(500).json({ error: 'reminder_failed' });
  }
};

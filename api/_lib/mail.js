// Shared mail sender for anything that emails guests - the daily reminder
// cron and Britt's manual broadcast tool both go through this.
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

module.exports = { sendEmail };

// api/log.js — logs FAQ questions, answers, and feedback to Google Sheets
// Uses a Google Apps Script Web App as a proxy.

const LOG_ENDPOINT = process.env.LOG_ENDPOINT; // your Apps Script web app URL

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { question, type, answer, ts } = req.body;
    if (!question || !type) return res.status(400).json({ error: 'Missing fields' });

    // If no log endpoint configured, just succeed silently
    if (!LOG_ENDPOINT) return res.status(200).json({ ok: true });

    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question.slice(0, 500),
        type,
        answer: (answer || '').slice(0, 2000),
        ts: ts || new Date().toISOString()
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log failures are non-critical — don't surface to user
    console.error('Log error:', err);
    return res.status(200).json({ ok: true });
  }
}

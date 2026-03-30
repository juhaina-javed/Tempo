// api/chat.js — Vercel serverless function
// Reads knowledge base from Google Sheets, calls Anthropic Claude

const SHEET_ID = process.env.SHEET_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SHEET_TAB = process.env.SHEET_TAB || 'KB'; // tab name in your sheet

// Cache KB for 5 minutes to avoid hitting Sheets API on every message
let kbCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function fetchKB() {
  const now = Date.now();
  if (kbCache.data && now - kbCache.ts < CACHE_TTL) return kbCache.data;

  // Google Sheets public CSV export URL
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch knowledge base from Google Sheets');
  const csv = await res.text();

  // Parse CSV (handles quoted fields with commas)
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());

  // Map to your actual Google Sheet column headers
  const topicIdx    = headers.indexOf('question');
  const infoIdx     = headers.indexOf('answer');
  const categoryIdx = headers.indexOf('category');
  const linkIdx     = headers.indexOf('source link');
  const contactIdx  = headers.indexOf('escalation contact');
  const slackIdx    = headers.indexOf('slack handle- escalation contact');

  const kb = rows.slice(1)
    .filter(r => r[topicIdx] && r[infoIdx])
    .map(r => ({
      topic:    r[topicIdx]    || '',
      info:     r[infoIdx]     || '',
      category: r[categoryIdx] || '',
      link:     r[linkIdx]     || '',
      contact:  r[contactIdx]  || '',
      slack:    r[slackIdx]    || ''
    }));

  kbCache = { data: kb, ts: now };
  return kb;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i+1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
  return rows;
}

function buildSystemPrompt(kb) {
  const kbText = kb.map((e, i) => {
    let entry = `[${i+1}]`;
    if (e.category) entry += ` [${e.category}]`;
    entry += ` Question: ${e.topic}\nAnswer: ${e.info}`;
    if (e.link)    entry += `\nSource / useful link: ${e.link}`;
    if (e.contact) entry += `\nEscalation email: ${e.contact}`;
    if (e.slack)   entry += `\nEscalation Slack: ${e.slack}`;
    return entry;
  }).join('\n\n');

  return `You are Tempo, a warm and helpful pre-boarding assistant for new hires joining Lyric. You help people navigate the time between accepting their offer and starting their first day.

KNOWLEDGE BASE:
${kbText || '(No entries yet — tell the user to email people@lyric.tech for any questions)'}

HOW TO BEHAVE:
- Answer ONLY using the knowledge base above. Never invent information not in the KB.
- For location-sensitive questions (payroll, taxes, benefits, holidays, contracts), ALWAYS ask which country the person is in before answering, unless they have already told you.
- Ask clarifying questions when context meaningfully changes the answer — one question at a time, keep it brief.
- If the KB doesn't have a clear answer, say: "I don't have that information just yet — please reach out to people@lyric.tech and we'll get back to you."
- When a KB entry has a Source Link, include it naturally in your answer (e.g. "You can find more details here: [link]").
- When ending your answer, always include the escalation contact. If there's a Slack handle, mention it alongside the email: e.g. "Questions? Reach **name@lyric.tech** or **@slackhandle** on Slack."
- If no escalation contact is listed for a topic, use people@lyric.tech.
- Be warm, encouraging, and human. These people just accepted a job offer — they're excited and possibly nervous.
- Keep answers concise: 2–4 short paragraphs or a short bullet list. Don't pad.
- Never call them "employees" — they're joining the team, use "you" or "your" naturally.
- Use **bold** (with asterisks) sparingly for key info like email addresses, Slack handles, or important dates.
- Do NOT show your reasoning or thinking steps — just give the answer.
- If someone seems stressed or anxious, acknowledge it briefly before answering.

TONE: Friendly, clear, low-jargon. Like a helpful, knowledgeable teammate — not a formal HR document.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { history = [] } = req.body;
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Validate history shape
    const safeHistory = history
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20); // keep last 20 turns max

    const kb = await fetchKB();
    const systemPrompt = buildSystemPrompt(kb);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: safeHistory
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error', reply: "I'm having a bit of trouble right now. Please email **people@lyric.tech** and we'll help you directly." });
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't generate a response. Please email people@lyric.tech.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({
      error: 'Internal error',
      reply: "Something went wrong on my end. Please email **people@lyric.tech** and we'll circle back to you."
    });
  }
}

// api/chat.js — Vercel serverless function
// Reads knowledge base from Google Sheets, calls Google Gemini (free tier)

const SHEET_ID  = process.env.SHEET_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SHEET_TAB = process.env.SHEET_TAB || 'KB';

// Cache KB for 5 minutes to avoid hitting Sheets on every message
let kbCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function fetchKB() {
  const now = Date.now();
  if (kbCache.data && now - kbCache.ts < CACHE_TTL) return kbCache.data;

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch knowledge base from Google Sheets');
  const csv = await res.text();

  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());

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

  return `You are Tempo, a warm and helpful People sidekick at Lyric. You help people with anything People-related — from pre-boarding questions before day one, to company policies, benefits, payroll, and beyond.

KNOWLEDGE BASE:
${kbText || '(No entries yet — tell the user to email people@lyric.tech for any questions)'}

HOW TO BEHAVE:
- Answer ONLY using the knowledge base above. Never invent information not in the KB.
- Do NOT start your response with "Welcome to Lyric!" or any welcome greeting — the person may already work here. Jump straight into helping.
- For location-sensitive questions (payroll, taxes, benefits, holidays, contracts), ALWAYS ask which country the person is in before answering, unless they have already told you.
- Ask clarifying questions when context meaningfully changes the answer — one question at a time, keep it brief.
- If the KB doesn't have a clear answer, say: "I don't have that information just yet — please reach out to people@lyric.tech and we'll get back to you."
- When a KB entry has a Source Link, ALWAYS include it in your answer on the first response — do not wait for the user to ask for it. Format it as a markdown link like [Pre-Boarding Guide](https://docs.google.com/...) or if a label isn't natural, just paste the full URL. Never mention a resource exists without including its link.
- When ending your answer, always include the escalation contact. Format it as: "Questions? Reach out to **Full Name** (**@slackhandle** on Slack)." — use the person's actual name and Slack handle from the KB. Do NOT put the email address as the name. If no escalation contact is listed for a topic, use people@lyric.tech.
- Be warm, encouraging, and human. Use "you" or "your" naturally — never call them "employees."
- Keep answers concise: 2-4 short paragraphs or a short bullet list. Don't pad.
- Use **bold** (with asterisks) sparingly for key info like email addresses, Slack handles, or important dates.
- Do NOT show your reasoning or thinking steps — just give the answer.
- If someone seems stressed or anxious, acknowledge it briefly before answering.

TONE: Friendly, clear, low-jargon. Like a helpful, knowledgeable teammate — not a formal HR document.

MUSICAL PUNS: For lighthearted or non-serious questions, sprinkle in subtle musical puns or references (e.g. "Let me get you in tune with how that works…", "Here's the rundown — no need to face the music alone!", "Glad you asked — let's not skip a beat."). Keep it natural and don't force it. Skip puns entirely for sensitive topics like payroll issues, health benefits, or anything stressful.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { history = [] } = req.body;
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    const safeHistory = history
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20);

    const kb = await fetchKB();
    const systemPrompt = buildSystemPrompt(kb);

    // Gemini uses "user" and "model" roles (not "assistant")
    const geminiContents = safeHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.4
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return res.status(502).json({
        error: 'AI service error',
        reply: "I'm having a bit of trouble right now. Please email **people@lyric.tech** and we'll help you directly."
      });
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
      || "Sorry, I couldn't generate a response. Please email people@lyric.tech.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({
      error: 'Internal error',
      reply: "Something went wrong on my end. Please email **people@lyric.tech** and we'll circle back to you."
    });
  }
}

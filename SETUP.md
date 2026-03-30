# Tempo — Setup Guide
*Complete in ~25 minutes. Everything is free.*

---

## What you're building

```
tempo.lyric.tech  ←→  Vercel  ←→  Anthropic API
                           ↕
                    Google Sheets (your KB + FAQ log)
```

---

## Step 1 — Set up your Google Sheet (5 min)

1. Go to **sheets.google.com** → create a new spreadsheet
2. Rename **Sheet1** tab to: `KB`
3. Add these exact column headers in row 1:

   | A | B | C | D |
   |---|---|---|---|
   | topic | info | contact | country |

4. Add your knowledge base rows. Example:

   | topic | info | contact | country |
   |-------|------|---------|---------|
   | Laptop delivery | Your laptop ships 5 business days before your start date via FedEx. You'll get a tracking email to your personal address. | it@lyric.tech | All |
   | First day start time | Your first day starts at 10am in your local timezone. You'll receive calendar invites with Zoom links. | people@lyric.tech | All |
   | Payroll — India | Payroll runs on the last working day of the month via Deel. | payroll@lyric.tech | India |
   | Payroll — US | Payroll runs bi-weekly on Fridays. | payroll@lyric.tech | US |

5. Click **Share** (top right) → **Change to Anyone with the link** → set to **Viewer**
6. Copy your **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_SHEET_ID]/edit
   ```

> **Tip**: Use the `country` column to have different answers for the same topic per region. Use "All" when the answer applies everywhere.

---

## Step 2 — Set up FAQ logging with Apps Script (5 min)

This creates a "FAQ Log" tab in your Sheet automatically.

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Open `apps-script-logger.gs` from this folder and paste its contents
4. On line 7, paste your Sheet ID between the quotes:
   ```js
   const SPREADSHEET_ID = 'your-sheet-id-here';
   ```
5. Click **Save** (floppy disk icon)
6. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** → copy the **Web App URL** (looks like `https://script.google.com/macros/s/ABC.../exec`)
8. Run the `testLog` function to verify it works — you should see a new "FAQ Log" tab appear

> Keep this URL — you'll need it as `LOG_ENDPOINT` in Vercel.

---

## Step 3 — Get your Anthropic API key (3 min)

1. Go to **console.anthropic.com** → sign up or log in
2. Go to **API Keys → Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. Add a few dollars of credit under **Billing** (each conversation costs ~$0.01–0.03)

---

## Step 4 — Create your GitHub repo (3 min)

1. Go to **github.com** → click **New repository**
2. Name it `tempo` (or whatever you like), set to **Private**
3. Click **Create repository**
4. Upload all the files from this folder:
   - `vercel.json`
   - `public/index.html`
   - `api/chat.js`
   - `api/log.js`
5. Click **Commit changes**

> You can drag and drop files directly in the GitHub browser UI — no terminal needed.

---

## Step 5 — Deploy to Vercel (5 min)

1. Go to **vercel.com** → sign up with GitHub
2. Click **Add New → Project**
3. Import your `tempo` repository
4. Before deploying, click **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (your key from Step 3) |
   | `SHEET_ID` | your Google Sheet ID from Step 1 |
   | `LOG_ENDPOINT` | your Apps Script URL from Step 2 |
   | `SHEET_TAB` | `KB` (or whatever you named your tab) |

5. Click **Deploy**
6. In ~60 seconds, Vercel gives you a URL like `tempo-xyz.vercel.app` — test it!

---

## Step 6 — Custom domain: tempo.lyric.tech (5 min)

1. In Vercel, go to your project → **Settings → Domains**
2. Type `tempo.lyric.tech` → click **Add**
3. Vercel shows you a CNAME record to add. Go to wherever `lyric.tech` DNS is managed (Cloudflare, Route 53, GoDaddy, etc.)
4. Add a **CNAME record**:
   - Name: `tempo`
   - Value: `cname.vercel-dns.com`
5. Wait 2–10 minutes → Vercel auto-provisions SSL ✓

---

## Ongoing maintenance

### Updating the knowledge base
Just edit your Google Sheet. Changes are live within **5 minutes** (that's the cache interval). No deploys needed.

### Adding new topics
Add a new row to the `KB` tab. That's it.

### Reviewing FAQ data
Open your Google Sheet → click the `FAQ Log` tab. You'll see every question asked, with timestamps. Sort column B (Question) to spot patterns.

### Adding features later
All the code is in two files:
- `public/index.html` — the chat UI (HTML/CSS/JS)
- `api/chat.js` — the backend (Node.js, serverless)

Edit in GitHub → Vercel auto-deploys in ~30 seconds.

---

## Troubleshooting

**"Could not fetch knowledge base"**
→ Make sure your Sheet is shared as "Anyone with the link can view" and the SHEET_ID env var is correct.

**Tempo says "I don't have that information"**
→ The topic isn't in your KB. Add a row to the Sheet.

**FAQ Log tab not appearing**
→ Run the `testLog` function in Apps Script manually to check for errors.

**Vercel deployment failed**
→ Check the build logs in Vercel dashboard. Most common cause: missing environment variables.

---

## Cost estimate (monthly)
- Vercel hosting: **Free** (Hobby plan)
- Google Sheets: **Free**
- Anthropic API: ~**$2–10/month** depending on usage (100–500 conversations)

---

*Built for Lyric by People Ops. Questions: people@lyric.tech*

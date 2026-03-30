// ─────────────────────────────────────────────
// Tempo FAQ Logger — Google Apps Script
// Paste this into: script.google.com → New Project
// Then: Deploy → New deployment → Web App
//   Execute as: Me
//   Who has access: Anyone
// Copy the Web App URL → paste into Vercel as LOG_ENDPOINT
// ─────────────────────────────────────────────

const LOG_SHEET_NAME = 'FAQ Log';
const SPREADSHEET_ID  = ''; // ← paste your Sheet ID here (same one as KB)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Create log sheet if it doesn't exist
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow(['Timestamp', 'Question', 'Type', 'Date']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Append the log row
    const date = new Date(data.ts || new Date().toISOString());
    sheet.appendRow([
      date,
      data.question || '',
      data.type || 'asked',
      Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function — run this manually to verify setup
function testLog() {
  doPost({ postData: { contents: JSON.stringify({ question: 'Test question', type: 'asked', ts: new Date().toISOString() }) } });
  Logger.log('Done — check your sheet for a new row in FAQ Log tab.');
}

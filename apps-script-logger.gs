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
      sheet.appendRow(['Timestamp', 'Question', 'Answer', 'Type', 'Date']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
      sheet.setFrozenRows(1);
      // Set column widths for readability
      sheet.setColumnWidth(1, 160); // Timestamp
      sheet.setColumnWidth(2, 300); // Question
      sheet.setColumnWidth(3, 400); // Answer
      sheet.setColumnWidth(4, 100); // Type
      sheet.setColumnWidth(5, 110); // Date
    }

    // Append the log row
    const date = new Date(data.ts || new Date().toISOString());
    const newRow = [
      date,
      data.question || '',
      data.answer || '',
      data.type || 'asked',
      Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    ];
    sheet.appendRow(newRow);

    // Highlight unhelpful rows in light red
    if (data.type === 'unhelpful') {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, 1, 1, 5).setBackground('#FDE8E8');
    }

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
  doPost({ postData: { contents: JSON.stringify({ question: 'Test question', answer: 'Test answer from Tempo', type: 'asked', ts: new Date().toISOString() }) } });
  Logger.log('Done — check your sheet for a new row in FAQ Log tab.');
}

// Optional: run this once to add red highlighting to any existing unhelpful rows
function highlightExistingUnhelpful() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'unhelpful') {
      sheet.getRange(i + 1, 1, 1, 5).setBackground('#FDE8E8');
    }
  }
}

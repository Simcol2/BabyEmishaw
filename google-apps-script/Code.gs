// Baby Emishaw Trivia — backend for the "Play the Game" feature.
//
// Receives an answer submission from the web app and appends it as a row
// to this spreadsheet. Deployed as a Web App (Deploy > New deployment >
// Web app), which is what produces the /exec URL the front end calls.
//
// Answers are sent as a GET request with the data in the URL's query
// string, not POST. Apps Script's /exec endpoint internally redirects
// every request, and that redirect can silently downgrade a POST into a
// GET - which would mean submissions quietly hit doGet (a no-op) instead
// of doPost (the one that writes the row), with no error anywhere to
// show it. Using GET from the start sidesteps that entirely: there's no
// method to downgrade, and GET requests never trigger a CORS preflight
// either.
//
// SETUP:
// 1. Paste this whole file into the Apps Script project behind your
//    existing /exec URL (script.google.com), replacing whatever is there.
// 2. Save.
// 3. Deploy > Manage deployments > pencil icon on the active deployment
//    > Version: "New version" > Deploy.
//    IMPORTANT: saving the code alone does NOT update an already-published
//    /exec URL — you must create a new version of that same deployment,
//    otherwise the live URL keeps serving the old code.
// 4. Confirm deployment settings: Execute as "Me", Who has access "Anyone"
//    — the front end calls this unauthenticated, from guests' own browsers.
// 5. Sanity check: open the /exec URL directly in a browser tab with no
//    query string — you should see "Baby Emishaw trivia backend is
//    running." An "Answers" tab appears in this spreadsheet the first
//    time a real submission is logged.

const SHEET_ID = '1T1vHZSKPFu1TP5u7-mgVgepxgEHSZX-FWFUsmCzTtPE';
const SHEET_NAME = 'Answers';

function getAnswersSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Name', 'Question #', 'Question Title', 'Answer']);
  }
  return sheet;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.answer) {
    // No answer param - this is just the health-check / plain visit.
    return ContentService.createTextOutput('Baby Emishaw trivia backend is running.');
  }
  try {
    getAnswersSheet_().appendRow([
      new Date(),
      p.name || '',
      p.question || '',
      p.questionTitle || '',
      p.answer || '',
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Baby Emishaw Trivia — backend for the "Play the Game" feature.
//
// Receives an answer submission from the web app and appends it as a row
// to this spreadsheet. Deployed as a Web App (Deploy > New deployment >
// Web app), which is what produces the /exec URL the front end posts to.
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
//    — the front end posts unauthenticated, from guests' own browsers.
// 5. Sanity check: open the /exec URL directly in a browser tab (a GET
//    request) — you should see "Baby Emishaw trivia backend is running."

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

function doPost(e) {
  try {
    // The front end sends Content-Type: text/plain on purpose (see
    // index.html) so the browser treats it as a "simple request" and
    // skips a CORS preflight OPTIONS call, which Apps Script web apps
    // don't handle. The body is still JSON text — just parse it manually.
    const data = JSON.parse(e.postData.contents);
    getAnswersSheet_().appendRow([
      new Date(),
      data.name || '',
      data.question || '',
      data.questionTitle || '',
      data.answer || '',
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Baby Emishaw trivia backend is running.');
}

/* ============================================================
   services/googleSheetsService.js  -  Google Sheets push for
   the OMR Test Checker.

   All OMR tests share ONE spreadsheet (google_sheet_id on the
   omr_tests row), each test writing to its own tab
   (google_sheet_tab). A service account must be shared as
   Editor on that spreadsheet - see CLAUDE.md / plan docs for
   the one-time manual setup.

   Env vars required:
     GOOGLE_SERVICE_ACCOUNT_EMAIL
     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (escaped \n, unescaped below)
   ============================================================ */

const { google } = require('googleapis');

const HEADER_ROW = ['Submission ID', 'Roll Number', 'Student Name', 'Student Email', 'Correct', 'Wrong', 'Blank', 'Score', 'Updated At'];

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function getAuthClient() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

/* Make sure the tab exists and has a header row. Cheap to call every time -
   Sheets API no-ops if the sheet/tab already exists. */
async function ensureTab(sheets, spreadsheetId, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === tabName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

/* Appends a new row on first finalize, or updates the previously written row
   in place on a re-finalize (tracked via submission.sheet_row_number) so a
   correction never creates a duplicate entry for the same student. */
async function upsertResultRow(test, submission) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured (missing service account env vars).');
  }
  if (!test.google_sheet_id) {
    throw new Error('This test has no Google Sheet ID configured.');
  }

  const sheets = google.sheets({ version: 'v4', auth: getAuthClient() });
  const tabName = test.google_sheet_tab || `Test ${test.id}`;

  await ensureTab(sheets, test.google_sheet_id, tabName);

  const row = [
    submission.id,
    submission.roll_number || '',
    submission.student_name || '',
    submission.student_email || '',
    submission.correct_count,
    submission.wrong_count,
    submission.blank_count,
    submission.score,
    new Date().toISOString(),
  ];

  if (submission.sheet_row_number) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: test.google_sheet_id,
      range: `${tabName}!A${submission.sheet_row_number}:I${submission.sheet_row_number}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return submission.sheet_row_number;
  }

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: test.google_sheet_id,
    range: `${tabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  const match = (appendRes.data.updates.updatedRange || '').match(/![A-Z]+(\d+):/);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = { upsertResultRow, isConfigured };

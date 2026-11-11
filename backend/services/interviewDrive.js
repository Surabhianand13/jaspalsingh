/* ============================================================
   services/interviewDrive.js  -  Private interview recordings

   The admin pastes a Google Drive link for a learner's mock interview
   recording. This gives "view only" access on that one file to the
   learner's registered email, and turns off download / print / copy
   for viewers. The file itself stays restricted (never "Anyone with
   the link"), so a forwarded link opens for nobody else.

   Uses the same service account as interviewCalendar.js. One-time
   manual setup:
     1. Google Cloud console (project of the service account) >
        APIs & Services > enable "Google Drive API".
     2. In Google Drive, share the recordings folder with
        GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor.
   ============================================================ */

const { google } = require('googleapis');

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function client() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/drive']
  );
  return google.drive({ version: 'v3', auth });
}

/* File id from the usual Drive link shapes:
   /file/d/ID/view, /open?id=ID, /uc?id=ID, or a bare id. */
function fileIdFrom(link) {
  const s = String(link || '').trim();
  let m = s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

function viewLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function friendly(err) {
  const code = err && (err.code || (err.response && err.response.status));
  const raw = (err && err.message) || String(err);
  if (/has not been used|is disabled/i.test(raw)) return 'Google Drive API is not enabled for the service account project yet.';
  if (code === 404) return 'The site cannot see this file. Share the recordings folder with the service account as Editor.';
  if (code === 403) return 'The service account is not allowed to share this file. Give it Editor access on the recordings folder.';
  if (/no google account|not a google account|invalid sharing request/i.test(raw)) return 'This email has no Google account. The learner can click "Request access" on the video and you approve it.';
  return raw.slice(0, 300);
}

/* Grant view-only access on fileId to email. Returns { ok, error }. */
async function shareWithLearner(fileId, email) {
  if (!isConfigured()) return { ok: false, error: 'Google service account env vars are not set.' };
  if (!email) return { ok: false, error: 'This learner has no registered email.' };
  const drive = client();
  try {
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      sendNotificationEmail: true,
      emailMessage: 'Your RPSC AE mock interview recording from Dr. Jaspal Singh. You can also open it from My Programs on jaspalsingh.in.',
      requestBody: { type: 'user', role: 'reader', emailAddress: email },
    });
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  // Best effort: viewers cannot download, print or copy.
  try {
    await drive.files.update({ fileId, supportsAllDrives: true, requestBody: { copyRequiresWriterPermission: true } });
  } catch (err) {
    console.error('[interview drive] could not turn off download:', err.message);
  }
  return { ok: true, error: null };
}

module.exports = { isConfigured, fileIdFrom, viewLink, shareWithLearner };

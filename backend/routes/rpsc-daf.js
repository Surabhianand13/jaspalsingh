/* ============================================================
   routes/rpsc-daf.js  -  FREE "Personalised RPSC AE interview
   questions from Jaspal Sir" (2026-11-18)

   A verified RPSC AE candidate (application number check, or a paid
   RPSC AE Interview learner) uploads their DAF from Free Resources.
   The admin reads it, replies with typed questions and/or a PDF, and
   the learner sees the reply on their profile (#rpsc-questions). The
   reply email only links back to the site.

   Files are private: stored under an unguessable R2 key, never exposed
   as a URL, and streamed only to the admin or that learner.

   Learner (protectLearner):
     GET  /api/rpsc-daf/me            - status, prefill, my submission
     POST /api/rpsc-daf               - submit / replace DAF (multipart "daf")
     GET  /api/rpsc-daf/me/daf        - my DAF file
     GET  /api/rpsc-daf/me/reply-pdf  - reply PDF from Jaspal Sir
   Admin (protect):
     GET  /api/rpsc-daf/admin                 - submissions + counts
     GET  /api/rpsc-daf/admin/:id/daf         - DAF file
     GET  /api/rpsc-daf/admin/:id/reply-pdf   - reply PDF
     POST /api/rpsc-daf/admin/:id/reply       - { reply_text, action: save|send, remove_pdf } + optional "pdf"
     POST /api/rpsc-daf/admin/announce        - { mode: sample|all, to } one-time announcement
     POST /api/rpsc-daf/admin/send-to-team    - { to } email DAFs not yet sent to the content team
   ============================================================ */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');
const { diskUpload, cleanupTempFile, putFileToR2 } = require('../utils/diskUpload');
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { protectLearner } = require('../middleware/learnerAuth');
const { isRpscVerified } = require('./free-resources');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');
const { baseHtml, esc, FROM, SITE } = require('../services/paymentEmailService');

const BRANCHES = ['Civil', 'Mechanical', 'Electrical'];
const DAF_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = diskUpload({ limits: { fileSize: 10 * 1024 * 1024 } });
const VIEW_LINK = `${SITE}/profile/#rpsc-questions`;

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS rpsc_daf_submissions (
    id                 SERIAL PRIMARY KEY,
    learner_id         INTEGER NOT NULL UNIQUE,
    name               TEXT,
    email              TEXT,
    phone              TEXT,
    branch             TEXT,
    application_number TEXT,
    roll_no            TEXT,
    daf_key            TEXT NOT NULL,
    daf_type           TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'new',
    reply_text         TEXT,
    reply_pdf_key      TEXT,
    replied_at         TIMESTAMPTZ,
    reply_emailed_at   TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Content team hand-off: the DAF file last emailed to the team. A new
  // or replaced DAF (daf_key changed) counts as "not sent yet".
  await query(`ALTER TABLE rpsc_daf_submissions ADD COLUMN IF NOT EXISTS team_sent_key TEXT`);
  await query(`ALTER TABLE rpsc_daf_submissions ADD COLUMN IF NOT EXISTS team_sent_at TIMESTAMPTZ`);
  await query(`CREATE TABLE IF NOT EXISTS rpsc_daf_team (
    id      INTEGER PRIMARY KEY DEFAULT 1,
    emails  TEXT,
    last_at TIMESTAMPTZ
  )`);
  await query(`CREATE TABLE IF NOT EXISTS rpsc_daf_announce (
    email   TEXT PRIMARY KEY,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

function privateKey(prefix, ext) {
  return `private/rpsc-daf/${prefix}-${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

/* Stream a private R2 object (inline, no caching). */
async function streamFile(res, key, type, filename) {
  const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  res.setHeader('Content-Type', obj.ContentType || type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  obj.Body.pipe(res);
}

/* Paid RPSC AE Interview learner (programme), by learner id / email / phone. */
async function isPaidInterview(learnerId, email, phone) {
  const r = await query(
    `SELECT 1 FROM enrollments e JOIN programs p ON p.slug = e.program_slug
     WHERE p.category = 'interview' AND e.status = 'paid' AND e.refund_status != 'initiated'
       AND (e.learner_id = $1 OR LOWER(TRIM(e.student_email)) = LOWER(TRIM($2))
            OR RIGHT(REGEXP_REPLACE(e.student_phone, '\\D', '', 'g'), 10) = $3)
     LIMIT 1`,
    [learnerId, email || '', String(phone || '').replace(/\D/g, '').slice(-10) || '-']
  );
  return r.rows.length > 0;
}

function publicSubmission(s) {
  if (!s) return null;
  return {
    status: s.status, branch: s.branch, application_number: s.application_number, roll_no: s.roll_no,
    created_at: s.created_at, updated_at: s.updated_at, daf_type: s.daf_type,
    // The reply is shown only once it has been sent.
    reply_text: s.status === 'answered' ? s.reply_text : null,
    has_reply_pdf: s.status === 'answered' && !!s.reply_pdf_key,
    replied_at: s.status === 'answered' ? s.replied_at : null,
  };
}

/* ══════════════════════ LEARNER ══════════════════════════════ */

router.get('/me', protectLearner, async (req, res, next) => {
  try {
    const l = (await query('SELECT id, name, email, phone FROM learners WHERE id = $1', [req.learner.id])).rows[0];
    if (!l) return res.status(401).json({ error: 'Please log in again.' });
    const v = (await query('SELECT application_number, roll_no FROM rpsc_ae_verifications WHERE learner_id = $1', [l.id])).rows[0];
    const s = (await query('SELECT * FROM rpsc_daf_submissions WHERE learner_id = $1', [l.id])).rows[0];
    res.json({
      verified: await isRpscVerified(req.learner),
      prefill: { name: l.name || '', email: l.email || '', phone: l.phone || '', application_number: v ? v.application_number : '', roll_no: v ? v.roll_no : '' },
      submission: publicSubmission(s),
    });
  } catch (err) { next(err); }
});

router.post('/', protectLearner, cleanupTempFile, upload.single('daf'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const l = (await query('SELECT id, name, email, phone FROM learners WHERE id = $1', [req.learner.id])).rows[0];
    if (!l) return res.status(401).json({ error: 'Please log in again.' });

    const name = String(b.name || l.name || '').trim().slice(0, 120);
    const phone = String(b.phone || l.phone || '').replace(/\D/g, '').slice(-10);
    const branch = String(b.branch || '');
    const appNum = String(b.application_number || '').trim();
    const roll = String(b.roll_no || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (phone.length !== 10) return res.status(400).json({ error: 'Please enter your 10-digit mobile number.' });
    if (!BRANCHES.includes(branch)) return res.status(400).json({ error: 'Please choose your branch.' });
    if (!/^2024\d{8}$/.test(appNum)) return res.status(400).json({ error: 'Invalid application number. It must be 12 digits starting with 2024.' });
    if (!roll) return res.status(400).json({ error: 'Please enter your RPSC AE roll number.' });
    if (b.consent !== 'true' && b.consent !== true) return res.status(400).json({ error: 'Please tick the consent box.' });

    // Verified RPSC AE candidates only - same rule as the RPSC AE free
    // download. Not verified yet: verify with this application number now.
    if (!(await isRpscVerified(req.learner))) {
      const taken = (await query('SELECT learner_id FROM rpsc_ae_verifications WHERE application_number = $1', [appNum])).rows[0];
      if (taken && taken.learner_id !== l.id) {
        return res.status(409).json({ error: 'This application number is already linked to another account. Contact support if this is your number.' });
      }
      await query(
        `INSERT INTO rpsc_ae_verifications (learner_id, application_number, roll_no) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [l.id, appNum, roll]
      );
      if (!(await isRpscVerified(req.learner))) return res.status(403).json({ error: 'Could not verify your RPSC AE application. Please contact support.' });
    }

    const existing = (await query('SELECT id, status, daf_key, daf_type FROM rpsc_daf_submissions WHERE learner_id = $1', [l.id])).rows[0];
    if (existing && existing.status === 'answered') return res.status(409).json({ error: 'Jaspal Sir has already replied to your DAF.' });
    if (!req.file && !existing) return res.status(400).json({ error: 'Please upload your DAF (PDF or photo).' });

    let dafKey = existing ? existing.daf_key : null;
    let dafType = existing ? existing.daf_type : null;
    if (req.file) {
      const ext = DAF_TYPES[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: 'Upload your DAF as a PDF, JPG or PNG.' });
      dafKey = privateKey(`daf-${l.id}`, ext);
      dafType = req.file.mimetype;
      await putFileToR2(req.file, dafKey, dafType);
    }

    await query(
      `INSERT INTO rpsc_daf_submissions (learner_id, name, email, phone, branch, application_number, roll_no, daf_key, daf_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (learner_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, branch = EXCLUDED.branch,
         application_number = EXCLUDED.application_number, roll_no = EXCLUDED.roll_no,
         daf_key = EXCLUDED.daf_key, daf_type = EXCLUDED.daf_type, updated_at = NOW()`,
      [l.id, name, l.email, phone, branch, appNum, roll, dafKey, dafType]
    );
    const s = (await query('SELECT * FROM rpsc_daf_submissions WHERE learner_id = $1', [l.id])).rows[0];
    res.status(existing ? 200 : 201).json({ ok: true, submission: publicSubmission(s) });
  } catch (err) { next(err); }
});

router.get('/me/daf', protectLearner, async (req, res, next) => {
  try {
    const s = (await query('SELECT daf_key, daf_type FROM rpsc_daf_submissions WHERE learner_id = $1', [req.learner.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'No DAF submitted yet.' });
    await streamFile(res, s.daf_key, s.daf_type, `my-daf.${DAF_TYPES[s.daf_type] || 'pdf'}`);
  } catch (err) { next(err); }
});

router.get('/me/reply-pdf', protectLearner, async (req, res, next) => {
  try {
    const s = (await query(`SELECT reply_pdf_key FROM rpsc_daf_submissions WHERE learner_id = $1 AND status = 'answered'`, [req.learner.id])).rows[0];
    if (!s || !s.reply_pdf_key) return res.status(404).json({ error: 'No PDF yet.' });
    await streamFile(res, s.reply_pdf_key, 'application/pdf', 'questions-from-jaspal-sir.pdf');
  } catch (err) { next(err); }
});

/* ══════════════════════ ADMIN ══════════════════════════════ */

router.get('/admin', protect, async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT s.id, s.learner_id, s.name, s.email, s.phone, s.branch, s.application_number, s.roll_no, s.daf_type,
              s.status, s.reply_text, (s.reply_pdf_key IS NOT NULL) AS has_reply_pdf, s.replied_at, s.created_at, s.updated_at,
              s.team_sent_at, (s.team_sent_key IS DISTINCT FROM s.daf_key) AS team_pending
       FROM rpsc_daf_submissions s ORDER BY (s.status = 'answered'), s.created_at DESC`
    )).rows;
    for (const r of rows) r.paid = await isPaidInterview(r.learner_id, r.email, r.phone);
    const announce = await announceTargets();
    const team = (await query('SELECT emails, last_at FROM rpsc_daf_team WHERE id = 1')).rows[0] || {};
    res.json({
      submissions: rows,
      counts: {
        new: rows.filter(r => r.status === 'new').length,
        in_progress: rows.filter(r => r.status === 'in_progress').length,
        answered: rows.filter(r => r.status === 'answered').length,
      },
      announce: { pending: announce.targets.length, sent: announce.sent },
      team: { emails: team.emails || '', last_at: team.last_at || null, pending: rows.filter(r => r.team_pending).length, sending: teamSending },
    });
  } catch (err) { next(err); }
});

router.get('/admin/:id/daf', protect, async (req, res, next) => {
  try {
    const s = (await query('SELECT daf_key, daf_type, roll_no FROM rpsc_daf_submissions WHERE id = $1', [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'Not found.' });
    await streamFile(res, s.daf_key, s.daf_type, `daf-${String(s.roll_no || req.params.id).replace(/[^A-Za-z0-9-]/g, '')}.${DAF_TYPES[s.daf_type] || 'pdf'}`);
  } catch (err) { next(err); }
});

router.get('/admin/:id/reply-pdf', protect, async (req, res, next) => {
  try {
    const s = (await query('SELECT reply_pdf_key FROM rpsc_daf_submissions WHERE id = $1', [req.params.id])).rows[0];
    if (!s || !s.reply_pdf_key) return res.status(404).json({ error: 'No reply PDF.' });
    await streamFile(res, s.reply_pdf_key, 'application/pdf', 'reply.pdf');
  } catch (err) { next(err); }
});

const replyUpload = diskUpload({ limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/admin/:id/reply', protect, cleanupTempFile, replyUpload.single('pdf'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const s = (await query('SELECT * FROM rpsc_daf_submissions WHERE id = $1', [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'Not found.' });
    const action = b.action === 'send' ? 'send' : 'save';
    const text = String(b.reply_text || '').trim().slice(0, 20000) || null;

    let pdfKey = s.reply_pdf_key;
    if (b.remove_pdf === 'true') pdfKey = null;
    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'The reply file must be a PDF.' });
      pdfKey = privateKey(`reply-${s.learner_id}`, 'pdf');
      await putFileToR2(req.file, pdfKey, 'application/pdf');
    }
    if (action === 'send' && !text && !pdfKey) return res.status(400).json({ error: 'Type the questions or attach a PDF before sending.' });

    const status = action === 'send' || s.status === 'answered' ? 'answered' : 'in_progress';
    await query(
      `UPDATE rpsc_daf_submissions SET reply_text = $1, reply_pdf_key = $2, status = $3,
              replied_at = CASE WHEN $3 = 'answered' THEN COALESCE(replied_at, NOW()) ELSE replied_at END,
              updated_at = NOW()
        WHERE id = $4`,
      [text, pdfKey, status, s.id]
    );

    // First send: email the learner a link back to the site (once).
    let emailed = false;
    if (status === 'answered') {
      const claim = await query(`UPDATE rpsc_daf_submissions SET reply_emailed_at = NOW() WHERE id = $1 AND reply_emailed_at IS NULL RETURNING email, name`, [s.id]);
      if (claim.rows.length && claim.rows[0].email) {
        sendReadyEmail(claim.rows[0].email, claim.rows[0].name).catch(err => console.error('[rpsc daf ready email]', err.message));
        emailed = true;
      }
    }
    res.json({ ok: true, status, emailed });
  } catch (err) { next(err); }
});

/* ── Emails ─────────────────────────────────────────────────── */

function btn(href, label) {
  return `<div style="text-align:center;margin:0 0 24px;">
    <a href="${esc(href)}" style="display:inline-block;background:#C81240;color:#fff;border-radius:10px;padding:15px 34px;font-size:16px;font-weight:800;text-decoration:none;">${label}</a>
  </div>`;
}
function tag(text) {
  return `<div style="text-align:center;margin-bottom:22px;"><div style="display:inline-block;background:#f0fdf4;border:1px solid #86efac;border-radius:50px;padding:8px 22px;">
    <span style="font-size:13px;font-weight:700;color:#166534;">${text}</span></div></div>`;
}

async function sendReadyEmail(to, name, subjectPrefix = '') {
  const first = esc((name || 'there').split(' ')[0]);
  const body = `
    ${tag('RPSC AE Interview - Personalised questions')}
    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">Your questions are ready, ${first}</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      Jaspal Sir has gone through your DAF and prepared interview questions based on your own profile. Log in to view them.
    </p>
    ${btn(VIEW_LINK, 'View my questions &rarr;')}
    <p style="margin:0;font-size:12.5px;color:#9ca3af;text-align:center;">Log in with the same account you used to submit your DAF.</p>`;
  return resendSend({ from: FROM, to, subject: `${subjectPrefix}Your personalised RPSC AE interview questions from Jaspal Sir are ready`, html: baseHtml(body) }, PRIORITY.DEFAULT);
}

async function sendAnnounceEmail(to, name, subjectPrefix = '') {
  const first = esc((name || 'there').split(' ')[0]);
  const body = `
    ${tag('FREE for RPSC AE candidates')}
    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">Personalised interview questions from Jaspal Sir, ${first}</h2>
    <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      The RPSC board asks questions from your own DAF - your job, hometown, hobbies, education and branch. Upload your DAF and Jaspal Sir will prepare interview questions based on your profile. It is completely free.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ Log in at jaspalsingh.in and open Free Resources</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ Fill your details and upload your DAF (PDF or photo)</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ Your questions appear in your account - we email you when they are ready</td></tr>
    </table>
    ${btn(VIEW_LINK, 'Submit my DAF &rarr;')}
    <p style="margin:0;font-size:12.5px;color:#9ca3af;text-align:center;">Only for RPSC AE 2024 candidates. Your DAF is kept private.</p>`;
  return resendSend({ from: FROM, to, subject: `${subjectPrefix}FREE: Personalised RPSC AE interview questions from Jaspal Sir, based on your DAF`, html: baseHtml(body) }, PRIORITY.DEFAULT);
}

/* Announcement: RPSC AE verified learners + paid RPSC AE Interview
   learners, one per email, who have not submitted yet; once each. */
async function announceTargets() {
  const rows = (await query(
    `SELECT DISTINCT ON (LOWER(TRIM(x.email))) x.email, x.name, x.learner_id FROM (
       SELECT l.email, l.name, l.id AS learner_id FROM rpsc_ae_verifications v JOIN learners l ON l.id = v.learner_id
       UNION ALL
       SELECT e.student_email, e.student_name, e.learner_id FROM enrollments e JOIN programs p ON p.slug = e.program_slug
        WHERE p.category = 'interview' AND e.status = 'paid' AND e.refund_status != 'initiated'
          AND e.order_id NOT LIKE 'JSP-ADMINPREVIEW-%'
     ) x WHERE x.email IS NOT NULL AND TRIM(x.email) <> ''
     ORDER BY LOWER(TRIM(x.email)), x.learner_id NULLS LAST`
  )).rows;
  const submitted = new Set((await query('SELECT LOWER(TRIM(email)) AS e FROM rpsc_daf_submissions')).rows.map(r => r.e));
  const sent = new Set((await query('SELECT email FROM rpsc_daf_announce')).rows.map(r => r.email));
  const key = r => String(r.email).trim().toLowerCase();
  return {
    targets: rows.filter(r => !submitted.has(key(r)) && !sent.has(key(r))),
    sent: rows.filter(r => sent.has(key(r))).length,
    key,
  };
}

router.post('/admin/announce', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.mode === 'sample') {
      const to = String(b.to || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid email address.' });
      await sendAnnounceEmail(to, 'Rahul Sharma', '[SAMPLE] ');
      return res.json({ ok: true, sent: 1 });
    }
    if (b.mode !== 'all') return res.status(400).json({ error: 'Invalid mode.' });
    const { targets, key } = await announceTargets();
    (async () => {
      for (const t of targets) {
        try {
          const claim = await query(`INSERT INTO rpsc_daf_announce (email) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1`, [key(t)]);
          if (!claim.rows.length) continue;
          await sendAnnounceEmail(t.email, t.name);
        } catch (err) { console.error(`[rpsc daf announce] ${t.email}:`, err.message); }
      }
      console.log(`[rpsc daf announce] queued ${targets.length} email(s)`);
    })();
    res.json({ ok: true, queued: targets.length });
  } catch (err) { next(err); }
});

/* ── Content team hand-off ──────────────────────────────────
   Emails every DAF not yet sent to the content team as attachments
   named <learner email>_<Paid|Free>.<ext>, with a details table.
   Each click sends only new (or replaced) DAFs. Large sets are split
   into several emails to stay under the attachment size limit. */

const TEAM_BATCH_BYTES = 25 * 1024 * 1024; // raw bytes per email (Resend limit is 40 MB after encoding)
let teamSending = false;

async function r2Buffer(key) {
  const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const c of obj.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

function teamFilename(s, used) {
  const base = `${String(s.email || `learner-${s.learner_id}`).trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, '')}_${s.paid ? 'Paid' : 'Free'}`;
  const ext = DAF_TYPES[s.daf_type] || 'pdf';
  let name = `${base}.${ext}`, n = 2;
  while (used.has(name)) name = `${base}-${n++}.${ext}`;
  used.add(name);
  return name;
}

function teamEmailHtml(batch, part, parts) {
  const td = 'padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12.5px;color:#374151;vertical-align:top;';
  const rows = batch.map((b, i) => `<tr>
    <td style="${td}">${i + 1}</td>
    <td style="${td}"><strong>${esc(b.s.name || '')}</strong><br>${esc(b.s.email || '')}<br>${esc(b.s.phone || '')}</td>
    <td style="${td}">${b.s.paid ? '<strong style="color:#6d28d9;">Paid</strong>' : 'Free'}</td>
    <td style="${td}">${esc(b.s.branch || '')}</td>
    <td style="${td}">${esc(b.s.roll_no || '')}<br><span style="color:#9ca3af;">${esc(b.s.application_number || '')}</span></td>
    <td style="${td}font-size:11.5px;">${esc(b.filename)}</td>
  </tr>`).join('');
  const th = 'padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e2e8f0;';
  return baseHtml(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">RPSC AE DAFs for personalised questions</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      ${batch.length} DAF${batch.length === 1 ? '' : 's'} attached${parts > 1 ? ` (email ${part} of ${parts})` : ''}. Each file is named by the learner's registered email and tagged Paid or Free.
      Please prepare the questions; replies are posted from Admin &gt; Free Resources &gt; DAF submissions.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;">
      <tr><th style="${th}">#</th><th style="${th}">Learner</th><th style="${th}">Type</th><th style="${th}">Branch</th><th style="${th}">Roll / App no.</th><th style="${th}">File</th></tr>
      ${rows}
    </table>
    <p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">These DAFs are private learner documents. Please do not share them outside the team.</p>`);
}

router.post('/admin/send-to-team', protect, async (req, res, next) => {
  if (teamSending) return res.status(409).json({ error: 'DAFs are already being sent. Please wait a minute and reload.' });
  teamSending = true;
  try {
    const to = String((req.body || {}).to || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    if (!to.length || to.length > 10 || !to.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
      return res.status(400).json({ error: 'Enter the content team email address (several can be separated by commas).' });
    }
    await query(`INSERT INTO rpsc_daf_team (id, emails) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET emails = EXCLUDED.emails`, [to.join(', ')]);

    const pending = (await query(
      `SELECT id, learner_id, name, email, phone, branch, application_number, roll_no, daf_key, daf_type, created_at
         FROM rpsc_daf_submissions WHERE team_sent_key IS DISTINCT FROM daf_key ORDER BY created_at`
    )).rows;
    if (!pending.length) return res.json({ ok: true, sent: 0, emails: 0 });

    // Load files and split into batches by size.
    const used = new Set(), batches = [[]];
    let size = 0;
    const failed = [];
    for (const s of pending) {
      try {
        s.paid = await isPaidInterview(s.learner_id, s.email, s.phone);
        const buf = await r2Buffer(s.daf_key);
        if (batches[batches.length - 1].length && size + buf.length > TEAM_BATCH_BYTES) { batches.push([]); size = 0; }
        batches[batches.length - 1].push({ s, buf, filename: teamFilename(s, used) });
        size += buf.length;
      } catch (err) {
        console.error(`[rpsc daf team] could not read DAF ${s.id}:`, err.message);
        failed.push(s.email || s.id);
      }
    }

    let sent = 0, emails = 0;
    const parts = batches.filter(b => b.length).length;
    const day = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    for (const batch of batches) {
      if (!batch.length) continue;
      emails++;
      try {
        await resendSend({
          from: FROM, to,
          subject: `RPSC AE DAFs - ${batch.length} new (${day})${parts > 1 ? ` - part ${emails} of ${parts}` : ''}`,
          html: teamEmailHtml(batch, emails, parts),
          attachments: batch.map(b => ({ filename: b.filename, content: b.buf.toString('base64') })),
        }, PRIORITY.DEFAULT);
        // Mark exactly the file that went out, so a later replacement is sent again.
        for (const b of batch) {
          await query(`UPDATE rpsc_daf_submissions SET team_sent_key = $1, team_sent_at = NOW() WHERE id = $2`, [b.s.daf_key, b.s.id]);
        }
        sent += batch.length;
      } catch (err) {
        console.error(`[rpsc daf team] email ${emails} failed:`, err.message);
        batch.forEach(b => failed.push(b.s.email || b.s.id));
      }
    }
    if (sent) await query(`UPDATE rpsc_daf_team SET last_at = NOW() WHERE id = 1`);
    res.json({ ok: true, sent, emails, failed });
  } catch (err) { next(err); }
  finally { teamSending = false; }
});

module.exports = router;
module.exports.migrate = migrate;

/* ============================================================
   routes/learner-schedule.js  -  Self-serve paper/answer-sheet upload
   Learner-facing counterpart to the admin-only programs schedule
   endpoints. Replaces manual "email the paper, email it back"
   distribution (routes/enrollment-account.js send-omr-papers) for both
   OMR-course and offline learners.

     GET  /api/schedule/:program_slug                      - test list, gated
     POST /api/schedule/:program_slug/tests/:scheduleId/submit-omr - self-serve upload

   No auto-grading: the learner just uploads a photo/PDF of their filled
   answer sheet within the test's deadline window (schedule_uploads
   table). Ranks are computed manually and posted on WhatsApp separately -
   see the (2026-07-18) comment on the schedule_uploads migration in
   server.js for why this doesn't go through the omr_tests/omr_submissions
   bubble-detection pipeline.

   Access control: every route re-checks getActiveEnrollment
   independently (paid + not refunded) - see utils/enrollmentAccess.js.
   A refunded or never-purchased learner gets the same "no active
   enrollment" response from both, regardless of program type.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, BUCKET } = require('../config/r2');
const { watermarkFromR2 } = require('../utils/pdfWatermark');
const { diskUpload, cleanupTempFile, putFileToR2 } = require('../utils/diskUpload');
const { query } = require('../config/db');
const { protectLearner } = require('../middleware/learnerAuth');
const { handleUploadError } = require('../middleware/upload');
const { getActiveEnrollment } = require('../utils/enrollmentAccess');
const { canonicalize, slugsFor } = require('../utils/programSlugAliases');

/* Some enrollments are keyed to a legacy checkout slug (see
   programSlugAliases.js) while program_schedule/programs are always
   keyed by the canonical slug - normalize the URL param once here so
   every route below queries the right rows regardless of which slug
   variant the frontend happened to pass. */
router.param('program_slug', (req, res, next, slug) => {
  req.params.program_slug = canonicalize(slug);
  next();
});

const upload = diskUpload({
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype) || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image or PDF files are allowed.'));
  },
});

/* Learner identity fields (id/email/phone) needed by getActiveEnrollment -
   mirrors the lookup in GET /api/enrollment/my-enrollments. */
async function loadLearner(learnerId) {
  const lr = await query('SELECT id, name, email, phone FROM learners WHERE id = $1', [learnerId]);
  return lr.rows[0] || null;
}

function computeFlags(row) {
  const now = new Date();
  const releaseAt  = row.paper_release_at ? new Date(row.paper_release_at) : null;
  const deadlineAt = row.omr_upload_deadline ? new Date(row.omr_upload_deadline) : null;

  const released = !releaseAt || now >= releaseAt;
  // Solution defaults to LOCKED when no deadline is set (exam-integrity safe
  // default), unlike Paper which defaults to open once released (access-
  // friendly default) - an admin oversight should never leak sensitive content.
  const afterDeadline = !!deadlineAt && now > deadlineAt;

  return {
    paper_available:     released && !!row.question_paper_url,
    blank_omr_available: released && row.requires_omr_upload && !!row.blank_omr_url,
    upload_open:         row.requires_omr_upload && !!deadlineAt && now >= (releaseAt || now) && now <= deadlineAt,
    solution_available:  afterDeadline && !!row.solution_url,
  };
}

/* ── GET /api/schedule/:program_slug ─────────────────────────
   Full test list for a program, each row already gated - the
   frontend never needs to guess what's unlocked. Includes the
   learner's own upload (if any) so the UI can show "submitted". */
router.get('/:program_slug', protectLearner, async (req, res, next) => {
  try {
    const learner = await loadLearner(req.learner.id);
    if (!learner) return res.status(401).json({ error: 'Learner not found.' });

    const enrollment = await getActiveEnrollment(learner.id, learner.email, learner.phone, req.params.program_slug);
    if (!enrollment) {
      return res.status(403).json({ error: 'No active enrollment for this program. If you were refunded, this program is no longer accessible.' });
    }

    // Admin may have created the schedule/programs row under a legacy slug
    // (e.g. a leftover pre-2026-07-08 programs row with the old checkout
    // slug still exists) even though the learner-facing slug is canonical -
    // match on every known alias, not just the exact canonical value, or
    // real uploaded schedules silently show as empty. See
    // utils/programSlugAliases.js.
    const candidateSlugs = slugsFor(req.params.program_slug);

    // Combo programs (RSSB Degree/Diploma, ESE Civil/General Studies) bundle
    // two tracks under one program_slug - each numbered 1..N independently.
    // If the program has categories and none was requested, return the
    // category list only (frontend shows a track picker) rather than a
    // schedule that would otherwise mix both tracks' "Test 1" together.
    const progRes = await query(`SELECT omr_categories FROM programs WHERE slug = ANY($1::text[]) AND omr_categories IS NOT NULL LIMIT 1`, [candidateSlugs]);
    const categories = (progRes.rows[0] && progRes.rows[0].omr_categories) || [];
    const selectedCategory = req.query.category || null;

    if (categories.length && !selectedCategory) {
      return res.json({ categories, tests: [] });
    }
    if (categories.length && !categories.includes(selectedCategory)) {
      return res.status(400).json({ error: 'Unknown track.' });
    }

    const result = await query(
      `SELECT ps.id, ps.test_number, ps.test_date, ps.syllabus, ps.questions, ps.marks, ps.duration_minutes,
              ps.question_paper_url, ps.blank_omr_url, ps.solution_url,
              ps.paper_release_at, ps.omr_upload_deadline, ps.requires_omr_upload,
              su.id AS upload_id, su.file_url AS my_upload_url, su.uploaded_at AS my_upload_at,
              tr.id AS result_id, tr.total_marks AS result_total_marks, tr.correct_count AS result_correct_count,
              tr.wrong_count AS result_wrong_count, tr.blank_count AS result_blank_count,
              tr.rank_position AS result_rank, tr.question_breakdown AS result_breakdown,
              tr.marks_text AS result_marks_text, tr.rank_text AS result_rank_text
       FROM program_schedule ps
       LEFT JOIN schedule_uploads su ON su.schedule_id = ps.id AND su.enrollment_id = $2
       LEFT JOIN test_results tr ON tr.schedule_id = ps.id AND tr.enrollment_id = $2 AND tr.published_at IS NOT NULL
       WHERE ps.program_slug = ANY($1::text[]) AND ps.category IS NOT DISTINCT FROM $3
       ORDER BY ps.sort_order ASC, ps.test_number ASC`,
      [candidateSlugs, enrollment.id, selectedCategory]
    );

    const tests = result.rows.map(row => {
      const flags = computeFlags(row);
      return {
        id: row.id,
        test_number: row.test_number,
        test_date: row.test_date,
        syllabus: row.syllabus,
        questions: row.questions,
        marks: row.marks,
        duration_minutes: row.duration_minutes,
        requires_omr_upload: row.requires_omr_upload,
        // Exposed so the dashboard can show "releases at" / "due by" times -
        // the gating itself is still computed here (flags), never client-side.
        paper_release_at: row.paper_release_at,
        omr_upload_deadline: row.omr_upload_deadline,
        ...flags,
        question_paper_url: flags.paper_available ? row.question_paper_url : null,
        blank_omr_url:      flags.blank_omr_available ? row.blank_omr_url : null,
        solution_url:       flags.solution_available ? row.solution_url : null,
        my_upload: row.upload_id ? { url: row.my_upload_url, uploaded_at: row.my_upload_at } : null,
        result: row.result_id != null ? {
          // As typed by admin ("Absent" etc.) when set, else the number.
          total_marks:   row.result_marks_text != null ? row.result_marks_text : row.result_total_marks,
          correct_count: row.result_correct_count,
          wrong_count:   row.result_wrong_count,
          blank_count:   row.result_blank_count,
          rank:          row.result_rank_text != null ? row.result_rank_text : row.result_rank,
          breakdown:     row.result_breakdown,
        } : null,
      };
    });

    res.json({ categories, tests });
  } catch (err) { next(err); }
});

/* ── GET /api/schedule/:program_slug/materials ───────────────
   शौर्य Batch DPPs / formula sheets - no recorded content is provided for
   the offline classroom program, so subject PDFs are the only self-study
   support between classes. Scoped to whichever content track(s) the
   learner's specific purchase includes (programs.launch_config.batch.
   materialTracks) - a Non-Technical-only buyer never sees Technical PDFs
   meant for a different option. Empty array (not an error) for any
   program that isn't a शौर्य Batch option, so the frontend can call this
   unconditionally and just hide the tab when it comes back empty. ── */
router.get('/:program_slug/materials', protectLearner, async (req, res, next) => {
  try {
    const learner = await loadLearner(req.learner.id);
    if (!learner) return res.status(401).json({ error: 'Learner not found.' });

    const enrollment = await getActiveEnrollment(learner.id, learner.email, learner.phone, req.params.program_slug);
    if (!enrollment) {
      return res.status(403).json({ error: 'No active enrollment for this program. If you were refunded, this program is no longer accessible.' });
    }

    const progRes = await query(`SELECT launch_config FROM programs WHERE slug = $1`, [req.params.program_slug]);
    const lc = progRes.rows[0] && progRes.rows[0].launch_config;
    const tracks = (lc && lc.batch && lc.batch.materialTracks) || [];
    if (!tracks.length) return res.json({ materials: [] });

    const result = await query(
      `SELECT id, track, kind, subject, title FROM batch_materials
       WHERE track = ANY($1::text[]) AND file_url IS NOT NULL
       ORDER BY track ASC, sort_order ASC, id ASC`,
      [tracks]
    );
    res.json({ materials: result.rows });
  } catch (err) { next(err); }
});

/* ── GET /api/schedule/:program_slug/materials/:id/view ──────
   View-only delivery of a single material - never exposes the R2 URL to
   the frontend. The backend pulls the original PDF from R2 itself,
   burns a per-request watermark (this learner's name/email/phone +
   timestamp, tiled across every page) into a fresh copy, and streams
   that. This is a deterrent against casual forwarding, not a leakproof
   control - a devtools-savvy user can still extract the response, but
   what they get is watermarked back to them, and there's no more
   plain downloadable link to share in the first place. Same
   enrollment/track gate as the list route above. ── */
router.get('/:program_slug/materials/:id/view', protectLearner, async (req, res, next) => {
  try {
    const learner = await loadLearner(req.learner.id);
    if (!learner) return res.status(401).json({ error: 'Learner not found.' });

    const enrollment = await getActiveEnrollment(learner.id, learner.email, learner.phone, req.params.program_slug);
    if (!enrollment) {
      return res.status(403).json({ error: 'No active enrollment for this program. If you were refunded, this program is no longer accessible.' });
    }

    const progRes = await query(`SELECT launch_config FROM programs WHERE slug = $1`, [req.params.program_slug]);
    const lc = progRes.rows[0] && progRes.rows[0].launch_config;
    const tracks = (lc && lc.batch && lc.batch.materialTracks) || [];
    if (!tracks.length) return res.status(403).json({ error: 'Not available for this program.' });

    const matRes = await query(`SELECT id, track, file_key FROM batch_materials WHERE id = $1`, [req.params.id]);
    const material = matRes.rows[0];
    if (!material || !material.file_key) return res.status(404).json({ error: 'Material not found.' });
    if (!tracks.includes(material.track)) return res.status(403).json({ error: 'Not part of your enrolled track.' });

    const stamp = `${learner.name || 'Learner'} · ${learner.email}${learner.phone ? ' · ' + learner.phone : ''} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const watermarked = await watermarkFromR2(material.file_key, stamp);
    if (!watermarked) return res.status(422).json({ error: 'This file could not be opened for viewing.' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="material.pdf"',
      'Cache-Control': 'no-store, private',
      'Content-Length': watermarked.length,
    });
    res.send(watermarked);
  } catch (err) { next(err); }
});

/* ── Answer-sheet upload (learner OMR) ───────────────────────
   Preferred path (2026-10-24): the browser uploads the file straight to
   R2 with a short-lived presigned PUT URL, so the bytes never pass
   through the 512 MB Render instance:
     1. POST .../tests/:scheduleId/upload-url   -> { url, key }
     2. browser PUTs the file to url
     3. POST .../tests/:scheduleId/confirm-upload { key } -> saves it
   POST .../submit-omr (multipart through Render) stays as the fallback
   for when the direct PUT fails (e.g. R2 CORS not configured yet).
   All three re-validate enrollment AND the upload window server-side -
   the frontend hiding the button is not the enforcement. Re-uploading
   before the deadline replaces the previous file. */
const MAX_ANSWER_SHEET_BYTES = 20 * 1024 * 1024;
const ANSWER_SHEET_TYPE = (t) => /^image\//.test(t || '') || t === 'application/pdf';

/* Learner + active enrollment + open schedule row, or { status, error }. */
async function uploadContext(req) {
  const learner = await loadLearner(req.learner.id);
  if (!learner) return { status: 401, error: 'Learner not found.' };
  const enrollment = await getActiveEnrollment(learner.id, learner.email, learner.phone, req.params.program_slug);
  if (!enrollment) {
    return { status: 403, error: 'No active enrollment for this program. If you were refunded, this program is no longer accessible.' };
  }
  const scheduleRes = await query(
    `SELECT * FROM program_schedule WHERE id = $1 AND program_slug = ANY($2::text[])`,
    [req.params.scheduleId, slugsFor(req.params.program_slug)]
  );
  if (!scheduleRes.rows.length) return { status: 404, error: 'Test not found.' };
  const row = scheduleRes.rows[0];
  if (!computeFlags(row).upload_open) return { status: 403, error: 'The upload window for this test is closed.' };
  return { learner, enrollment, row };
}

function answerSheetKey(row, enrollment, filename) {
  return `answer-sheets/${row.id}/${enrollment.id}-${Date.now()}-${String(filename || 'sheet').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80)}`;
}

/* Insert or replace this learner's upload row, then delete the previous
   file from R2. */
async function saveAnswerSheet({ learner, enrollment, row }, key) {
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  const existing = await query(
    `SELECT file_key FROM schedule_uploads WHERE schedule_id = $1 AND enrollment_id = $2`,
    [row.id, enrollment.id]
  );
  let result;
  if (existing.rows.length) {
    result = await query(
      `UPDATE schedule_uploads SET file_url = $1, file_key = $2, uploaded_at = NOW(), file_deleted_at = NULL,
         learner_name = $3, learner_email = $4, learner_phone = $5
       WHERE schedule_id = $6 AND enrollment_id = $7 RETURNING *`,
      [publicUrl, key, learner.name, learner.email, learner.phone, row.id, enrollment.id]
    );
    const oldKey = existing.rows[0].file_key;
    if (oldKey && oldKey !== key) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey })); }
      catch (err) { console.warn(`⚠️  Could not delete old R2 upload "${oldKey}":`, err.message); }
    }
  } else {
    result = await query(
      `INSERT INTO schedule_uploads (schedule_id, enrollment_id, learner_name, learner_email, learner_phone, file_url, file_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [row.id, enrollment.id, learner.name, learner.email, learner.phone, publicUrl, key]
    );
  }
  return result.rows[0];
}

/* ── POST .../tests/:scheduleId/upload-url ──
   Body: { filename, content_type, size }. The signed URL is bound to
   this exact Content-Type and Content-Length, so the browser can't use
   it to push a different or larger file. Valid for 10 minutes. */
router.post('/:program_slug/tests/:scheduleId/upload-url', protectLearner, async (req, res, next) => {
  try {
    const { filename, content_type, size } = req.body || {};
    const bytes = parseInt(size, 10);
    if (!ANSWER_SHEET_TYPE(content_type)) return res.status(400).json({ error: 'Only image or PDF files are allowed.' });
    if (!bytes || bytes < 1) return res.status(400).json({ error: 'Empty file.' });
    if (bytes > MAX_ANSWER_SHEET_BYTES) return res.status(400).json({ error: 'File is too large. Max 20 MB.' });

    const ctx = await uploadContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

    const key = answerSheetKey(ctx.row, ctx.enrollment, filename);
    const url = await getSignedUrl(r2, new PutObjectCommand({
      Bucket: BUCKET, Key: key, ContentType: content_type, ContentLength: bytes,
    }), { expiresIn: 600, signableHeaders: new Set(['content-type']) });
    res.json({ url, key });
  } catch (err) { next(err); }
});

/* ── POST .../tests/:scheduleId/confirm-upload ──
   Body: { key }. Only accepts a key minted for THIS learner's enrollment
   and THIS test, and checks the object really landed in R2 within the
   size limit before recording it. */
router.post('/:program_slug/tests/:scheduleId/confirm-upload', protectLearner, async (req, res, next) => {
  try {
    const ctx = await uploadContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

    const key = String((req.body || {}).key || '');
    if (!key.startsWith(`answer-sheets/${ctx.row.id}/${ctx.enrollment.id}-`) || key.includes('..')) {
      return res.status(400).json({ error: 'Invalid upload.' });
    }
    let head;
    try { head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
    catch (e) { return res.status(400).json({ error: 'Upload not found - please try again.' }); }
    if ((head.ContentLength || 0) > MAX_ANSWER_SHEET_BYTES || !ANSWER_SHEET_TYPE(head.ContentType)) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); } catch (_) {}
      return res.status(400).json({ error: 'Only image or PDF files up to 20 MB are allowed.' });
    }

    res.status(201).json({ upload: await saveAnswerSheet(ctx, key) });
  } catch (err) { next(err); }
});

/* ── POST .../tests/:scheduleId/submit-omr ── fallback: multipart upload
   through Render, buffered to a temp file (not RAM) then streamed to R2. */
router.post('/:program_slug/tests/:scheduleId/submit-omr', protectLearner, cleanupTempFile, upload.single('photo'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ctx = await uploadContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

    const key = answerSheetKey(ctx.row, ctx.enrollment, req.file.originalname);
    await putFileToR2(req.file, key, req.file.mimetype);

    res.status(201).json({ upload: await saveAnswerSheet(ctx, key) });
  } catch (err) { next(err); }
});

module.exports = router;

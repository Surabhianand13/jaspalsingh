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
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');
const { query } = require('../config/db');
const { protectLearner } = require('../middleware/learnerAuth');
const { handleUploadError } = require('../middleware/upload');
const { getActiveEnrollment } = require('../utils/enrollmentAccess');

const upload = multer({
  storage: multer.memoryStorage(),
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

    const result = await query(
      `SELECT ps.id, ps.test_number, ps.test_date, ps.syllabus, ps.questions,
              ps.question_paper_url, ps.blank_omr_url, ps.solution_url,
              ps.paper_release_at, ps.omr_upload_deadline, ps.requires_omr_upload,
              su.id AS upload_id, su.file_url AS my_upload_url, su.uploaded_at AS my_upload_at
       FROM program_schedule ps
       LEFT JOIN schedule_uploads su ON su.schedule_id = ps.id AND su.enrollment_id = $2
       WHERE ps.program_slug = $1
       ORDER BY ps.sort_order ASC, ps.test_number ASC`,
      [req.params.program_slug, enrollment.id]
    );

    const tests = result.rows.map(row => {
      const flags = computeFlags(row);
      return {
        id: row.id,
        test_number: row.test_number,
        test_date: row.test_date,
        syllabus: row.syllabus,
        questions: row.questions,
        requires_omr_upload: row.requires_omr_upload,
        ...flags,
        question_paper_url: flags.paper_available ? row.question_paper_url : null,
        blank_omr_url:      flags.blank_omr_available ? row.blank_omr_url : null,
        solution_url:       flags.solution_available ? row.solution_url : null,
        my_upload: row.upload_id ? { url: row.my_upload_url, uploaded_at: row.my_upload_at } : null,
      };
    });

    res.json({ tests });
  } catch (err) { next(err); }
});

/* ── POST /api/schedule/:program_slug/tests/:scheduleId/submit-omr ──
   Self-serve answer-sheet upload, replacing "fill it, email it, admin
   downloads it". Re-validates enrollment AND the upload window
   server-side - the frontend hiding the button is not the enforcement.
   Re-uploading before the deadline replaces the previous file. */
router.post('/:program_slug/tests/:scheduleId/submit-omr', protectLearner, upload.single('photo'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const learner = await loadLearner(req.learner.id);
    if (!learner) return res.status(401).json({ error: 'Learner not found.' });

    const enrollment = await getActiveEnrollment(learner.id, learner.email, learner.phone, req.params.program_slug);
    if (!enrollment) {
      return res.status(403).json({ error: 'No active enrollment for this program. If you were refunded, this program is no longer accessible.' });
    }

    const scheduleRes = await query(
      `SELECT * FROM program_schedule WHERE id = $1 AND program_slug = $2`,
      [req.params.scheduleId, req.params.program_slug]
    );
    if (!scheduleRes.rows.length) {
      return res.status(404).json({ error: 'Test not found.' });
    }
    const row = scheduleRes.rows[0];
    if (!computeFlags(row).upload_open) {
      return res.status(403).json({ error: 'The upload window for this test is closed.' });
    }

    const existing = await query(
      `SELECT file_key FROM schedule_uploads WHERE schedule_id = $1 AND enrollment_id = $2`,
      [row.id, enrollment.id]
    );

    const key = `answer-sheets/${row.id}/${enrollment.id}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype,
    }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    let result;
    if (existing.rows.length) {
      result = await query(
        `UPDATE schedule_uploads SET file_url = $1, file_key = $2, uploaded_at = NOW(),
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

    res.status(201).json({ upload: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;

/* ============================================================
   routes/learner-schedule.js  -  Self-serve paper/OMR/solution
   Learner-facing counterpart to the admin-only omr-check + programs
   schedule endpoints. Replaces manual "email the paper, email it back"
   distribution (routes/enrollment-account.js send-omr-papers) for both
   OMR-course and offline learners.

     GET  /api/schedule/:program_slug                         - test list, gated
     POST /api/schedule/:program_slug/tests/:scheduleId/submit-omr - self-serve upload

   Access control: every route re-checks getActiveEnrollment
   independently (paid + not refunded) - see utils/enrollmentAccess.js.
   A refunded or never-purchased learner gets the same "no active
   enrollment" response from both, regardless of program type.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protectLearner } = require('../middleware/learnerAuth');
const { uploadOmrPhoto, handleUploadError } = require('../middleware/upload');
const { getActiveEnrollment } = require('../utils/enrollmentAccess');
const { createSubmission } = require('../controllers/omrCheckController');

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
  // Solution/Answer Key default to LOCKED when no deadline is set (exam-integrity
  // safe default), unlike Paper which defaults to open once released (access-
  // friendly default) - an admin oversight should never leak sensitive content.
  const afterDeadline = !!deadlineAt && now > deadlineAt;

  return {
    paper_available:    released && !!row.question_paper_url,
    blank_omr_available: released && row.requires_omr_upload && !!row.blank_omr_url,
    upload_open:        row.requires_omr_upload && !!row.blank_omr_url && !!deadlineAt && now >= (releaseAt || now) && now <= deadlineAt,
    solution_available: afterDeadline && !!row.solution_url,
    answer_key_available: afterDeadline && !!(row.answer_key || row.omr_answer_key),
  };
}

/* ── GET /api/schedule/:program_slug ─────────────────────────
   Full test list for a program, each row already gated - the
   frontend never needs to guess what's unlocked. Includes the
   learner's own submission (Response Sheet) where one exists. */
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
              ps.answer_key,
              ot.answer_key AS omr_answer_key, ot.total_questions, ot.marks_per_correct, ot.negative_marking,
              os.id AS submission_id, os.status AS submission_status, os.score, os.correct_count,
              os.wrong_count, os.blank_count, os.detected_answers, os.corrected_answers, os.finalized_at
       FROM program_schedule ps
       LEFT JOIN omr_tests ot ON ot.id = ps.omr_test_id
       LEFT JOIN omr_submissions os ON os.test_id = ps.omr_test_id AND os.enrollment_id = $2
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
        answer_key:         flags.answer_key_available ? (row.answer_key || row.omr_answer_key) : null,
        response_sheet: row.submission_id ? {
          status: row.submission_status,
          score: row.score,
          correct_count: row.correct_count,
          wrong_count: row.wrong_count,
          blank_count: row.blank_count,
          detected_answers: row.corrected_answers || row.detected_answers,
          finalized_at: row.finalized_at,
        } : null,
      };
    });

    res.json({ tests });
  } catch (err) { next(err); }
});

/* ── POST /api/schedule/:program_slug/tests/:scheduleId/submit-omr ──
   Self-serve OMR upload, replacing "fill it, email it, admin re-uploads
   it". Re-validates enrollment AND the upload window server-side - the
   frontend hiding the button is not the enforcement. */
router.post('/:program_slug/tests/:scheduleId/submit-omr', protectLearner, uploadOmrPhoto.single('photo'), handleUploadError, async (req, res, next) => {
  try {
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
    const flags = computeFlags(row);
    if (!flags.upload_open) {
      return res.status(403).json({ error: 'The OMR upload window for this test is closed.' });
    }
    if (!row.omr_test_id) {
      return res.status(400).json({ error: 'This test is not configured for OMR upload.' });
    }

    const submission = await createSubmission({
      testId: row.omr_test_id,
      file: req.file,
      student_name: learner.name,
      student_email: learner.email,
      student_phone: learner.phone,
      roll_number: null,
      enrollment_id: enrollment.id,
      submitted_by_learner: true,
    });

    res.status(201).json({ submission });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

/* ============================================================
   controllers/omrCheckController.js  -  OMR Test Checker (admin-only)

   Templates  -  a calibrated bubble-sheet layout, reusable across tests
   Tests      -  an answer key + marking scheme, tied to one template
   Submissions - one uploaded student photo, graded against a test

   Not to be confused with the existing "omr-papers"/"omr-analysis"
   sections (backend/routes/enrollment-account.js), which just email
   question-paper PDFs and are unrelated to grading.
   ============================================================ */

const { query }        = require('../config/db');
const cloudinary        = require('../config/cloudinary');
const detector          = require('../services/omrDetectorClient');
const { upsertResultRow, isConfigured: sheetsConfigured } = require('../services/googleSheetsService');

const destroyCloudinaryAsset = async (publicId, resourceType = 'image') => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`⚠️  Could not delete Cloudinary asset "${publicId}":`, err.message);
  }
};

/* ── Templates ──────────────────────────────────────────────── */

const listTemplates = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT t.*, COUNT(ot.id)::int AS test_count
      FROM omr_templates t
      LEFT JOIN omr_tests ot ON ot.template_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.json({ templates: result.rows });
  } catch (err) { next(err); }
};

const getTemplate = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM omr_templates WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template: result.rows[0] });
  } catch (err) { next(err); }
};

/* POST /api/omr-check/templates  -  name only; reference image attached next */
const createTemplate = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const result = await query(
      `INSERT INTO omr_templates (name, reference_image_url, canonical_width, canonical_height, corner_points, question_blocks, created_by)
       VALUES ($1, '', 0, 0, '[]'::jsonb, '[]'::jsonb, $2)
       RETURNING *`,
      [name.trim(), req.admin && req.admin.email]
    );
    res.status(201).json({ template: result.rows[0] });
  } catch (err) { next(err); }
};

/* POST /api/omr-check/templates/:id/reference-image  -  uploadOmrReference.single('image') */
const uploadReferenceImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    /* multer-storage-cloudinary streams directly to Cloudinary and merges the
       upload response (which includes width/height for image resource_type)
       onto req.file - no local buffer is available to inspect with sharp. */
    const width  = req.file.width  || 0;
    const height = req.file.height || 0;

    const result = await query(
      `UPDATE omr_templates
       SET reference_image_url = $1, canonical_width = $2, canonical_height = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [req.file.path, width, height, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template: result.rows[0] });
  } catch (err) { next(err); }
};

/* PUT /api/omr-check/templates/:id/calibration */
const saveCalibration = async (req, res, next) => {
  try {
    const { corner_points, question_blocks, roll_number_grid, option_count } = req.body;
    if (!Array.isArray(corner_points) || corner_points.length !== 4) {
      return res.status(400).json({ error: 'corner_points must be an array of exactly 4 {x,y} points.' });
    }
    if (!Array.isArray(question_blocks) || !question_blocks.length) {
      return res.status(400).json({ error: 'question_blocks is required.' });
    }
    const result = await query(
      `UPDATE omr_templates
       SET corner_points = $1, question_blocks = $2, roll_number_grid = $3, option_count = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(corner_points),
        JSON.stringify(question_blocks),
        roll_number_grid ? JSON.stringify(roll_number_grid) : null,
        option_count || 5,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template: result.rows[0] });
  } catch (err) { next(err); }
};

/* POST /api/omr-check/templates/:id/calibration-preview  -  proxies to Python, no DB write */
const calibrationPreview = async (req, res, next) => {
  try {
    const tRes = await query('SELECT reference_image_url FROM omr_templates WHERE id = $1', [req.params.id]);
    if (!tRes.rows.length) return res.status(404).json({ error: 'Template not found.' });

    const { corner_points, question_blocks } = req.body;
    const data = await detector.calibratePreview({
      image_url: tRes.rows[0].reference_image_url,
      corner_points,
      question_blocks,
    });
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(502).json({ error: 'OMR service error: ' + err.message });
    next(err);
  }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const inUse = await query('SELECT id FROM omr_tests WHERE template_id = $1 LIMIT 1', [req.params.id]);
    if (inUse.rows.length) {
      return res.status(400).json({ error: 'This template is used by one or more tests and cannot be deleted.' });
    }
    const result = await query('DELETE FROM omr_templates WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found.' });
    res.json({ message: 'Template deleted.' });
  } catch (err) { next(err); }
};

/* ── Tests ──────────────────────────────────────────────────── */

const listTests = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ot.*, t.name AS template_name,
        COUNT(os.id)::int AS submission_count,
        COUNT(os.id) FILTER (WHERE os.status = 'finalized')::int AS finalized_count
      FROM omr_tests ot
      JOIN omr_templates t ON t.id = ot.template_id
      LEFT JOIN omr_submissions os ON os.test_id = ot.id
      GROUP BY ot.id, t.name
      ORDER BY ot.created_at DESC
    `);
    res.json({ tests: result.rows });
  } catch (err) { next(err); }
};

const getTest = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ot.*, t.reference_image_url, t.canonical_width, t.canonical_height,
             t.corner_points, t.question_blocks, t.roll_number_grid, t.option_count, t.name AS template_name
      FROM omr_tests ot
      JOIN omr_templates t ON t.id = ot.template_id
      WHERE ot.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Test not found.' });
    res.json({ test: result.rows[0] });
  } catch (err) { next(err); }
};

const createTest = async (req, res, next) => {
  try {
    const {
      template_id, name, program_slug, total_questions,
      marks_per_correct, negative_marking, answer_key,
      google_sheet_id, google_sheet_tab,
    } = req.body;

    if (!template_id || !name || !total_questions || !answer_key) {
      return res.status(400).json({ error: 'template_id, name, total_questions and answer_key are required.' });
    }

    const result = await query(
      `INSERT INTO omr_tests
         (template_id, name, program_slug, total_questions, marks_per_correct, negative_marking,
          answer_key, google_sheet_id, google_sheet_tab, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        template_id, name.trim(), program_slug || null, total_questions,
        marks_per_correct || 1, negative_marking || 0,
        JSON.stringify(answer_key),
        google_sheet_id || null, google_sheet_tab || name.trim(),
        req.admin && req.admin.email,
      ]
    );
    res.status(201).json({ test: result.rows[0] });
  } catch (err) { next(err); }
};

const updateTest = async (req, res, next) => {
  try {
    const {
      name, program_slug, total_questions, marks_per_correct,
      negative_marking, answer_key, google_sheet_id, google_sheet_tab,
    } = req.body;

    const result = await query(
      `UPDATE omr_tests SET
         name              = COALESCE($1, name),
         program_slug      = COALESCE($2, program_slug),
         total_questions   = COALESCE($3, total_questions),
         marks_per_correct = COALESCE($4, marks_per_correct),
         negative_marking  = COALESCE($5, negative_marking),
         answer_key        = COALESCE($6, answer_key),
         google_sheet_id   = COALESCE($7, google_sheet_id),
         google_sheet_tab  = COALESCE($8, google_sheet_tab),
         updated_at        = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        name || null, program_slug || null, total_questions || null,
        marks_per_correct || null, negative_marking !== undefined ? negative_marking : null,
        answer_key ? JSON.stringify(answer_key) : null,
        google_sheet_id || null, google_sheet_tab || null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Test not found.' });
    res.json({ test: result.rows[0] });
  } catch (err) { next(err); }
};

const archiveTest = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE omr_tests SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Test not found.' });
    res.json({ test: result.rows[0] });
  } catch (err) { next(err); }
};

/* ── Submissions ────────────────────────────────────────────── */

/* Runs the Python detector for a submission's photo against its test's template,
   re-uploads the rectified image to Cloudinary, and updates the submission row.
   Shared between the initial upload and the manual "re-run detection" action. */
async function runDetection(submission, test) {
  try {
    const detectRes = await detector.detect({
      image_url: submission.photo_url,
      template: {
        canonical_width:  test.canonical_width,
        canonical_height: test.canonical_height,
        corner_points:    test.corner_points,
        question_blocks:  test.question_blocks,
        roll_number_grid: test.roll_number_grid,
        option_count:     test.option_count,
      },
      total_questions: test.total_questions,
    });

    let rectifiedUrl = null;
    if (detectRes.rectified_image_base64) {
      const uploadRes = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${detectRes.rectified_image_base64}`,
        { folder: 'jaspalsingh/omr-rectified', public_id: `omr_rect_${submission.id}_${Date.now()}` }
      );
      rectifiedUrl = uploadRes.secure_url;
    }

    await query(
      `UPDATE omr_submissions
       SET status = 'needs_review', detected_answers = $1, rectified_image_url = $2,
           roll_number = COALESCE(roll_number, $3), detector_error = NULL, updated_at = NOW()
       WHERE id = $4`,
      [
        JSON.stringify(detectRes.answers || {}),
        rectifiedUrl,
        (detectRes.roll_number && detectRes.roll_number.value) || null,
        submission.id,
      ]
    );
  } catch (err) {
    await query(
      `UPDATE omr_submissions SET status = 'failed', detector_error = $1, updated_at = NOW() WHERE id = $2`,
      [err.message || 'Detection failed.', submission.id]
    );
  }
}

/* POST /api/omr-check/tests/:testId/submissions  -  uploadOmrPhoto.single('photo') */
/* Shared by admin's uploadSubmission and the learner self-serve submit-omr
   route, so both go through the exact same validate → insert → detect
   pipeline instead of two copies drifting apart. Throws { status, message }
   on validation failure (caller decides how to respond); on success returns
   the finalized submission row. Always destroys the uploaded Cloudinary
   asset on any failure so orphaned photos don't accumulate. */
async function createSubmission({ testId, file, student_name, student_email, student_phone, roll_number, enrollment_id, submitted_by_learner }) {
  const testRes = await query(`
    SELECT ot.*, t.canonical_width, t.canonical_height, t.corner_points,
           t.question_blocks, t.roll_number_grid, t.option_count
    FROM omr_tests ot JOIN omr_templates t ON t.id = ot.template_id
    WHERE ot.id = $1
  `, [testId]);

  if (!testRes.rows.length) {
    await destroyCloudinaryAsset(file.filename);
    throw { status: 404, message: 'Test not found.' };
  }
  const test = testRes.rows[0];

  if (!student_name || !student_name.trim()) {
    await destroyCloudinaryAsset(file.filename);
    throw { status: 400, message: 'student_name is required.' };
  }

  const insertRes = await query(
    `INSERT INTO omr_submissions
       (test_id, student_name, student_email, student_phone, roll_number, photo_url, status, enrollment_id, submitted_by_learner)
     VALUES ($1,$2,$3,$4,$5,$6,'processing',$7,$8)
     RETURNING *`,
    [test.id, student_name.trim(), student_email || null, student_phone || null, roll_number || null, file.path,
     enrollment_id || null, !!submitted_by_learner]
  );
  const submission = insertRes.rows[0];

  await runDetection(submission, test);

  const finalRes = await query('SELECT * FROM omr_submissions WHERE id = $1', [submission.id]);
  return finalRes.rows[0];
}

const uploadSubmission = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });
    const { student_name, student_email, student_phone, roll_number } = req.body;
    const submission = await createSubmission({
      testId: req.params.testId, file: req.file,
      student_name, student_email, student_phone, roll_number,
      enrollment_id: null, submitted_by_learner: false,
    });
    res.status(201).json({ submission });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

const listSubmissions = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, test_id, student_name, student_email, roll_number, status,
              score, correct_count, wrong_count, blank_count, created_at, finalized_at
       FROM omr_submissions WHERE test_id = $1 ORDER BY created_at DESC`,
      [req.params.testId]
    );
    res.json({ submissions: result.rows });
  } catch (err) { next(err); }
};

const getSubmission = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT os.*, ot.total_questions, ot.answer_key, ot.marks_per_correct, ot.negative_marking,
             ot.name AS test_name, t.question_blocks, t.roll_number_grid, t.option_count,
             t.canonical_width, t.canonical_height
      FROM omr_submissions os
      JOIN omr_tests ot ON ot.id = os.test_id
      JOIN omr_templates t ON t.id = ot.template_id
      WHERE os.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ submission: result.rows[0] });
  } catch (err) { next(err); }
};

/* PUT /api/omr-check/submissions/:id/review  -  save admin corrections, no scoring yet.
   Works even on an already-finalized submission (moves it back to 'reviewed' so an
   explicit re-finalize is required rather than silently re-scoring). */
const reviewSubmission = async (req, res, next) => {
  try {
    const { corrected_answers, roll_number } = req.body;
    if (!corrected_answers || typeof corrected_answers !== 'object') {
      return res.status(400).json({ error: 'corrected_answers is required.' });
    }
    const result = await query(
      `UPDATE omr_submissions
       SET corrected_answers = $1, roll_number = COALESCE($2, roll_number), status = 'reviewed', updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(corrected_answers), roll_number || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ submission: result.rows[0] });
  } catch (err) { next(err); }
};

const rerunDetection = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT os.*, ot.total_questions, ot.canonical_width, ot.canonical_height
      FROM omr_submissions os JOIN omr_tests ot ON ot.id = os.test_id
      WHERE os.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Submission not found.' });

    const testRes = await query(`
      SELECT ot.*, t.canonical_width, t.canonical_height, t.corner_points,
             t.question_blocks, t.roll_number_grid, t.option_count
      FROM omr_tests ot JOIN omr_templates t ON t.id = ot.template_id
      WHERE ot.id = $1
    `, [result.rows[0].test_id]);

    await runDetection(result.rows[0], testRes.rows[0]);

    const finalRes = await query('SELECT * FROM omr_submissions WHERE id = $1', [req.params.id]);
    res.json({ submission: finalRes.rows[0] });
  } catch (err) { next(err); }
};

/* Standard exam convention: blank = 0, wrong (including ambiguous/multiple-marked) = negative marking. */
function computeScore(answers, answerKey, totalQuestions, marksPerCorrect, negativeMarking) {
  let correct = 0, wrong = 0, blank = 0;
  for (let q = 1; q <= totalQuestions; q++) {
    const given = answers[String(q)];
    const key   = answerKey[String(q)];
    const givenLetter = given && typeof given === 'object' ? given.answer : given;
    if (!givenLetter) { blank++; continue; }
    if (givenLetter === key) correct++;
    else wrong++;
  }
  const score = Math.round((correct * marksPerCorrect - wrong * negativeMarking) * 100) / 100;
  return { correct, wrong, blank, score };
}

/* POST /api/omr-check/submissions/:id/finalize */
const finalizeSubmission = async (req, res, next) => {
  try {
    const subRes = await query(`
      SELECT os.*, ot.answer_key, ot.total_questions, ot.marks_per_correct, ot.negative_marking,
             ot.google_sheet_id, ot.google_sheet_tab, ot.id AS test_id_confirmed
      FROM omr_submissions os JOIN omr_tests ot ON ot.id = os.test_id
      WHERE os.id = $1
    `, [req.params.id]);
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found.' });
    const submission = subRes.rows[0];

    const answers = submission.corrected_answers || submission.detected_answers || {};
    const { correct, wrong, blank, score } = computeScore(
      answers, submission.answer_key, submission.total_questions,
      parseFloat(submission.marks_per_correct), parseFloat(submission.negative_marking)
    );

    let sheetRowNumber = submission.sheet_row_number;
    let sheetWarning = null;
    if (submission.google_sheet_id && sheetsConfigured()) {
      try {
        sheetRowNumber = await upsertResultRow(
          { id: submission.test_id, google_sheet_id: submission.google_sheet_id, google_sheet_tab: submission.google_sheet_tab },
          { ...submission, correct_count: correct, wrong_count: wrong, blank_count: blank, score }
        );
      } catch (sheetErr) {
        console.error('[omr-check] Google Sheets push failed:', sheetErr.message);
        sheetWarning = 'Score was saved, but pushing to Google Sheets failed: ' + sheetErr.message;
      }
    } else if (submission.google_sheet_id && !sheetsConfigured()) {
      sheetWarning = 'Score was saved, but Google Sheets is not configured on the server yet.';
    }

    const result = await query(
      `UPDATE omr_submissions
       SET status = 'finalized', correct_count = $1, wrong_count = $2, blank_count = $3, score = $4,
           sheet_row_number = $5, finalized_at = NOW(), finalized_by = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [correct, wrong, blank, score, sheetRowNumber, req.admin && req.admin.email, req.params.id]
    );

    res.json({ submission: result.rows[0], warning: sheetWarning });
  } catch (err) { next(err); }
};

const deleteSubmission = async (req, res, next) => {
  try {
    const current = await query('SELECT status, photo_url FROM omr_submissions WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Submission not found.' });
    if (current.rows[0].status === 'finalized') {
      return res.status(400).json({ error: 'Finalized submissions cannot be deleted - re-open for review to correct instead.' });
    }
    await query('DELETE FROM omr_submissions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Submission deleted.' });
  } catch (err) { next(err); }
};

module.exports = {
  listTemplates, getTemplate, createTemplate, uploadReferenceImage, saveCalibration, calibrationPreview, deleteTemplate,
  listTests, getTest, createTest, updateTest, archiveTest,
  uploadSubmission, listSubmissions, getSubmission, reviewSubmission, rerunDetection, finalizeSubmission, deleteSubmission,
  createSubmission,
};

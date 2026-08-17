/* ============================================================
   routes/programs.js  -  DB-driven programs
   PUBLIC:  GET /api/programs            (visible only, ordered)
   ADMIN:   GET /api/programs/admin/all
            POST /api/programs           (create)
            PUT  /api/programs/:id        (update)
            PATCH /api/programs/:id/visibility
            DELETE /api/programs/:id
   ============================================================ */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const AdmZip = require('adm-zip');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { handleUploadError } = require('../middleware/upload');

/* Shared by the workbook upload route and the schedule-asset upload route
   below - both are admin PDF uploads to R2. */
const scheduleAssetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ── PUBLIC: visible programs ────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT slug, title, short_name, category, exam, level, status, price, mrp,
              thumbnail_url, accent, icon_class, tags, short_desc, detail_url, sort_order,
              omr_enabled, total_tests, omr_categories
       FROM programs WHERE is_visible = TRUE
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ programs: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: all programs ─────────────────────────────────── */
router.get('/admin/all', protect, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM programs ORDER BY sort_order ASC, id ASC`);
    res.json({ programs: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: create ───────────────────────────────────────── */
router.post('/', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.slug || !b.title) return res.status(400).json({ error: 'slug and title are required.' });
    const result = await query(
      `INSERT INTO programs (slug, title, short_name, category, exam, level, status, price, mrp,
                             thumbnail_url, accent, icon_class, tags, short_desc, detail_url, is_visible, sort_order,
                             omr_enabled, total_tests, omr_categories, launch_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        b.slug.trim(), b.title.trim(), b.short_name || null, b.category || 'test-series', b.exam || null, b.level || null,
        b.status || 'enrolling', b.price || null, b.mrp || null, b.thumbnail_url || null,
        b.accent || null, b.icon_class || null, JSON.stringify(b.tags || []), b.short_desc || null,
        b.detail_url || ('/programs/' + b.slug.trim() + '/'),
        b.is_visible !== undefined ? b.is_visible : true,
        b.sort_order || 0,
        !!b.omr_enabled, b.total_tests || null,
        b.omr_categories ? JSON.stringify(b.omr_categories) : null,
        b.launch_config ? JSON.stringify(b.launch_config) : null,
      ]
    );
    res.status(201).json({ program: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A program with this slug already exists.' });
    next(err);
  }
});

/* ── ADMIN: update ───────────────────────────────────────── */
router.put('/:id', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await query(
      `UPDATE programs SET
         title = COALESCE($1,title), category = COALESCE($2,category),
         exam = COALESCE($3,exam), level = COALESCE($4,level),
         status = COALESCE($5,status), price = $6, mrp = $7,
         thumbnail_url = COALESCE($8,thumbnail_url), accent = COALESCE($9,accent),
         tags = COALESCE($10,tags), short_desc = COALESCE($11,short_desc),
         detail_url = COALESCE($12,detail_url),
         is_visible = COALESCE($13,is_visible), sort_order = COALESCE($14,sort_order),
         short_name = COALESCE($15,short_name), icon_class = COALESCE($16,icon_class),
         omr_enabled = COALESCE($17,omr_enabled), total_tests = $18,
         omr_categories = $19, launch_config = $20,
         updated_at = NOW()
       WHERE id = $21 RETURNING *`,
      [
        b.title || null, b.category || null, b.exam || null, b.level || null,
        b.status || null, (b.price === '' ? null : b.price), (b.mrp === '' ? null : b.mrp),
        b.thumbnail_url || null, b.accent || null,
        b.tags ? JSON.stringify(b.tags) : null, b.short_desc || null, b.detail_url || null,
        (b.is_visible !== undefined ? b.is_visible : null),
        (b.sort_order !== undefined ? b.sort_order : null),
        b.short_name || null, b.icon_class || null,
        (b.omr_enabled !== undefined ? !!b.omr_enabled : null),
        (b.total_tests === '' || b.total_tests === undefined ? null : b.total_tests),
        // Direct assignment (not COALESCE) - omr_categories/launch_config must be
        // clearable by submitting the program form with them unset/unchecked.
        (b.omr_categories && b.omr_categories.length) ? JSON.stringify(b.omr_categories) : null,
        b.launch_config ? JSON.stringify(b.launch_config) : null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Program not found.' });
    res.json({ program: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: toggle visibility ────────────────────────────── */
router.patch('/:id/visibility', protect, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE programs SET is_visible = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_visible`,
      [!!req.body.is_visible, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Program not found.' });
    res.json({ program: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: delete ───────────────────────────────────────── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM programs WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── ADMIN: upload the program-level workbook (one file, shared
   across every test in the program - not tied to a schedule row) ── */
router.post('/:id/workbook', protect, scheduleAssetUpload.single('file'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const existing = await query(`SELECT workbook_key FROM programs WHERE id = $1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Program not found.' });

    const key = `workbooks/${req.params.id}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: 'application/pdf',
    }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `UPDATE programs SET workbook_url = $1, workbook_key = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [publicUrl, key, req.params.id]
    );

    const oldKey = existing.rows[0].workbook_key;
    if (oldKey && oldKey !== key) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey })); }
      catch (err) { console.warn(`⚠️  Could not delete old R2 workbook "${oldKey}":`, err.message); }
    }

    res.json({ program: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── Test schedule (admin-uploaded, shown on the generic detail page) ──
   Registered before the /:slug catch-all below so /:slug/schedule always
   resolves here first. ── */

/* PUBLIC: schedule for a program, ordered for display */
router.get('/:slug/schedule', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, test_number, test_date, syllabus, questions, marks, duration_minutes, sort_order
       FROM program_schedule WHERE program_slug = $1
       ORDER BY sort_order ASC, test_number ASC`,
      [req.params.slug]
    );
    res.json({ schedule: result.rows });
  } catch (err) { next(err); }
});

/* ADMIN: same data, no visibility gate (schedule isn't tied to is_visible).
   Includes asset URLs/gating fields, unlike the public version above. */
router.get('/:slug/schedule/admin', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM program_schedule WHERE program_slug = $1
       ORDER BY sort_order ASC, test_number ASC`,
      [req.params.slug]
    );
    res.json({ schedule: result.rows });
  } catch (err) { next(err); }
});

/* ADMIN: add a single test row without touching the rest of the schedule -
   for quickly adding one test outside the bulk-paste workflow. Bulk-upload
   treats its rows array as the complete set (deletes anything missing), so
   it can't safely be reused for a single add.

   category scopes combo programs (RSSB Degree/Diploma, ESE Civil/General
   Studies) so both tracks can each have their own "Test 1" - null for an
   ordinary single-track program. */
router.post('/:slug/schedule', protect, async (req, res, next) => {
  try {
    const { test_number, test_date, syllabus, questions, marks, duration_minutes, category } = req.body;
    if (!test_number) return res.status(400).json({ error: 'test_number is required.' });
    const dup = await query(
      `SELECT id FROM program_schedule WHERE program_slug = $1 AND test_number = $2 AND category IS NOT DISTINCT FROM $3`,
      [req.params.slug, parseInt(test_number, 10), category || null]
    );
    if (dup.rows.length) return res.status(409).json({ error: 'A test with this number already exists in this track - edit it via bulk paste or delete it first.' });
    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM program_schedule WHERE program_slug = $1 AND category IS NOT DISTINCT FROM $2`, [req.params.slug, category || null]);
    const result = await query(
      `INSERT INTO program_schedule (program_slug, test_number, test_date, syllabus, questions, marks, duration_minutes, sort_order, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.slug, parseInt(test_number, 10), test_date || null, syllabus || null, questions ? parseInt(questions, 10) : null, marks ? parseInt(marks, 10) : null, duration_minutes ? parseInt(duration_minutes, 10) : null, maxSort.rows[0].m + 1, category || null]
    );
    res.status(201).json({ schedule: result.rows[0] });
  } catch (err) { next(err); }
});

/* ADMIN: edit a single test row in place - date/syllabus/questions/marks/
   duration/test_number, without touching any other row. Lets a one-field
   correction stay a one-row operation instead of needing a bulk re-paste
   (which previously meant re-typing the whole schedule, or - if you only
   pasted the one corrected row - silently deleting every other test in
   the track, since bulk paste used to treat its rows as the complete set). */
router.put('/schedule/:id', protect, async (req, res, next) => {
  try {
    const { test_number, test_date, syllabus, questions, marks, duration_minutes } = req.body;
    if (!test_number) return res.status(400).json({ error: 'test_number is required.' });

    const current = await query(`SELECT program_slug, category FROM program_schedule WHERE id = $1`, [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Test not found.' });
    const { program_slug, category } = current.rows[0];

    const dup = await query(
      `SELECT id FROM program_schedule WHERE program_slug = $1 AND test_number = $2 AND category IS NOT DISTINCT FROM $3 AND id != $4`,
      [program_slug, parseInt(test_number, 10), category, req.params.id]
    );
    if (dup.rows.length) return res.status(409).json({ error: 'Another test in this track already uses that test number.' });

    const result = await query(
      `UPDATE program_schedule SET test_number = $1, test_date = $2, syllabus = $3, questions = $4, marks = $5, duration_minutes = $6
       WHERE id = $7 RETURNING *`,
      [
        parseInt(test_number, 10), test_date || null, syllabus || null,
        questions ? parseInt(questions, 10) : null, marks ? parseInt(marks, 10) : null,
        duration_minutes ? parseInt(duration_minutes, 10) : null, req.params.id,
      ]
    );
    res.json({ schedule: result.rows[0] });
  } catch (err) { next(err); }
});

/* ADMIN: bulk upload - typically pasted in all at once from a spreadsheet.
   Upserts by (program_slug, category, test_number): a pasted row updates
   the matching test number if it already exists (keeping any uploaded
   assets/gating dates, which can't be re-supplied through the paste),
   or inserts it if new. Deliberately never deletes a row just because
   its test_number is missing from this particular paste - pasting a
   handful of corrected future tests must never wipe out the rest of an
   already-configured schedule. To actually remove a test, delete its
   row explicitly. */
router.post('/:slug/schedule/bulk', protect, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const category = req.body.category || null;
    if (!rows.length) return res.status(400).json({ error: 'rows array is required.' });
    for (const r of rows) {
      if (!r.test_number) return res.status(400).json({ error: 'Every row needs a test_number.' });
    }

    const existing = await query(
      `SELECT id, test_number FROM program_schedule WHERE program_slug = $1 AND category IS NOT DISTINCT FROM $2`,
      [req.params.slug, category]
    );
    const existingByNumber = new Map(existing.rows.map(r => [r.test_number, r.id]));

    // sort_order for genuinely new rows only - an existing row keeps its
    // current position rather than jumping to wherever it landed in this
    // particular paste, so pasting a handful of future tests to fix them
    // doesn't reshuffle the whole list's display order.
    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM program_schedule WHERE program_slug = $1 AND category IS NOT DISTINCT FROM $2`, [req.params.slug, category]);
    let nextSort = maxSort.rows[0].m + 1;

    for (const r of rows) {
      const testNumber = parseInt(r.test_number, 10);
      const values = [
        r.test_date || null,
        r.syllabus || null,
        r.questions ? parseInt(r.questions, 10) : null,
        r.marks ? parseInt(r.marks, 10) : null,
        r.duration_minutes ? parseInt(r.duration_minutes, 10) : null,
      ];

      if (existingByNumber.has(testNumber)) {
        await query(
          `UPDATE program_schedule SET test_date = $1, syllabus = $2, questions = $3, marks = $4, duration_minutes = $5
           WHERE id = $6`,
          [...values, existingByNumber.get(testNumber)]
        );
      } else {
        await query(
          `INSERT INTO program_schedule (program_slug, test_number, test_date, syllabus, questions, marks, duration_minutes, sort_order, category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.slug, testNumber, ...values, nextSort++, category]
        );
      }
    }

    res.json({ message: `Saved ${rows.length} schedule rows.` });
  } catch (err) { next(err); }
});

/* ADMIN: upload a test asset (question paper / blank OMR / solution) for
   one schedule row. Stored in R2 (not Cloudinary) since these are
   downloaded repeatedly by every enrolled learner - R2 has no egress
   fees, which matters at that read volume. Mirrors routes/free-resources.js. */
const SCHEDULE_ASSET_COLUMNS = {
  paper:       { url: 'question_paper_url', key: 'question_paper_key' },
  'blank-omr': { url: 'blank_omr_url',      key: 'blank_omr_key' },
  solution:    { url: 'solution_url',       key: 'solution_key' },
};
router.post('/schedule/:id/assets/:kind', protect, scheduleAssetUpload.single('file'), handleUploadError, async (req, res, next) => {
  try {
    const cols = SCHEDULE_ASSET_COLUMNS[req.params.kind];
    if (!cols) return res.status(400).json({ error: 'Unknown asset kind. Use paper, blank-omr, or solution.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const existing = await query(`SELECT ${cols.key} AS old_key FROM program_schedule WHERE id = $1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Schedule row not found.' });

    const key = `test-assets/${req.params.id}/${req.params.kind}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: 'application/pdf',
    }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `UPDATE program_schedule SET ${cols.url} = $1, ${cols.key} = $2 WHERE id = $3 RETURNING *`,
      [publicUrl, key, req.params.id]
    );

    const oldKey = existing.rows[0].old_key;
    if (oldKey && oldKey !== key) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey })); }
      catch (err) { console.warn(`⚠️  Could not delete old R2 asset "${oldKey}":`, err.message); }
    }

    res.json({ schedule: result.rows[0] });
  } catch (err) { next(err); }
});

/* ADMIN: set a schedule row's release/deadline dates and whether it needs
   a self-serve answer-sheet upload. No auto-grading - the deadline just
   opens/closes the upload window and gates when Solution unlocks. */
router.put('/schedule/:id/gating', protect, async (req, res, next) => {
  try {
    const { paper_release_at, omr_upload_deadline, requires_omr_upload } = req.body;
    if (requires_omr_upload && !omr_upload_deadline) {
      return res.status(400).json({ error: 'Upload deadline is required when self-serve upload is on - uploads must always be time-boxed.' });
    }
    const result = await query(
      `UPDATE program_schedule SET
         paper_release_at    = $1,
         omr_upload_deadline = $2,
         requires_omr_upload = $3
       WHERE id = $4 RETURNING *`,
      [paper_release_at || null, omr_upload_deadline || null, !!requires_omr_upload, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Schedule row not found.' });
    res.json({ schedule: result.rows[0] });
  } catch (err) { next(err); }
});

/* ADMIN: list learner answer-sheet uploads for one schedule row - there's
   no auto-grading, so this is how admin actually reviews submissions
   before computing ranks and posting them on WhatsApp. */
router.get('/schedule/:id/uploads', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, learner_name, learner_email, learner_phone, file_url, uploaded_at
       FROM schedule_uploads WHERE schedule_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.id]
    );
    res.json({ uploads: result.rows });
  } catch (err) { next(err); }
});

/* ADMIN: zip every learner's answer-sheet upload for one test into a
   single download, so admin doesn't have to open each submission one by
   one before computing ranks. */
router.get('/schedule/:id/uploads/download-all', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT su.learner_name, su.learner_email, su.file_key, sr.test_number
       FROM schedule_uploads su
       JOIN program_schedule sr ON sr.id = su.schedule_id
       WHERE su.schedule_id = $1 ORDER BY su.uploaded_at ASC`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No uploads for this test yet.' });

    /* Fetch all files into memory BEFORE sending any headers so errors
       can still be returned as JSON. */
    const files = [];
    for (const row of result.rows) {
      const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: row.file_key }));
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const ext = row.file_key.includes('.') ? row.file_key.slice(row.file_key.lastIndexOf('.')) : '';
      const testNo = row.test_number ? 'Test' + row.test_number + '_' : '';
      const email = (row.learner_email || '').replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 40);
      const namePart = (row.learner_name || 'learner').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'learner';
      files.push({ buf, base: testNo + namePart + (email ? '_' + email : ''), ext });
    }

    /* Deduplicate filenames */
    const usedNames = new Set();
    for (const f of files) {
      let name = f.base + f.ext, counter = 1;
      while (usedNames.has(name)) { counter++; name = f.base + '-' + counter + f.ext; }
      usedNames.add(name);
      f.finalName = name;
    }

    /* All buffers ready - build zip in memory and send */
    const zip = new AdmZip();
    for (const f of files) zip.addFile(f.finalName, f.buf);
    const zipBuf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="test-${req.params.id}-uploads.zip"`);
    res.setHeader('Content-Length', zipBuf.length);
    res.send(zipBuf);
  } catch (err) {
    console.error('[download-all] error:', err.name, '-', err.message);
    if (res.headersSent) return;
    res.status(500).json({ error: '[download-all] ' + err.message });
  }
});

/* ── Manual per-test results (2026-08-16) - replaces the fully-manual
   WhatsApp-only ranking process. Admin enters marks/correct/wrong/blank
   per learner (identified by roll number, the admin's natural
   reference point), a test at a time. published_at gates learner
   visibility - draft until explicitly published. ── */

/* ADMIN: list results for a test (for the admin UI's current-state view) */
router.get('/schedule/:id/results', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT tr.id, tr.roll_number, tr.total_marks, tr.correct_count, tr.wrong_count, tr.blank_count,
              tr.rank_position, tr.question_breakdown, tr.published_at, tr.entered_by,
              e.student_name
       FROM test_results tr
       JOIN enrollments e ON e.id = tr.enrollment_id
       WHERE tr.schedule_id = $1
       ORDER BY tr.rank_position ASC NULLS LAST, tr.total_marks DESC NULLS LAST`,
      [req.params.id]
    );
    res.json({ results: result.rows });
  } catch (err) { next(err); }
});

/* ADMIN: bulk upsert results for a test, keyed by roll_number - mirrors
   POST /:slug/schedule/bulk's "SELECT existing -> UPDATE or INSERT"
   pattern (not a DB-level ON CONFLICT) for the same reason: tolerates
   rows that don't cleanly resolve without failing the whole batch. */
router.post('/schedule/:id/results/bulk', protect, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'rows array is required.' });
    const publish = !!req.body.publish;
    const scheduleId = req.params.id;

    const skipped = [];
    let saved = 0;
    for (const row of rows) {
      const rollNumber = (row.roll_number || '').trim();
      if (!rollNumber) continue;
      // Combo (Degree+Diploma) enrollments store roll_number as a packed
      // "DEG-X|DIP-Y" pair, but the admit card only shows the learner one
      // bare half - an exact match alone would skip every combo result.
      const enrResult = await query(
        `SELECT id FROM enrollments WHERE roll_number = $1 OR roll_number LIKE $1 || '|%' OR roll_number LIKE '%|' || $1`,
        [rollNumber]
      );
      if (!enrResult.rows.length) { skipped.push(rollNumber); continue; }
      const enrollmentId = enrResult.rows[0].id;

      const values = [
        row.total_marks != null && row.total_marks !== '' ? Number(row.total_marks) : null,
        row.correct_count != null && row.correct_count !== '' ? parseInt(row.correct_count, 10) : null,
        row.wrong_count != null && row.wrong_count !== '' ? parseInt(row.wrong_count, 10) : null,
        row.blank_count != null && row.blank_count !== '' ? parseInt(row.blank_count, 10) : null,
        row.rank_position != null && row.rank_position !== '' ? parseInt(row.rank_position, 10) : null,
      ];

      const existing = await query(
        `SELECT id FROM test_results WHERE schedule_id = $1 AND enrollment_id = $2`,
        [scheduleId, enrollmentId]
      );
      if (existing.rows.length) {
        await query(
          `UPDATE test_results SET roll_number = $1, total_marks = $2, correct_count = $3, wrong_count = $4, blank_count = $5,
                  rank_position = $6, entered_by = $7, updated_at = NOW()
                  ${publish ? ', published_at = NOW()' : ''}
           WHERE id = $8`,
          [rollNumber, ...values, req.admin.email, existing.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO test_results (schedule_id, enrollment_id, roll_number, total_marks, correct_count, wrong_count, blank_count, rank_position, entered_by, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${publish ? 'NOW()' : 'NULL'})`,
          [scheduleId, enrollmentId, rollNumber, ...values, req.admin.email]
        );
      }
      saved++;
    }

    res.json({ message: `Saved ${saved} result(s)${skipped.length ? `, ${skipped.length} roll number(s) not found` : ''}.`, skipped });
  } catch (err) { next(err); }
});

/* ADMIN: publish/unpublish a single result row without touching the rest -
   for a one-off correction after a batch was already published. */
router.patch('/schedule/results/:resultId/publish', protect, async (req, res, next) => {
  try {
    const publish = !!req.body.publish;
    const result = await query(
      `UPDATE test_results SET published_at = ${publish ? 'NOW()' : 'NULL'} WHERE id = $1 RETURNING id`,
      [req.params.resultId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Result not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ADMIN: delete a single row (for touch-ups without re-uploading everything) */
router.delete('/:slug/schedule/:id', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM program_schedule WHERE id = $1 AND program_slug = $2`, [req.params.id, req.params.slug]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ADMIN: replace "Who Is This For" bullets + FAQ for a program. Kept as its
   own small endpoint (like /schedule/bulk) rather than folding into the
   already-long main program PUT body. */
router.put('/:slug/content', protect, async (req, res, next) => {
  try {
    const whoFor = Array.isArray(req.body.who_for) ? req.body.who_for.filter(Boolean) : [];
    const faqs   = Array.isArray(req.body.faqs) ? req.body.faqs.filter(f => f && f.question && f.answer) : [];
    const result = await query(
      `UPDATE programs SET who_for = $1, faqs = $2, updated_at = NOW() WHERE slug = $3 RETURNING slug, who_for, faqs`,
      [whoFor.length ? JSON.stringify(whoFor) : null, faqs.length ? JSON.stringify(faqs) : null, req.params.slug]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Program not found.' });
    res.json({ message: 'Saved.', program: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: शौर्य Batch DPPs / formula sheets - list/create/upload/delete.
   Registered before the /:slug catch-all below so /batch-materials always
   resolves here, not as a program lookup for slug="batch-materials".
   Not scoped to a program - see the batch_materials CREATE TABLE comment
   in server.js for why these are shared across all 6 शौर्य Batch options
   by content track instead. ── */
router.get('/batch-materials', protect, async (req, res, next) => {
  try {
    const { track } = req.query;
    const where = track ? `WHERE track = $1` : '';
    const result = await query(
      `SELECT id, track, kind, subject, title, file_url, sort_order FROM batch_materials
       ${where} ORDER BY track ASC, sort_order ASC, id ASC`,
      track ? [track] : []
    );
    res.json({ materials: result.rows });
  } catch (err) { next(err); }
});

router.post('/batch-materials', protect, async (req, res, next) => {
  try {
    const { track, kind, subject, title } = req.body;
    if (!track || !title) return res.status(400).json({ error: 'track and title are required.' });
    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM batch_materials WHERE track = $1`, [track]);
    const result = await query(
      `INSERT INTO batch_materials (track, kind, subject, title, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [track, kind || 'dpp', subject || null, title, maxSort.rows[0].m + 1]
    );
    res.status(201).json({ material: result.rows[0] });
  } catch (err) { next(err); }
});

router.post('/batch-materials/:id/upload', protect, scheduleAssetUpload.single('file'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const existing = await query(`SELECT file_key FROM batch_materials WHERE id = $1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Material not found.' });

    const key = `batch-materials/${req.params.id}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: 'application/pdf' }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `UPDATE batch_materials SET file_url = $1, file_key = $2 WHERE id = $3 RETURNING *`,
      [publicUrl, key, req.params.id]
    );

    const oldKey = existing.rows[0].file_key;
    if (oldKey && oldKey !== key) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey })); }
      catch (err) { console.warn(`⚠️  Could not delete old R2 material "${oldKey}":`, err.message); }
    }

    res.json({ material: result.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/batch-materials/:id', protect, async (req, res, next) => {
  try {
    const existing = await query(`DELETE FROM batch_materials WHERE id = $1 RETURNING file_key`, [req.params.id]);
    const oldKey = existing.rows[0] && existing.rows[0].file_key;
    if (oldKey) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey })); }
      catch (err) { console.warn(`⚠️  Could not delete R2 material "${oldKey}":`, err.message); }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUBLIC: single visible program by slug ──────────────────
   Registered last so it never shadows /admin/all or the numeric-id
   admin routes above. Used by frontend/programs/view/index.html - the
   generic detail page for any program that doesn't have its own
   hand-built static page. ── */
router.get('/:slug', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT slug, title, short_name, category, exam, level, status, price, mrp,
              thumbnail_url, accent, icon_class, tags, short_desc, detail_url, sort_order,
              omr_enabled, total_tests, omr_categories, launch_config, who_for, faqs
       FROM programs WHERE slug = $1 AND is_visible = TRUE`,
      [req.params.slug]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Program not found.' });

    // launch_config carries the Tally form URL, which must never be public
    // (it's how the post-payment webhook trusts a submission belongs to this
    // program). Only forward the two harmless display fields - mode and the
    // test centre's name - to the client, used to show a Mode/Location row
    // on the generic detail page.
    const row = result.rows[0];
    const lc = row.launch_config;
    delete row.launch_config;
    row.mode = lc ? lc.mode : null;
    row.centre_name = (lc && lc.centre) ? lc.centre.name : null;

    res.json({ program: row });
  } catch (err) { next(err); }
});

module.exports = router;

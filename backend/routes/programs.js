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
const archiver = require('archiver');
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
      `SELECT id, test_number, test_date, syllabus, questions, sort_order
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
    const { test_number, test_date, syllabus, questions, category } = req.body;
    if (!test_number) return res.status(400).json({ error: 'test_number is required.' });
    const dup = await query(
      `SELECT id FROM program_schedule WHERE program_slug = $1 AND test_number = $2 AND category IS NOT DISTINCT FROM $3`,
      [req.params.slug, parseInt(test_number, 10), category || null]
    );
    if (dup.rows.length) return res.status(409).json({ error: 'A test with this number already exists in this track - edit it via bulk paste or delete it first.' });
    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM program_schedule WHERE program_slug = $1 AND category IS NOT DISTINCT FROM $2`, [req.params.slug, category || null]);
    const result = await query(
      `INSERT INTO program_schedule (program_slug, test_number, test_date, syllabus, questions, sort_order, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.slug, parseInt(test_number, 10), test_date || null, syllabus || null, questions ? parseInt(questions, 10) : null, maxSort.rows[0].m + 1, category || null]
    );
    res.status(201).json({ schedule: result.rows[0] });
  } catch (err) { next(err); }
});

/* ADMIN: bulk upload - typically pasted in all at once from a spreadsheet.
   Upserts by (program_slug, category, test_number) instead of delete-and-
   reinsert: rows that already have uploaded assets/gating dates (paper
   URL, OMR deadline etc.) keep them when the admin re-pastes the same
   test number, since those can't be re-supplied through a bulk paste of
   number/date/syllabus/questions. Rows whose test_number is no longer
   present are removed - but only within the same category, so pasting
   one track's schedule never touches the other track's rows. */
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
    const keptNumbers = new Set();

    let i = 0;
    for (const r of rows) {
      const testNumber = parseInt(r.test_number, 10);
      keptNumbers.add(testNumber);
      const values = [r.test_date || null, r.syllabus || null, r.questions ? parseInt(r.questions, 10) : null, i++];

      if (existingByNumber.has(testNumber)) {
        await query(
          `UPDATE program_schedule SET test_date = $1, syllabus = $2, questions = $3, sort_order = $4
           WHERE id = $5`,
          [...values, existingByNumber.get(testNumber)]
        );
      } else {
        await query(
          `INSERT INTO program_schedule (program_slug, test_number, test_date, syllabus, questions, sort_order, category)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.slug, testNumber, ...values, category]
        );
      }
    }

    const toDelete = existing.rows.filter(r => !keptNumbers.has(r.test_number)).map(r => r.id);
    if (toDelete.length) {
      await query(`DELETE FROM program_schedule WHERE id = ANY($1::int[])`, [toDelete]);
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
   one before computing ranks. Streams straight from R2, no temp files. */
router.get('/schedule/:id/uploads/download-all', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT learner_name, file_key FROM schedule_uploads WHERE schedule_id = $1 ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No uploads for this test yet.' });

    res.attachment(`schedule-${req.params.id}-uploads.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => next(err));
    archive.pipe(res);

    const usedNames = new Set();
    for (const row of result.rows) {
      const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: row.file_key }));
      const ext = row.file_key.includes('.') ? row.file_key.slice(row.file_key.lastIndexOf('.')) : '';
      const base = (row.learner_name || 'learner').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'learner';
      let name = base + ext, counter = 1;
      while (usedNames.has(name)) { counter += 1; name = base + '-' + counter + ext; }
      usedNames.add(name);
      archive.append(obj.Body, { name });
    }
    await archive.finalize();
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

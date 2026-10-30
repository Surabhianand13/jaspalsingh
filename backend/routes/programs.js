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
const fs      = require('fs');
const os      = require('os');
const path    = require('path');
const archiver = require('archiver');
const { PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { handleUploadError } = require('../middleware/upload');

/* Disk storage - streams file to a temp directory instead of RAM.
   After upload to R2, the temp file is deleted.
   This keeps memory use flat regardless of file size. */
const scheduleAssetUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-')),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/* Stream a file from disk to R2 and clean up the temp file. */
async function streamFileToR2(localPath, key, contentType) {
  const stream = fs.createReadStream(localPath);
  // R2 rejects streamed bodies of unknown length - always send the size.
  const { size } = fs.statSync(localPath);
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: stream, ContentLength: size, ContentType: contentType }));
  try { fs.unlinkSync(localPath); } catch (_) {}
}

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

/* ── ADMIN: Test Day board (2026-10-25) ───────────────────
   One view across every program for the ops manager: which tests fall
   on a date range (e.g. this Sunday), whether the question paper /
   blank OMR / solution are uploaded and under what file name, and how
   many learners uploaded answer sheets. Optional exam filter (the
   programs.exam tag, e.g. "RSSB JE 2026"). test_date is free text, so
   rows are filtered in JS via utils/testDate.js. */
const { testDayKey } = require('../utils/testDate');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* "test-assets/12/paper-1729-RSSB-Test-5.pdf" -> "RSSB-Test-5.pdf" */
function assetFileName(key) {
  if (!key) return null;
  const base = key.slice(key.lastIndexOf('/') + 1);
  const m = base.match(/^(?:paper|blank-omr|solution)-\d{10,}-(.+)$/);
  return m ? m[1] : base;
}

async function testDayRows(from, to, exam) {
  const rows = (await query(
    `SELECT ps.id, ps.program_slug, ps.test_number, ps.test_date, ps.syllabus, ps.questions, ps.marks, ps.category,
            ps.question_paper_key, ps.blank_omr_key, ps.solution_key, ps.paper_release_at, ps.omr_upload_deadline, ps.requires_omr_upload,
            p.title AS program_title, p.short_name AS program_short_name, p.exam, p.is_visible,
            (SELECT COUNT(*)::int FROM schedule_uploads su WHERE su.schedule_id = ps.id) AS omr_uploads,
            (SELECT COUNT(*)::int FROM schedule_uploads su WHERE su.schedule_id = ps.id AND su.file_key IS NOT NULL) AS omr_files
     FROM program_schedule ps
     LEFT JOIN programs p ON p.slug = ps.program_slug`
  )).rows;
  return rows
    .map(r => Object.assign(r, { day: testDayKey(r) }))
    .filter(r => r.day && r.day >= from && r.day <= to && (!exam || r.exam === exam))
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.exam || '').localeCompare(String(b.exam || ''))
      || String(a.program_title || a.program_slug).localeCompare(String(b.program_title || b.program_slug))
      || String(a.category || '').localeCompare(String(b.category || '')) || a.test_number - b.test_number);
}

router.get('/admin/test-day', protect, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '') || to < from) return res.status(400).json({ error: 'Pick a valid date range.' });
    const exam = req.query.exam ? String(req.query.exam) : null;
    const tests = (await testDayRows(from, to, exam)).map(r => ({
      id: r.id, day: r.day, program_slug: r.program_slug, program_title: r.program_title || r.program_slug,
      program_short_name: r.program_short_name, exam: r.exam, is_visible: r.is_visible, category: r.category,
      test_number: r.test_number, test_date: r.test_date, syllabus: r.syllabus, questions: r.questions, marks: r.marks,
      paper_file: assetFileName(r.question_paper_key), blank_omr_file: assetFileName(r.blank_omr_key), solution_file: assetFileName(r.solution_key),
      paper_release_at: r.paper_release_at, omr_upload_deadline: r.omr_upload_deadline, requires_omr_upload: r.requires_omr_upload,
      omr_uploads: r.omr_uploads, omr_files: r.omr_files,
    }));
    const exams = (await query(`SELECT DISTINCT exam FROM programs WHERE exam IS NOT NULL AND exam <> '' ORDER BY exam`)).rows.map(x => x.exam);
    res.json({ tests, exams });
  } catch (err) { next(err); }
});

/* ADMIN: one zip with every learner answer sheet for all tests in the
   range (+ optional exam), one folder per test. Streams one file at a
   time like /schedule/:id/uploads/download-all, so memory stays flat. */
router.get('/admin/test-day/omr-zip', protect, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '') || to < from) return res.status(400).json({ error: 'Pick a valid date range.' });
    const exam = req.query.exam ? String(req.query.exam) : null;
    const tests = await testDayRows(from, to, exam);
    const byId = {};
    tests.forEach(t => { byId[t.id] = t; });
    const files = tests.length ? (await query(
      `SELECT su.schedule_id, su.learner_name, su.learner_email, su.file_key, e.roll_number
       FROM schedule_uploads su LEFT JOIN enrollments e ON e.id = su.enrollment_id
       WHERE su.schedule_id = ANY($1::int[]) AND su.file_key IS NOT NULL
       ORDER BY su.schedule_id, su.uploaded_at`,
      [tests.map(t => t.id)]
    )).rows : [];
    if (!files.length) return res.status(404).json({ error: 'No learner answer sheets for these tests (none uploaded yet, or erased after 14 days).' });

    const clean = (s, n) => String(s || '').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, n);
    const folderFor = t => clean(`${t.day} - ${t.exam || 'No exam'} - ${t.program_short_name || t.program_title || t.program_slug}${t.category ? ' (' + t.category + ')' : ''} - Test ${t.test_number}${t.syllabus ? ' - ' + t.syllabus : ''}`, 150);

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('warning', (err) => console.warn('[test-day zip] warning:', err.message));
    archive.on('error', (err) => { console.error('[test-day zip] archive error:', err.message); res.destroy(err); });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="omr-sheets-${from}${to !== from ? '_to_' + to : ''}${exam ? '-' + exam.replace(/[^a-zA-Z0-9]+/g, '-') : ''}.zip"`);
    archive.pipe(res);

    const used = new Set();
    for (const f of files) {
      const t = byId[f.schedule_id];
      const ext = f.file_key.includes('.') ? f.file_key.slice(f.file_key.lastIndexOf('.')) : '';
      const roll = clean(String(f.roll_number || '').split('|')[0], 30);
      const base = `${folderFor(t)}/${[roll, clean(f.learner_name || 'learner', 60)].filter(Boolean).join(' - ')}`;
      let name = base + ext, n = 1;
      while (used.has(name)) { n++; name = `${base} (${n})${ext}`; }
      used.add(name);
      const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: f.file_key }));
      archive.append(obj.Body, { name });
      await new Promise((resolve, reject) => {
        const onEntry = () => { archive.off('error', reject); resolve(); };
        archive.once('entry', onEntry);
        archive.once('error', reject);
      });
    }
    await archive.finalize();
  } catch (err) {
    console.error('[test-day zip] error:', err.name, '-', err.message);
    if (res.headersSent) { res.destroy(err); return; }
    res.status(500).json({ error: '[test-day zip] ' + err.message });
  }
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
    await streamFileToR2(req.file.path, key, 'application/pdf');
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
    await streamFileToR2(req.file.path, key, 'application/pdf');
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
      `SELECT id, learner_name, learner_email, learner_phone, file_url, uploaded_at, file_deleted_at
       FROM schedule_uploads WHERE schedule_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.id]
    );
    res.json({ uploads: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: erase learner OMR answer-sheet files older than 14 days ──
   Only learner uploads (schedule_uploads) - question papers, blank OMRs
   and solutions live on program_schedule and are never touched. The
   upload row is kept (learner still shows as "submitted", results are
   untouched); only the R2 file goes and file_url/file_key are cleared.
   GET previews the count, POST does it. Works in batches so memory stays
   flat however many files there are. (2026-10-24) */
const ANSWER_SHEET_KEEP_DAYS = 14;

router.get('/answer-sheets/cleanup', protect, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS count, MIN(uploaded_at) AS oldest
       FROM schedule_uploads
       WHERE file_key IS NOT NULL AND uploaded_at < NOW() - make_interval(days => $1)`,
      [ANSWER_SHEET_KEEP_DAYS]
    );
    res.json({ days: ANSWER_SHEET_KEEP_DAYS, count: r.rows[0].count, oldest: r.rows[0].oldest });
  } catch (err) { next(err); }
});

router.post('/answer-sheets/cleanup', protect, async (req, res, next) => {
  try {
    let erased = 0, failed = 0, lastId = 0;
    for (;;) {
      const batch = await query(
        `SELECT id, file_key FROM schedule_uploads
         WHERE file_key IS NOT NULL AND uploaded_at < NOW() - make_interval(days => $1) AND id > $2
         ORDER BY id LIMIT 500`,
        [ANSWER_SHEET_KEEP_DAYS, lastId]
      );
      if (!batch.rows.length) break;
      lastId = batch.rows[batch.rows.length - 1].id;

      const out = await r2.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.rows.map(r => ({ Key: r.file_key })), Quiet: true },
      }));
      const failedKeys = new Set((out.Errors || []).map(e => e.Key));
      const okIds = batch.rows.filter(r => !failedKeys.has(r.file_key)).map(r => r.id);
      failed += failedKeys.size;
      if (failedKeys.size) console.error('[answer-sheets/cleanup] R2 could not delete', failedKeys.size, 'file(s):', (out.Errors || [])[0]);
      if (okIds.length) {
        await query(
          `UPDATE schedule_uploads SET file_key = NULL, file_url = NULL, file_deleted_at = NOW() WHERE id = ANY($1::int[])`,
          [okIds]
        );
        erased += okIds.length;
      }
    }
    console.log(`[answer-sheets/cleanup] Erased ${erased} learner answer-sheet file(s) older than ${ANSWER_SHEET_KEEP_DAYS} days` + (failed ? `, ${failed} failed` : ''));
    res.json({ erased, failed, days: ANSWER_SHEET_KEEP_DAYS });
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
       WHERE su.schedule_id = $1 AND su.file_key IS NOT NULL ORDER BY su.uploaded_at ASC`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No answer-sheet files for this test (none uploaded yet, or erased after 14 days).' });

    /* Stream the zip: one answer sheet is pulled from R2 and written into
       the archive at a time, and the archive streams straight to the
       admin's browser. The old version held every file plus the finished
       zip in memory at once - for a test with many uploads that alone
       could exceed the 512 MB Render limit (2026-10-24 OOM). Headers go
       out before the first file, so a mid-stream R2 failure aborts the
       download (the browser shows it as failed) instead of returning JSON. */
    const usedNames = new Set();
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('warning', (err) => console.warn('[download-all] warning:', err.message));
    archive.on('error', (err) => { console.error('[download-all] archive error:', err.message); res.destroy(err); });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="test-${req.params.id}-uploads.zip"`);
    archive.pipe(res);

    for (const row of result.rows) {
      const ext = row.file_key.includes('.') ? row.file_key.slice(row.file_key.lastIndexOf('.')) : '';
      const testNo = row.test_number ? 'Test' + row.test_number + '_' : '';
      const email = (row.learner_email || '').replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 40);
      const namePart = (row.learner_name || 'learner').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'learner';
      const base = testNo + namePart + (email ? '_' + email : '');
      let name = base + ext, counter = 1;
      while (usedNames.has(name)) { counter++; name = base + '-' + counter + ext; }
      usedNames.add(name);

      const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: row.file_key }));
      archive.append(obj.Body, { name });
      // Wait for this entry to be fully written before fetching the next,
      // so only one file is ever in flight.
      await new Promise((resolve, reject) => {
        const onEntry = () => { archive.off('error', reject); resolve(); };
        archive.once('entry', onEntry);
        archive.once('error', reject);
      });
    }
    await archive.finalize();
  } catch (err) {
    console.error('[download-all] error:', err.name, '-', err.message);
    if (res.headersSent) { res.destroy(err); return; }
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
              tr.rank_position, tr.marks_text, tr.rank_text, tr.question_breakdown, tr.published_at, tr.entered_by,
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

    // Check every line before saving anything. Previously a bad value
    // (e.g. "AB" in the rank column) crashed mid-loop with a raw
    // "invalid input syntax for type integer: NaN" after the earlier
    // lines were already saved and published.
    // Marks and Rank may be text ("Absent", "AB") - stored as typed in
    // marks_text/rank_text, with the numeric column filled only when the
    // value is a number. Correct/Wrong/Blank (old 6-column paste) stay
    // whole numbers.
    const txt = v => (v == null ? '' : String(v).trim());
    const NUM_RE = /^-?\d+(\.\d+)?$/;
    const INT_RE = /^\d+$/;
    const problems = [];
    rows.forEach((row, i) => {
      const roll = (row.roll_number || '').trim();
      if (!roll) return;
      const where = `Line ${i + 1} (${roll})`;
      if (txt(row.total_marks).length > 40) problems.push(`${where}: marks is too long (max 40 characters)`);
      if (txt(row.rank_position).length > 40) problems.push(`${where}: rank is too long (max 40 characters)`);
      [['correct_count', 'Correct'], ['wrong_count', 'Wrong'], ['blank_count', 'Blank']].forEach(([k, label]) => {
        if (txt(row[k]) && !INT_RE.test(txt(row[k]))) problems.push(`${where}: ${label} "${row[k]}" must be a whole number`);
      });
    });
    if (problems.length) {
      return res.status(400).json({
        error: `Nothing saved - fix ${problems.length === 1 ? 'this line' : 'these lines'} and paste again: ` + problems.slice(0, 5).join('; ') + (problems.length > 5 ? `; and ${problems.length - 5} more` : ''),
        problems,
      });
    }

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

      const marks = txt(row.total_marks), rank = txt(row.rank_position);
      const values = [
        NUM_RE.test(marks) ? Number(marks) : null,
        txt(row.correct_count) ? parseInt(row.correct_count, 10) : null,
        txt(row.wrong_count) ? parseInt(row.wrong_count, 10) : null,
        txt(row.blank_count) ? parseInt(row.blank_count, 10) : null,
        INT_RE.test(rank) ? parseInt(rank, 10) : null,
        marks || null,
        rank || null,
      ];

      const existing = await query(
        `SELECT id FROM test_results WHERE schedule_id = $1 AND enrollment_id = $2`,
        [scheduleId, enrollmentId]
      );
      if (existing.rows.length) {
        await query(
          `UPDATE test_results SET roll_number = $1, total_marks = $2, correct_count = $3, wrong_count = $4, blank_count = $5,
                  rank_position = $6, marks_text = $7, rank_text = $8, entered_by = $9, updated_at = NOW()
                  ${publish ? ', published_at = NOW()' : ''}
           WHERE id = $10`,
          [rollNumber, ...values, req.admin.email, existing.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO test_results (schedule_id, enrollment_id, roll_number, total_marks, correct_count, wrong_count, blank_count, rank_position, marks_text, rank_text, entered_by, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${publish ? 'NOW()' : 'NULL'})`,
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
      `SELECT id, track, kind, subject, title, file_url, sort_order, bulk_group_id FROM batch_materials
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

/* Bulk-create: one row per track, all sharing the same bulk_group_id so a
   single upload propagates to every row in the group. */
router.post('/batch-materials/bulk', protect, async (req, res, next) => {
  try {
    const { tracks, kind, subject, title } = req.body;
    if (!Array.isArray(tracks) || !tracks.length || !title) {
      return res.status(400).json({ error: 'tracks (array) and title are required.' });
    }
    const { v4: uuidv4 } = require('crypto');
    const groupId = require('crypto').randomUUID();
    const kindVal = kind || 'dpp';
    const subjectVal = subject || null;
    const inserted = [];
    for (const track of tracks) {
      const maxSort = await query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM batch_materials WHERE track = $1`, [track]);
      const r = await query(
        `INSERT INTO batch_materials (track, kind, subject, title, sort_order, bulk_group_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [track, kindVal, subjectVal, title, maxSort.rows[0].m + 1, groupId]
      );
      inserted.push(r.rows[0]);
    }
    res.status(201).json({ materials: inserted, bulk_group_id: groupId });
  } catch (err) { next(err); }
});

/* Is this R2 key still used by any material row (bulk groups share one file)? */
async function materialKeyInUse(key) {
  const r = await query(`SELECT 1 FROM batch_materials WHERE file_key = $1 LIMIT 1`, [key]);
  return r.rows.length > 0;
}

router.post('/batch-materials/:id/upload', protect, scheduleAssetUpload.single('file'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const existing = await query(`SELECT file_key, bulk_group_id FROM batch_materials WHERE id = $1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Material not found.' });

    const key = `batch-materials/${req.params.id}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    await streamFileToR2(req.file.path, key, 'application/pdf');
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `UPDATE batch_materials SET file_url = $1, file_key = $2 WHERE id = $3 RETURNING *`,
      [publicUrl, key, req.params.id]
    );

    // Propagate to all other rows in the same bulk group - they share the
    // same R2 object. file_key too: the learner viewer reads the PDF by
    // key, so a row with only file_url shows "Material not found".
    const groupId = existing.rows[0].bulk_group_id;
    if (groupId) {
      await query(
        `UPDATE batch_materials SET file_url = $1, file_key = $2 WHERE bulk_group_id = $3 AND id != $4`,
        [publicUrl, key, groupId, req.params.id]
      );
    }

    const oldKey = existing.rows[0].file_key;
    if (oldKey && oldKey !== key && !(await materialKeyInUse(oldKey))) {
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
    // Rows of a bulk group share one R2 file - keep it while any remain.
    if (oldKey && !(await materialKeyInUse(oldKey))) {
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

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
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

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

/* ADMIN: same data, no visibility gate (schedule isn't tied to is_visible) */
router.get('/:slug/schedule/admin', protect, async (req, res, next) => {
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

/* ADMIN: bulk upload - replaces the entire schedule for this program with
   the uploaded rows. Simpler and safer than per-row upsert for something
   that's typically pasted in all at once from a spreadsheet. */
router.post('/:slug/schedule/bulk', protect, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'rows array is required.' });
    for (const r of rows) {
      if (!r.test_number) return res.status(400).json({ error: 'Every row needs a test_number.' });
    }

    await query(`DELETE FROM program_schedule WHERE program_slug = $1`, [req.params.slug]);
    let i = 0;
    for (const r of rows) {
      await query(
        `INSERT INTO program_schedule (program_slug, test_number, test_date, syllabus, questions, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.slug, parseInt(r.test_number, 10), r.test_date || null, r.syllabus || null, r.questions ? parseInt(r.questions, 10) : null, i++]
      );
    }
    res.json({ message: `Saved ${rows.length} schedule rows.` });
  } catch (err) { next(err); }
});

/* ADMIN: delete a single row (for touch-ups without re-uploading everything) */
router.delete('/:slug/schedule/:id', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM program_schedule WHERE id = $1 AND program_slug = $2`, [req.params.id, req.params.slug]);
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
              omr_enabled, total_tests, omr_categories
       FROM programs WHERE slug = $1 AND is_visible = TRUE`,
      [req.params.slug]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Program not found.' });
    res.json({ program: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;

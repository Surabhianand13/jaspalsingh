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
      `SELECT slug, title, category, exam, level, status, price, mrp,
              thumbnail_url, accent, tags, short_desc, detail_url, sort_order
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
      `INSERT INTO programs (slug, title, category, exam, level, status, price, mrp,
                             thumbnail_url, accent, tags, short_desc, detail_url, is_visible, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        b.slug.trim(), b.title.trim(), b.category || 'test-series', b.exam || null, b.level || null,
        b.status || 'enrolling', b.price || null, b.mrp || null, b.thumbnail_url || null,
        b.accent || null, JSON.stringify(b.tags || []), b.short_desc || null,
        b.detail_url || ('/programs/' + b.slug.trim() + '/'),
        b.is_visible !== undefined ? b.is_visible : true,
        b.sort_order || 0,
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
         updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [
        b.title || null, b.category || null, b.exam || null, b.level || null,
        b.status || null, (b.price === '' ? null : b.price), (b.mrp === '' ? null : b.mrp),
        b.thumbnail_url || null, b.accent || null,
        b.tags ? JSON.stringify(b.tags) : null, b.short_desc || null, b.detail_url || null,
        (b.is_visible !== undefined ? b.is_visible : null),
        (b.sort_order !== undefined ? b.sort_order : null),
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

module.exports = router;

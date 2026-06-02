/* ============================================================
   routes/banners.js  -  Banners / promotional images
   PUBLIC:  GET /api/banners?placement=home_carousel
   ADMIN:   GET /api/banners/admin/all
            POST /api/banners
            PUT  /api/banners/:id
            PATCH /api/banners/:id/visibility
            DELETE /api/banners/:id
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

/* ── PUBLIC: visible banners (optionally by placement) ───── */
router.get('/', async (req, res, next) => {
  try {
    const placement = req.query.placement;
    const params = [];
    let where = 'is_visible = TRUE';
    if (placement) { params.push(placement); where += ` AND placement = $${params.length}`; }
    const result = await query(
      `SELECT id, title, image_url, link_url, placement, sort_order
       FROM banners WHERE ${where} ORDER BY sort_order ASC, id ASC`, params);
    res.json({ banners: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: all ──────────────────────────────────────────── */
router.get('/admin/all', protect, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM banners ORDER BY placement, sort_order ASC, id ASC`);
    res.json({ banners: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: create ───────────────────────────────────────── */
router.post('/', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.image_url) return res.status(400).json({ error: 'image_url is required.' });
    const result = await query(
      `INSERT INTO banners (title, image_url, link_url, placement, is_visible, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.title || null, b.image_url, b.link_url || null,
       b.placement || 'home_carousel',
       b.is_visible !== undefined ? b.is_visible : true, b.sort_order || 0]
    );
    res.status(201).json({ banner: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: update ───────────────────────────────────────── */
router.put('/:id', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await query(
      `UPDATE banners SET
         title = COALESCE($1,title), image_url = COALESCE($2,image_url),
         link_url = $3, placement = COALESCE($4,placement),
         is_visible = COALESCE($5,is_visible), sort_order = COALESCE($6,sort_order)
       WHERE id = $7 RETURNING *`,
      [b.title || null, b.image_url || null, b.link_url || null,
       b.placement || null,
       (b.is_visible !== undefined ? b.is_visible : null),
       (b.sort_order !== undefined ? b.sort_order : null), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ banner: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: toggle visibility ────────────────────────────── */
router.patch('/:id/visibility', protect, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE banners SET is_visible = $1 WHERE id = $2 RETURNING id, is_visible`,
      [!!req.body.is_visible, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ banner: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: delete ───────────────────────────────────────── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM banners WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;

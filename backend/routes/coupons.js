/* ============================================================
   routes/coupons.js  -  Admin-managed coupon catalogue
   PUBLIC:  none (validation happens via /api/payment/validate-coupon)
   ADMIN:   GET    /api/coupons/admin/all
            POST   /api/coupons
            PUT    /api/coupons/:id
            PATCH  /api/coupons/:id/active
            DELETE /api/coupons/:id
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

/* ── ADMIN: list all coupons, with live redemption counts ── */
router.get('/admin/all', protect, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT c.*, COALESCE(r.used, 0)::int AS used_count
      FROM coupons c
      LEFT JOIN (
        SELECT coupon_code, COUNT(*) AS used
        FROM enrollments WHERE status = 'paid' AND coupon_code IS NOT NULL
        GROUP BY coupon_code
      ) r ON r.coupon_code = c.code
      ORDER BY c.created_at DESC
    `);
    res.json({ coupons: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: create ── */
router.post('/', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.code || !b.type) return res.status(400).json({ error: 'code and type are required.' });
    if (!['fixed_discount', 'flat_price', 'program_price_map'].includes(b.type)) {
      return res.status(400).json({ error: 'Invalid coupon type.' });
    }
    if (b.type === 'program_price_map' && (!b.program_prices || !Object.keys(b.program_prices).length)) {
      return res.status(400).json({ error: 'program_prices is required for this coupon type.' });
    }
    if (b.type !== 'program_price_map' && (b.discount_amount == null || b.discount_amount === '')) {
      return res.status(400).json({ error: 'discount_amount is required for this coupon type.' });
    }
    const result = await query(
      `INSERT INTO coupons (code, type, discount_amount, program_prices, program_slugs, max_uses, exclusive, is_active, label, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        b.code.trim().toUpperCase(), b.type,
        b.discount_amount === '' || b.discount_amount == null ? null : b.discount_amount,
        b.program_prices ? JSON.stringify(b.program_prices) : null,
        (b.program_slugs && b.program_slugs.length) ? JSON.stringify(b.program_slugs) : null,
        b.max_uses === '' || b.max_uses == null ? null : b.max_uses,
        !!b.exclusive,
        b.is_active !== undefined ? !!b.is_active : true,
        b.label || null,
        b.expires_at || null,
      ]
    );
    res.status(201).json({ coupon: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists.' });
    next(err);
  }
});

/* ── ADMIN: update ── */
router.put('/:id', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await query(
      `UPDATE coupons SET
         type            = COALESCE($1, type),
         discount_amount = $2,
         program_prices  = $3,
         program_slugs   = $4,
         max_uses        = $5,
         exclusive       = COALESCE($6, exclusive),
         is_active       = COALESCE($7, is_active),
         label           = COALESCE($8, label),
         expires_at      = $9,
         updated_at      = NOW()
       WHERE id = $10 RETURNING *`,
      [
        b.type || null,
        b.discount_amount === '' || b.discount_amount == null ? null : b.discount_amount,
        b.program_prices ? JSON.stringify(b.program_prices) : null,
        (b.program_slugs && b.program_slugs.length) ? JSON.stringify(b.program_slugs) : null,
        b.max_uses === '' || b.max_uses == null ? null : b.max_uses,
        (b.exclusive !== undefined ? !!b.exclusive : null),
        (b.is_active !== undefined ? !!b.is_active : null),
        b.label || null,
        b.expires_at || null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Coupon not found.' });
    res.json({ coupon: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: toggle active ── */
router.patch('/:id/active', protect, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE coupons SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
      [!!req.body.is_active, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Coupon not found.' });
    res.json({ coupon: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: delete ── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM coupons WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;

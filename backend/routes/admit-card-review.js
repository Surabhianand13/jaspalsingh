/* ============================================================
   routes/admit-card-review.js  -  Admin approval queue for admit
   cards submitted via the Tally webhook flows (routes/tally-*.js).

   Those flows generate the PDF and persist it to R2 as 'pending'
   instead of emailing it (see persistPendingAdmitCard in
   tally-webhook.js) - admin reviews the actual PDF here (name/photo/
   govt ID) and approves or rejects, individually or in bulk. Once
   approved, the learner can download the same PDF from their own
   profile (GET /api/enrollment/my-enrollments). Mirrors the existing
   Referral Payouts pattern (routes/payment.js's /admin/referral-credits).
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { programLabel } = require('./enrollment-account');

/* ── GET /api/admit-cards/admin?status=pending ── */
router.get('/admin', protect, async (req, res, next) => {
  try {
    const { status } = req.query;
    // A refund can land after a learner already submitted their Tally form -
    // exclude those rows so a refunded enrollment never lingers in (or gets
    // approved from) the review queue.
    const statusCond = status ? `admit_card_status = $1` : `admit_card_status != 'none'`;
    const where = `WHERE ${statusCond} AND status = 'paid' AND refund_status != 'initiated'`;
    const params = status ? [status] : [];
    const result = await query(
      `SELECT id, order_id, student_name, student_email, student_phone, program_slug, program_name,
              roll_number, admit_card_status, admit_card_pdf_url, admit_card_submitted_at,
              admit_card_reviewed_at, admit_card_reviewed_by, admit_card_rejection_reason
       FROM enrollments
       ${where}
       ORDER BY admit_card_submitted_at DESC NULLS LAST, id DESC`,
      params
    );
    result.rows.forEach(r => { r.program_label = programLabel(r.program_slug, r.program_name); });
    res.json({ cards: result.rows });
  } catch (err) { next(err); }
});

/* ── PATCH /api/admit-cards/admin/:id/approve ── */
router.patch('/admin/:id/approve', protect, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE enrollments SET admit_card_status = 'approved', admit_card_reviewed_at = NOW(), admit_card_reviewed_by = $1
       WHERE id = $2 AND admit_card_status = 'pending' AND status = 'paid' AND refund_status != 'initiated' RETURNING id`,
      [req.admin.email, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Card not found, not pending, or refunded.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── PATCH /api/admit-cards/admin/:id/reject ── body: { reason } */
router.patch('/admin/:id/reject', protect, async (req, res, next) => {
  try {
    const reason = (req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });
    const result = await query(
      `UPDATE enrollments SET admit_card_status = 'rejected', admit_card_rejection_reason = $1,
              admit_card_reviewed_at = NOW(), admit_card_reviewed_by = $2
       WHERE id = $3 AND admit_card_status = 'pending' RETURNING id`,
      [reason, req.admin.email, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Card not found or not pending.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── POST /api/admit-cards/admin/bulk-approve ── body: { ids: [1,2,3] } ── */
router.post('/admin/bulk-approve', protect, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids array is required.' });
    const result = await query(
      `UPDATE enrollments SET admit_card_status = 'approved', admit_card_reviewed_at = NOW(), admit_card_reviewed_by = $1
       WHERE id = ANY($2::int[]) AND admit_card_status = 'pending' AND status = 'paid' AND refund_status != 'initiated' RETURNING id`,
      [req.admin.email, ids]
    );
    res.json({ approved: result.rows.length });
  } catch (err) { next(err); }
});

module.exports = router;

/* ============================================================
   routes/enrollment-account.js
   Creates learner account after successful payment
   ============================================================ */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { query } = require('../config/db');

/* ── GET /api/enrollment/account-status ─────────────────────
   Tells the success page whether the buyer already has an account,
   so the UI can skip the password step.                          */
router.get('/account-status', async (req, res) => {
  try {
    const { form_token } = req.query;
    if (!form_token) return res.status(400).json({ error: 'Setup link is invalid.' });

    const enrR = await query(
      `SELECT student_email, student_phone, student_name, form_used FROM enrollments WHERE form_token = $1 AND status = 'paid'`,
      [form_token]
    );
    if (!enrR.rows.length) return res.status(404).json({ error: 'Setup link is invalid or has already been used.' });
    if (enrR.rows[0].form_used) return res.status(409).json({ error: 'This setup link has already been used.' });

    const enr = enrR.rows[0];
    const existing = await query(
      `SELECT id, name FROM learners WHERE email = $1 OR phone = $2`,
      [enr.student_email, enr.student_phone]
    );

    res.json({
      exists: existing.rows.length > 0,
      name: enr.student_name,
    });
  } catch (err) {
    console.error('[account-status]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/enrollment/create-account ────────────────────
   Handles both new accounts (password required) and existing
   accounts (password skipped). Saves profile details either way.
   Requires form_token (one-time-use 64-char hex from welcome email)
   to prevent account takeover via guessable order IDs.            */
router.post('/create-account', async (req, res) => {
  try {
    const { form_token, password, target_exam, city, college, dob } = req.body;

    if (!form_token) {
      return res.status(400).json({ error: 'Setup link is invalid. Please use the link from your welcome email.' });
    }

    // Fetch enrollment by form_token (not order_id) - prevents enumeration attacks
    const enrResult = await query(
      `SELECT * FROM enrollments WHERE form_token = $1 AND status = 'paid'`,
      [form_token]
    );
    if (!enrResult.rows.length) {
      return res.status(404).json({ error: 'Setup link is invalid or has already been used.' });
    }
    const enr = enrResult.rows[0];

    // Enforce one-time use
    if (enr.form_used) {
      return res.status(409).json({ error: 'This setup link has already been used. Contact support if you need help.' });
    }

    // Profile fields (optional, applied in both paths)
    const prof = {
      target_exam: target_exam || null,
      city:        city || null,
      college:     college || null,
      dob:         dob || null,
    };

    // Check if account already exists
    const existing = await query(
      `SELECT id, name, email FROM learners WHERE email = $1 OR phone = $2`,
      [enr.student_email, enr.student_phone]
    );

    let learner;

    if (existing.rows.length) {
      // ── Existing account: no password needed ──
      learner = existing.rows[0];
      await query(
        `UPDATE learners SET
            target_exam        = COALESCE($1, target_exam),
            city               = COALESCE($2, city),
            graduation_college = COALESCE($3, graduation_college),
            dob                = COALESCE($4, dob)
         WHERE id = $5`,
        [prof.target_exam, prof.city, prof.college, prof.dob, learner.id]
      );
    } else {
      // ── New account: password required ──
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      const hash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO learners (name, email, phone, password_hash, target_exam, city, graduation_college, dob, is_active)
         VALUES ($1, $2, $3, $4, COALESCE($5,'General'), $6, $7, $8, true)
         RETURNING id, name, email`,
        [enr.student_name, enr.student_email || '', enr.student_phone, hash,
         prof.target_exam, prof.city, prof.college, prof.dob]
      );
      learner = result.rows[0];
    }

    // Link ALL paid orders for this email/phone to the learner
    await query(
      `UPDATE enrollments SET learner_id = $1
       WHERE learner_id IS NULL AND (student_email = $2 OR student_phone = $3)`,
      [learner.id, enr.student_email, enr.student_phone]
    );

    // Mark this setup link as used (one-time-use enforcement)
    await query(
      `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW() WHERE id = $1`,
      [enr.id]
    );

    const token = jwt.sign(
      { id: learner.id, email: learner.email, name: learner.name, learner: true },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      existed: existing.rows.length > 0,
      learner: { id: learner.id, name: learner.name, email: learner.email },
      message: existing.rows.length ? 'Welcome back! Profile updated.' : 'Account created successfully.',
    });

  } catch (err) {
    console.error('[enrollment/create-account]', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ── GET /api/enrollment/my-enrollments ──────────────────── */
router.get('/my-enrollments', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorised.' });

    const jwt = require('jsonwebtoken');
    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch(e) { return res.status(401).json({ error: 'Invalid token.' }); }

    // Get the learner's email + phone so we can match purchases that
    // may not yet be linked via learner_id (repeat purchases, etc.)
    const lr = await query('SELECT id, email, phone FROM learners WHERE id = $1', [decoded.id]);
    const learner = lr.rows[0] || { id: decoded.id, email: decoded.email, phone: null };

    // Backfill: link any unlinked paid orders for this learner now
    await query(
      `UPDATE enrollments SET learner_id = $1
       WHERE learner_id IS NULL AND status = 'paid'
         AND (student_email = $2 OR student_phone = $3)`,
      [learner.id, learner.email, learner.phone]
    );

    const result = await query(
      `SELECT order_id, program_slug, program_name, amount, status, paid_at, coupon_code
       FROM enrollments
       WHERE status = 'paid'
         AND (learner_id = $1 OR student_email = $2 OR student_phone = $3)
       ORDER BY paid_at DESC`,
      [learner.id, learner.email, learner.phone]
    );

    res.json({ enrollments: result.rows });
  } catch (err) {
    console.error('[my-enrollments]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── ADMIN: all enrollments + revenue summary ────────────── */
const { protect } = require('../middleware/auth');
router.get('/admin/all', protect, async (req, res, next) => {
  try {
    const status = req.query.status; // optional filter: paid | pending
    const period = req.query.period; // optional: today | 3days | week | month
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = (!isNaN(rawLimit) && rawLimit > 0 && rawLimit <= 1000) ? rawLimit : null;
    const params = [];
    const conditions = [];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const periodMap = {
      today:  `paid_at >= CURRENT_DATE`,
      '3days': `paid_at >= NOW() - INTERVAL '3 days'`,
      week:   `paid_at >= DATE_TRUNC('week', NOW())`,
      month:  `paid_at >= DATE_TRUNC('month', NOW())`,
    };
    if (period && periodMap[period]) { conditions.push(periodMap[period]); }
    const where = conditions.length ? ('WHERE ' + conditions.join(' AND ')) : '';
    if (limit) { params.push(limit); }
    const limitClause = limit ? `LIMIT $${params.length}` : '';
    const rows = await query(
      `SELECT id, order_id, program_slug, program_name, amount, student_name,
              student_email, student_phone, status, coupon_code, paid_at, created_at,
              form_token IS NOT NULL AS has_form_token, form_used, form_used_at
       FROM enrollments ${where} ORDER BY created_at DESC ${limitClause}`, params);
    const summary = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='paid')::int    AS paid_count,
         COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status='paid'),0)::int AS revenue
       FROM enrollments`);
    res.json({ enrollments: rows.rows, total: rows.rowCount, summary: summary.rows[0] });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/reissue-form ─────────────────
   Admin only - resets form_token and resends welcome email
   so a genuine learner gets a second chance to fill the form  */
const crypto = require('crypto');
const { sendWelcomePaymentEmail } = require('../services/paymentEmailService');

router.post('/admin/reissue-form', protect, async (req, res, next) => {
  try {
    const { enrollment_id } = req.body;
    if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id required.' });

    const newToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `UPDATE enrollments
       SET form_token = $1, form_used = FALSE, form_used_at = NULL
       WHERE id = $2 AND status = 'paid'
       RETURNING *`,
      [newToken, enrollment_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Paid enrollment not found.' });
    }

    const enrollment = result.rows[0];
    await sendWelcomePaymentEmail(enrollment);

    res.json({ message: `New form link sent to ${enrollment.student_email}` });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/mark-submitted ───────────────
   Admin only - manually marks an enrollment as form submitted.
   Used when learner filled the form but webhook rejected it
   (e.g. form_token was NULL at submission time due to cold start).  */
router.post('/admin/mark-submitted', protect, async (req, res, next) => {
  try {
    const { enrollment_id } = req.body;
    if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id required.' });

    const result = await query(
      `UPDATE enrollments
       SET form_used = TRUE, form_used_at = NOW()
       WHERE id = $1 AND status = 'paid'
       RETURNING id, student_name, student_email`,
      [enrollment_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Paid enrollment not found.' });
    }

    res.json({ message: `Marked as submitted for ${result.rows[0].student_name}` });
  } catch (err) { next(err); }
});

module.exports = router;

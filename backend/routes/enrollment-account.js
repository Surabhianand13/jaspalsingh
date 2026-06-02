/* ============================================================
   routes/enrollment-account.js
   Creates learner account after successful payment
   ============================================================ */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { query } = require('../config/db');

/* ── POST /api/enrollment/create-account ────────────────── */
router.post('/create-account', async (req, res) => {
  try {
    const { order_id, password } = req.body;

    if (!order_id || !password) {
      return res.status(400).json({ error: 'order_id and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Fetch enrollment
    const enrResult = await query(
      `SELECT * FROM enrollments WHERE order_id = $1 AND status = 'paid'`,
      [order_id]
    );

    if (!enrResult.rows.length) {
      return res.status(404).json({ error: 'No completed enrollment found for this order.' });
    }

    const enr = enrResult.rows[0];

    // Check if account already exists
    const existing = await query(
      `SELECT id, name, email FROM learners WHERE email = $1 OR phone = $2`,
      [enr.student_email, enr.student_phone]
    );

    if (existing.rows.length) {
      // Account exists — link ALL their paid orders + return token
      const learner = existing.rows[0];
      await query(
        `UPDATE enrollments SET learner_id = $1
         WHERE learner_id IS NULL AND (student_email = $2 OR student_phone = $3)`,
        [learner.id, enr.student_email, enr.student_phone]
      );
      const token = jwt.sign(
        { id: learner.id, email: learner.email, name: learner.name, learner: true },
        process.env.JWT_SECRET, { expiresIn: '30d' }
      );
      return res.json({
        success: true, token,
        learner: { id: learner.id, name: learner.name, email: learner.email },
        message: 'Account already exists. Logged in.'
      });
    }

    // Create account
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO learners (name, email, phone, password_hash, target_exam, is_active)
       VALUES ($1, $2, $3, $4, 'General', true)
       RETURNING id, name, email`,
      [enr.student_name, enr.student_email || '', enr.student_phone, hash]
    );

    const learner = result.rows[0];

    // Link ALL paid orders for this email/phone to the new learner
    await query(
      `UPDATE enrollments SET learner_id = $1
       WHERE learner_id IS NULL AND (student_email = $2 OR student_phone = $3)`,
      [learner.id, enr.student_email, enr.student_phone]
    );

    const token = jwt.sign(
      { id: learner.id, email: learner.email, name: learner.name, learner: true },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      learner: { id: learner.id, name: learner.name, email: learner.email },
      message: 'Account created successfully.',
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

module.exports = router;

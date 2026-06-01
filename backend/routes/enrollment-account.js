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
      `SELECT id FROM learners WHERE email = $1 OR phone = $2`,
      [enr.student_email, enr.student_phone]
    );

    if (existing.rows.length) {
      // Account exists — just return a token
      const learner = existing.rows[0];
      const token = jwt.sign({ id: learner.id, role: 'learner' }, process.env.JWT_SECRET, { expiresIn: '30d' });
      return res.json({ success: true, token, message: 'Account already exists. Logged in.' });
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

    // Link enrollment to learner
    await query(
      `UPDATE enrollments SET learner_id = $1 WHERE order_id = $2`,
      [learner.id, order_id]
    );

    const token = jwt.sign({ id: learner.id, role: 'learner' }, process.env.JWT_SECRET, { expiresIn: '30d' });

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

module.exports = router;

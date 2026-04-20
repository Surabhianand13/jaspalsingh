/* ============================================================
   controllers/authController.js — Admin Authentication
   ============================================================ */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');

/* POST /api/auth/login
   Body: { email, password }
   Returns: { token, admin: { id, email } }
*/
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Look up admin user
    const result = await query(
      'SELECT id, email, password_hash FROM admin_users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // Generic message — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const admin = result.rows[0];

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Issue JWT
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email },
    });

  } catch (err) {
    next(err);
  }
};

/* GET /api/auth/me — verify token and return current admin */
const getMe = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, created_at FROM admin_users WHERE id = $1',
      [req.admin.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    res.json({ admin: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, getMe };

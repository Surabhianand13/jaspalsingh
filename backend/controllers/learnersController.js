/* ============================================================
   controllers/learnersController.js — Learner Auth & Profile
   Dr. Jaspal Singh Website — jaspalsingh.in

   PUBLIC:
     POST /api/learners/register
     POST /api/learners/login

   LEARNER PROTECTED:
     GET  /api/learners/me
     PUT  /api/learners/me
     GET  /api/learners/downloads

   ADMIN PROTECTED:
     GET  /api/learners            — all learners
     GET  /api/learners/stats      — aggregate stats
   ============================================================ */

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');
const { sendWelcomeEmail, sendNewLearnerAlert } = require('../services/emailService');

const SALT_ROUNDS = 12;
const TOKEN_TTL   = '30d'; // Learners stay logged in for 30 days

function signToken(learner) {
  return jwt.sign(
    { id: learner.id, email: learner.email, name: learner.name, learner: true },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/* ── POST /api/learners/register ────────────────────────────── */
const register = async (req, res, next) => {
  try {
    const { name, email, password, target_exam, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    // Check existing
    const existing = await query('SELECT id FROM learners WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO learners (name, email, password_hash, target_exam, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, target_exam, created_at`,
      [name.trim(), email.toLowerCase().trim(), password_hash, target_exam || 'General', phone || null]
    );

    const learner = result.rows[0];
    const token   = signToken(learner);

    res.status(201).json({
      message: 'Account created successfully. Welcome!',
      token,
      learner: { id: learner.id, name: learner.name, email: learner.email, target_exam: learner.target_exam },
    });

    /* Fire-and-forget emails — failures must never break the API response */
    sendWelcomeEmail(learner).catch(() => {});
    sendNewLearnerAlert(learner).catch(() => {});
  } catch (err) {
    next(err);
  }
};

/* ── POST /api/learners/login ───────────────────────────────── */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, target_exam, is_active FROM learners WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const learner = result.rows[0];
    if (!learner.is_active) {
      return res.status(403).json({ error: 'Account is inactive. Contact support.' });
    }

    const match = await bcrypt.compare(password, learner.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Update last_login
    await query('UPDATE learners SET last_login = NOW() WHERE id = $1', [learner.id]);

    const token = signToken(learner);
    res.json({
      message: 'Login successful.',
      token,
      learner: { id: learner.id, name: learner.name, email: learner.email, target_exam: learner.target_exam },
    });
  } catch (err) {
    next(err);
  }
};

/* ── GET /api/learners/me ───────────────────────────────────── */
const getMe = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, target_exam, phone, dob, gender, graduation_college,
              notify_strategy, created_at, last_login
       FROM learners WHERE id = $1`,
      [req.learner.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Learner not found.' });
    res.json({ learner: result.rows[0] });
  } catch (err) { next(err); }
};

/* ── PUT /api/learners/me ───────────────────────────────────── */
const updateMe = async (req, res, next) => {
  try {
    const { name, target_exam, phone, dob, gender, graduation_college, notify_strategy } = req.body;
    const result = await query(
      `UPDATE learners
       SET name               = COALESCE($1, name),
           target_exam        = COALESCE($2, target_exam),
           phone              = COALESCE($3, phone),
           dob                = COALESCE($4, dob),
           gender             = COALESCE($5, gender),
           graduation_college = COALESCE($6, graduation_college),
           notify_strategy    = COALESCE($7, notify_strategy)
       WHERE id = $8
       RETURNING id, name, email, target_exam, phone, dob, gender, graduation_college, notify_strategy`,
      [
        name               || null,
        target_exam        || null,
        phone              || null,
        dob                || null,
        gender             || null,
        graduation_college || null,
        notify_strategy !== undefined ? notify_strategy : null,
        req.learner.id,
      ]
    );
    res.json({ message: 'Profile updated.', learner: result.rows[0] });
  } catch (err) { next(err); }
};

/* ── GET /api/learners/downloads ────────────────────────────── */
const getMyDownloads = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ld.downloaded_at, r.id, r.title, r.subject, r.resource_type, r.file_url
       FROM learner_downloads ld
       JOIN resources r ON r.id = ld.resource_id
       WHERE ld.learner_id = $1
       ORDER BY ld.downloaded_at DESC`,
      [req.learner.id]
    );
    res.json({ downloads: result.rows, total: result.rowCount });
  } catch (err) { next(err); }
};

/* ── GET /api/learners — ADMIN ──────────────────────────────── */
const adminGetAll = async (req, res, next) => {
  try {
    const { search, exam, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (search) {
      params.push('%' + search + '%');
      conditions.push(`(l.name ILIKE $${params.length} OR l.email ILIKE $${params.length})`);
    }
    if (exam && exam !== 'all') {
      params.push(exam);
      conditions.push(`l.target_exam = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    params.push(limit, offset);
    const result = await query(
      `SELECT l.id, l.name, l.email, l.target_exam, l.phone,
              l.notify_strategy, l.is_active, l.created_at, l.last_login,
              COUNT(ld.id)::int AS download_count
       FROM learners l
       LEFT JOIN learner_downloads ld ON ld.learner_id = l.id
       ${where}
       GROUP BY l.id
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await query(
      `SELECT COUNT(*) FROM learners l ${where}`,
      params.slice(0, -2)
    );

    res.json({ learners: result.rows, total: parseInt(total.rows[0].count, 10) });
  } catch (err) { next(err); }
};

/* ── GET /api/learners/stats — ADMIN ───────────────────────── */
const adminStats = async (req, res, next) => {
  try {
    const [totalR, last7R, examR] = await Promise.all([
      query('SELECT COUNT(*) FROM learners'),
      query("SELECT COUNT(*) FROM learners WHERE created_at > NOW() - INTERVAL '7 days'"),
      query('SELECT target_exam, COUNT(*)::int AS count FROM learners GROUP BY target_exam ORDER BY count DESC'),
    ]);
    res.json({
      total:    parseInt(totalR.rows[0].count, 10),
      last_7d:  parseInt(last7R.rows[0].count, 10),
      by_exam:  examR.rows,
    });
  } catch (err) { next(err); }
};

module.exports = { register, login, getMe, updateMe, getMyDownloads, adminGetAll, adminStats };

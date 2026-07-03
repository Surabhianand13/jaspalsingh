/* ============================================================
   controllers/learnersController.js  -  Learner Auth & Profile
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   PUBLIC:
     POST /api/learners/register
     POST /api/learners/login

   LEARNER PROTECTED:
     GET  /api/learners/me
     PUT  /api/learners/me
     GET  /api/learners/downloads

   ADMIN PROTECTED:
     GET  /api/learners             -  all learners
     GET  /api/learners/stats       -  aggregate stats
   ============================================================ */

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');
const { sendWelcomeEmail, sendNewLearnerAlert, sendOtpEmail } = require('../services/emailService');

const SALT_ROUNDS = 12;
const TOKEN_TTL   = '30d'; // Learners stay logged in for 30 days

function signToken(learner) {
  return jwt.sign(
    { id: learner.id, email: learner.email, name: learner.name, learner: true },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/* ── POST /api/learners/send-otp ────────────────────────────── */
const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    const norm = email.toLowerCase().trim();

    const existing = await query('SELECT id FROM learners WHERE email = $1', [norm]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await query(
      `INSERT INTO email_otps (email, otp, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = NOW() + INTERVAL '10 minutes', used = FALSE`,
      [norm, otp]
    );

    await sendOtpEmail(norm, otp);

    res.json({ message: 'OTP sent. Please check your email.' });
  } catch (err) {
    next(err);
  }
};

/* ── POST /api/learners/register ────────────────────────────── */
const register = async (req, res, next) => {
  try {
    const { name, email, password, target_exam, phone, otp } = req.body;

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

    const norm = email.toLowerCase().trim();

    // OTP is required for profile signup. Checkout flow skips OTP because
    // Cashfree payment itself verifies the user and account setup happens
    // post-payment via the create-account endpoint.
    const { checkout_flow } = req.body;
    if (!checkout_flow) {
      if (!otp) {
        return res.status(400).json({ error: 'Email verification code is required.' });
      }
      const otpRow = await query(
        `SELECT otp, expires_at, used FROM email_otps WHERE email = $1`, [norm]
      );
      if (!otpRow.rows.length || otpRow.rows[0].used || new Date() > new Date(otpRow.rows[0].expires_at)) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      }
      if (otpRow.rows[0].otp !== otp.trim()) {
        return res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
      }
      await query(`UPDATE email_otps SET used = TRUE WHERE email = $1`, [norm]);
    }

    const existing = await query('SELECT id FROM learners WHERE email = $1', [norm]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    if (phone) {
      const normPhone = phone.replace(/\D/g, '').slice(-10);
      const phoneExists = await query('SELECT id FROM learners WHERE phone = $1', [normPhone]);
      if (phoneExists.rows.length) {
        return res.status(409).json({ error: 'An account with this mobile number already exists. Please log in instead.' });
      }
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO learners (name, email, password_hash, target_exam, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, target_exam, created_at`,
      [name.trim(), norm, password_hash, target_exam || 'General', phone || null]
    );

    const learner = result.rows[0];
    const token   = signToken(learner);

    res.status(201).json({
      message: 'Account created successfully. Welcome!',
      token,
      learner: { id: learner.id, name: learner.name, email: learner.email, target_exam: learner.target_exam },
    });

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
              notify_strategy, city, photo_url, created_at, last_login
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
    const { name, target_exam, phone, dob, gender, graduation_college, notify_strategy, city, photo_url } = req.body;

    if (photo_url !== undefined && photo_url !== null && photo_url !== '') {
      try {
        const u = new URL(photo_url);
        if (u.protocol !== 'https:') throw new Error();
      } catch {
        return res.status(400).json({ error: 'photo_url must be a valid https:// URL.' });
      }
    }
    const result = await query(
      `UPDATE learners
       SET name               = COALESCE($1, name),
           target_exam        = COALESCE($2, target_exam),
           phone              = COALESCE($3, phone),
           dob                = COALESCE($4, dob),
           gender             = COALESCE($5, gender),
           graduation_college = COALESCE($6, graduation_college),
           notify_strategy    = COALESCE($7, notify_strategy),
           city               = COALESCE($8, city),
           photo_url          = COALESCE($9, photo_url)
       WHERE id = $10
       RETURNING id, name, email, target_exam, phone, dob, gender, graduation_college, notify_strategy, city, photo_url`,
      [
        name               || null,
        target_exam        || null,
        phone              || null,
        dob                || null,
        gender             || null,
        graduation_college || null,
        notify_strategy !== undefined ? notify_strategy : null,
        city               || null,
        photo_url          || null,
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

/* ── GET /api/learners  -  ADMIN ──────────────────────────────── */
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
              COUNT(DISTINCT ld.id)::int AS download_count,
              MAX(e.program_name) AS paid_program,
              MAX(e.program_slug) AS paid_slug,
              COUNT(DISTINCT e.id)::int AS paid_count
       FROM learners l
       LEFT JOIN learner_downloads ld ON ld.learner_id = l.id
       LEFT JOIN enrollments e ON e.status = 'paid'
         AND (e.learner_id = l.id OR e.student_email = l.email OR e.student_phone = l.phone)
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

/* ── PATCH /api/learners/:id/email  -  ADMIN ─────────────────────
   Corrects a learner's login email (e.g. typo at signup). Also
   updates enrollments.student_email so past paid records stay
   consistent, since that column is a separate copy, not FK-synced. ── */
const adminUpdateEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    const norm = email.toLowerCase().trim();

    const existing = await query('SELECT id FROM learners WHERE email = $1 AND id != $2', [norm, id]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Another account already uses this email address.' });
    }

    const current = await query('SELECT email FROM learners WHERE id = $1', [id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Learner not found.' });
    const oldEmail = current.rows[0].email;

    const result = await query(
      `UPDATE learners SET email = $1 WHERE id = $2 RETURNING id, name, email`,
      [norm, id]
    );

    // Many enrollment rows predate learner_id linking, so also match by the
    // old email - otherwise a corrected address never reaches enrollments
    // created without a learner_id (e.g. form-link resends keep the typo).
    await query(
      `UPDATE enrollments SET student_email = $1 WHERE learner_id = $2 OR LOWER(student_email) = LOWER($3)`,
      [norm, id, oldEmail]
    );

    res.json({ message: 'Email updated.', learner: result.rows[0] });
  } catch (err) { next(err); }
};

/* ── GET /api/learners/stats  -  ADMIN ───────────────────────── */
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

/* ── POST /api/learners/forgot-password ─────────────────────── */
const crypto = require('crypto');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const result = await query('SELECT id, name FROM learners WHERE email = $1', [email.toLowerCase().trim()]);
    // Always return success to prevent email enumeration
    if (!result.rows.length) return res.json({ message: 'If that email is registered, a reset link has been sent.' });

    const learner = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `UPDATE learners SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [token, expires, learner.id]
    );

    const resetUrl = `https://www.jaspalsingh.in/reset-password/?token=${token}`;
    const firstName = (learner.name || 'there').split(' ')[0];

    await resendSend({
      from: 'Dr. Jaspal Singh <team@jaspalsingh.in>',
      to: email,
      subject: 'Reset your password - jaspalsingh.in',
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">Hi ${firstName},</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">We received a request to reset your password. Click the button below to set a new one. This link expires in 1 hour.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}" style="display:inline-block;background:#C81240;color:#fff;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:700;text-decoration:none;">Reset My Password</a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? WhatsApp us at +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    }, PRIORITY.OTP);

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) { next(err); }
};

/* ── POST /api/learners/reset-password ──────────────────────── */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const result = await query(
      `SELECT id FROM learners WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await query(
      `UPDATE learners SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [password_hash, result.rows[0].id]
    );

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) { next(err); }
};

module.exports = { sendOtp, register, login, getMe, updateMe, getMyDownloads, adminGetAll, adminUpdateEmail, adminStats, forgotPassword, resetPassword };

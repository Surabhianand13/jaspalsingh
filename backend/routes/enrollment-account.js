/* ============================================================
   routes/enrollment-account.js
   Creates learner account after successful payment
   ============================================================ */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { query } = require('../config/db');
const { protectLearner } = require('../middleware/learnerAuth');
const { canonicalize } = require('../utils/programSlugAliases');

/* ── Program slug → clean display label (admin UI only) ──
   The stored program_name text is identical for Offline Degree and
   Offline Diploma orders (only price differs), so the admin panel
   can't tell them apart. This maps by slug instead. */
const PROGRAM_LABELS = {
  'rssb-jen-diploma-test-series':      'Offline Diploma',
  'rssb-jen-degree-test-series':       'Offline Degree',
  'rssb-je-omr-degree-test-series':    'OMR Degree',
  'rssb-jen-omr-diploma-test-series':  'OMR Diploma',
  'rssb-je-jaspalsirki-testseries-degree-diploma-combo':     'Combo Offline',
  'rssb-je-jaspalsirki-testseries-degree-diploma-combo-omr': 'Combo OMR',
  'rpsc-ae-interview':                 'RPSC AE Interview Guidance',
  'ese-2027-prelims-jaspalsirki-testseries-paper1':              'ESE Paper 1',
  'ese-2027-prelims-jaspalsirki-testseries-paper2-civil':        'ESE Paper 2 (Civil)',
  'ese-2027-prelims-jaspalsirki-testseries-combined':            'ESE Combined',
  'ese-2027-prelims-jaspalsirki-testseries-paper1-omr':          'ESE Paper 1 OMR',
  'ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr':    'ESE Paper 2 (Civil) OMR',
  'ese-2027-prelims-jaspalsirki-testseries-combined-omr':        'ESE Combined OMR',
};
function programLabel(slug, fallbackName) {
  return PROGRAM_LABELS[slug] || fallbackName || slug || 'Unknown Program';
}

/* ── GET /api/enrollment/account-status ─────────────────────
   Tells the success page whether the buyer already has an account,
   so the UI can skip the password step.
   Requires form_token (private, unguessable 64-char hex) rather than
   order_id - order_id is predictable (JSP-<slug>-<timestamp>) and
   would let account existence + buyer name be enumerated. ── */
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
router.get('/my-enrollments', protectLearner, async (req, res) => {
  try {
    const decoded = req.learner;

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
         AND refund_status != 'initiated'
         AND (learner_id = $1 OR student_email = $2 OR student_phone = $3)
       ORDER BY paid_at DESC`,
      [learner.id, learner.email, learner.phone]
    );

    // Some rows are keyed to a legacy checkout slug that predates the
    // current programs/program_schedule slug convention - canonical_slug
    // is what every new link (Schedule, View Program) should be built
    // from, so the frontend never has to special-case old enrollments.
    const enrollments = result.rows.map(row => ({ ...row, canonical_slug: canonicalize(row.program_slug) }));

    res.json({ enrollments });
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
              form_token IS NOT NULL AS has_form_token, form_used, form_used_at, welcome_sent,
              refund_status, refund_reason, refund_amount, refund_initiated_at, refunded_by
       FROM enrollments ${where} ORDER BY created_at DESC ${limitClause}`, params);
    rows.rows.forEach(r => { r.program_label = programLabel(r.program_slug, r.program_name); });
    const summary = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='paid')::int    AS paid_count,
         COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status='paid' AND refund_status != 'initiated'),0)::int AS revenue,
         COUNT(*) FILTER (WHERE status='paid' AND refund_status='initiated')::int AS refunded_count,
         COALESCE(SUM(refund_amount) FILTER (WHERE refund_status='initiated'),0)::int AS refunded_amount
       FROM enrollments`);
    res.json({ enrollments: rows.rows, total: rows.rowCount, summary: summary.rows[0] });
  } catch (err) { next(err); }
});

/* ── ADMIN: paid learners across all programs ────────────────
   Dedicated view of successful purchases only - name, contact,
   program, purchase date, referral/coupon usage, refund status.
   Always a live query against enrollments (no separate table). */
router.get('/admin/paid-learners', protect, async (req, res, next) => {
  try {
    const { program, search } = req.query;
    const params = [];
    const conditions = [`status = 'paid'`];
    if (program) { params.push(program); conditions.push(`program_slug = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(student_name ILIKE $${params.length} OR student_email ILIKE $${params.length} OR student_phone ILIKE $${params.length})`);
    }
    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = await query(
      `SELECT id, order_id, program_slug, program_name, amount, student_name, student_email,
              student_phone, coupon_code, referred_by, cf_payment_id, paid_at,
              refund_status, refund_reason, refund_amount, refund_initiated_at, refunded_by
       FROM enrollments ${where} ORDER BY paid_at DESC`, params);
    rows.rows.forEach(r => { r.program_label = programLabel(r.program_slug, r.program_name); });

    const overall = await query(
      `SELECT
         COUNT(*)::int AS total_paid,
         COALESCE(SUM(amount) FILTER (WHERE refund_status != 'initiated'),0)::int AS net_revenue,
         COUNT(*) FILTER (WHERE refund_status = 'initiated')::int AS refunded_count
       FROM enrollments WHERE status = 'paid'`);

    const byProgramRes = await query(
      `SELECT program_slug, COUNT(*)::int AS count
       FROM enrollments WHERE status = 'paid' GROUP BY program_slug ORDER BY count DESC`);
    const byProgram = byProgramRes.rows.map(r => ({
      program_slug: r.program_slug,
      program_label: programLabel(r.program_slug, null),
      count: r.count,
    }));

    res.json({
      learners: rows.rows,
      total: rows.rowCount,
      summary: overall.rows[0],
      byProgram,
    });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/:orderId/refund ──────────────
   Marks (or clears) an internal refund flag on a paid enrollment.
   Does NOT call Razorpay or move any money - the admin processes
   the actual refund separately; this only affects reporting/sales. */
router.post('/admin/:orderId/refund', protect, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { action, reason, amount } = req.body;

    if (action === 'clear') {
      const r = await query(
        `UPDATE enrollments SET refund_status='none', refund_reason=NULL, refund_amount=NULL,
                refund_initiated_at=NULL, refunded_by=NULL
         WHERE order_id=$1 AND status='paid' RETURNING id, student_name`,
        [orderId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Paid enrollment not found.' });
      return res.json({ message: `Refund flag cleared for ${r.rows[0].student_name}.` });
    }

    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Refund reason is required.' });

    const enr = await query(`SELECT amount FROM enrollments WHERE order_id=$1 AND status='paid'`, [orderId]);
    if (!enr.rows.length) return res.status(404).json({ error: 'Paid enrollment not found.' });

    const refundAmt = (amount !== undefined && amount !== null && amount !== '') ? parseInt(amount, 10) : enr.rows[0].amount;
    if (isNaN(refundAmt) || refundAmt < 0) return res.status(400).json({ error: 'Invalid refund amount.' });

    const r = await query(
      `UPDATE enrollments SET refund_status='initiated', refund_reason=$1, refund_amount=$2,
              refund_initiated_at=NOW(), refunded_by=$3
       WHERE order_id=$4 AND status='paid' RETURNING id, student_name`,
      [reason.trim(), refundAmt, req.admin.email, orderId]);

    res.json({ message: `Refund marked as initiated for ${r.rows[0].student_name}. No money was moved automatically - process the actual refund via Razorpay/bank separately.` });
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
       SET form_token = $1, form_used = FALSE, form_used_at = NULL, welcome_sent = FALSE
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

/* ── POST /api/enrollment/admin/create ───────────────────────
   Admin only - manually creates an enrollment row (no Razorpay
   involved). Used to correct a learner who paid for the wrong
   program: admin cancels/refund-flags the original enrollment
   themselves via the existing refund toggle, then creates a fresh
   row here for the correct program and marks it paid (below) to
   trigger the normal welcome email with that program's Tally form
   link. Also usable for any other manually-collected payment
   (cash, bank transfer, comp). Body: { program_slug, student_name,
   student_email, student_phone, amount } - amount defaults to the
   program's list price from the `programs` table if omitted. */
const { getProgramData, sendAllPaymentEmails, onEnrollmentPaid } = require('./payment');

router.post('/admin/create', protect, async (req, res, next) => {
  try {
    const { program_slug, student_name, student_email, student_phone, amount } = req.body;
    if (!program_slug || !student_name || !student_phone) {
      return res.status(400).json({ error: 'program_slug, student_name and student_phone are required.' });
    }

    const program = await getProgramData(program_slug);
    if (!program) return res.status(400).json({ error: 'Unknown program_slug.' });

    const finalAmount = (amount !== undefined && amount !== null && amount !== '') ? parseInt(amount, 10) : program.price;
    if (isNaN(finalAmount) || finalAmount < 0) return res.status(400).json({ error: 'Invalid amount.' });

    const order_id = `JSP-MANUAL-${Date.now()}`;
    const result = await query(
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [order_id, program_slug, program.name, finalAmount, student_name.trim(), (student_email || '').toLowerCase().trim() || null, student_phone]
    );

    res.status(201).json({ message: `Enrollment created for ${student_name} (${program.name}).`, enrollment: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/:id/mark-paid ────────────────
   Admin only - flips a pending enrollment to paid without a
   Razorpay payment, then runs it through the exact same pipeline a
   real payment does (form_token, welcome email with the Tally form
   link, referral code assignment, admin notification), so the
   learner gets the correct onboarding flow immediately. ── */
router.post('/admin/:id/mark-paid', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    const formToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `UPDATE enrollments
       SET status = 'paid', paid_at = NOW(), form_token = COALESCE(form_token, $1)
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [formToken, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pending enrollment not found (already paid, cancelled, or does not exist).' });

    const enrollment = result.rows[0];
    sendAllPaymentEmails(enrollment).catch(err => console.error('[mark-paid] welcome email failed:', err.message));
    onEnrollmentPaid(enrollment).catch(err => console.error('[mark-paid] onEnrollmentPaid failed:', err.message));

    res.json({ message: `Marked as paid for ${enrollment.student_name}. Welcome email with the enrollment form link is sending now.` });
  } catch (err) { next(err); }
});

/* ── PATCH /api/enrollment/admin/:id/email ───────────────────
   Admin only - corrects the email stored directly on an enrollment
   row (e.g. typo at checkout). This is the address "Re-issue form
   link" and invoice/admit-card emails actually send to - it is a
   separate copy from learners.email, not joined or auto-synced. */
router.patch('/admin/:id/email', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const result = await query(
      `UPDATE enrollments SET student_email = $1 WHERE id = $2 RETURNING id, student_name, student_email`,
      [email.toLowerCase().trim(), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found.' });

    res.json({ message: `Email updated for ${result.rows[0].student_name}.`, enrollment: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/resend-admit-card ─────────────
   Admin only - generate and resend admit card for a specific enrollment.
   Used when the admit card email failed (e.g. Resend rate limit, or the
   silent-failure bug fixed for OMR learners on 2026-07-04).
   Body: { enrollment_id, name, govt_id, centre, program_type, photo_url }
   `centre` is required for offline enrollments only - OMR enrollments are
   always "Online (Home Based)" and ignore whatever centre is passed in. */
router.post('/admin/resend-admit-card', protect, async (req, res, next) => {
  try {
    const { enrollment_id, name, govt_id, centre, program_type, photo_url } = req.body;
    if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id required.' });

    const enrResult = await query(
      `SELECT id, student_name, student_email, student_phone, program_slug
       FROM enrollments WHERE id = $1 AND status = 'paid'`,
      [enrollment_id]
    );
    if (!enrResult.rows.length) return res.status(404).json({ error: 'Paid enrollment not found.' });
    const enr = enrResult.rows[0];

    const slug    = enr.program_slug || '';
    const isOmr   = slug.toLowerCase().includes('omr');
    const isCombo = slug === 'rssb-je-jaspalsirki-testseries-degree-diploma-combo'
      || slug === 'rssb-je-jaspalsirki-testseries-degree-diploma-combo-omr';
    const { ESE_PROGRAMS } = require('../config/eseTestSeries');
    const eseKey = Object.keys(ESE_PROGRAMS).find(k => ESE_PROGRAMS[k].slug === slug);
    const isEse = !!eseKey;
    const isEseCombined = eseKey === 'combined' || eseKey === 'combinedOmr';

    if (!isCombo && !isEseCombined) {
      if (!name)             return res.status(400).json({ error: 'name is required.' });
      if (!isOmr && !centre) return res.status(400).json({ error: 'centre is required for offline enrollments.' });
    }

    // fetchImageBufferTrusted (not the webhook's strict fetchImageBuffer) since
    // photo_url here is admin-supplied, not attacker-reachable webhook input -
    // it still blocks the obvious SSRF targets (localhost/private ranges/metadata).
    const { generateAdmitCard, fetchImageBufferTrusted } = require('./tally-webhook');
    const photoBuffer = photo_url ? await fetchImageBufferTrusted(photo_url) : null;

    if (isCombo) {
      const {
        generateComboAdmitCard, buildComboAdmitCardHtml, generateRollNumber, getCentreKey, CENTRES,
      } = require('./tally-webhook');
      const { send: resendSend, PRIORITY } = require('../services/resendQueue');

      const centreKey  = isOmr ? null : getCentreKey(centre);
      const centreInfo = isOmr ? { name: 'Online (Home Based)', address: '', mapsLink: '#' }
        : (CENTRES[centreKey] || { name: centre, address: 'TBD', mapsLink: '#' });

      const rollNumberDegree  = await generateRollNumber(centreKey || centreInfo.name, 'degree');
      const rollNumberDiploma = await generateRollNumber(centreKey || centreInfo.name, 'diploma');

      const pdfBuffer = await generateComboAdmitCard({
        name:  name || enr.student_name,
        govtId: govt_id || 'N/A',
        rollNumberDegree,
        rollNumberDiploma,
        centre: centreInfo.name,
        phone:  enr.student_phone || 'N/A',
        email:  enr.student_email,
        photoBuffer,
        mode: isOmr ? 'home' : 'offline',
      });

      const result = await resendSend({
        from:        'Dr. Jaspal Singh <team@jaspalsingh.in>',
        to:          enr.student_email,
        subject:     `Confirmed! Your Admit Card for RSSB JE 2026 - Degree + Diploma Combo`,
        html:        buildComboAdmitCardHtml({ name: name || enr.student_name, centreInfo }),
        attachments: [{ filename: `AdmitCard_Combo_${rollNumberDegree}_${rollNumberDiploma}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
      }, PRIORITY.ADMIT_CARD);

      if (result.error) {
        console.error('[resend-admit-card] Resend error:', result.error);
        return res.status(502).json({ error: `Email send failed: ${result.error.message}` });
      }

      console.log(`[resend-admit-card] Sent combo to ${enr.student_email} | Degree Roll: ${rollNumberDegree} | Diploma Roll: ${rollNumberDiploma}`);
      await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [`${rollNumberDegree}|${rollNumberDiploma}`, enrollment_id]);
      return res.json({ message: `Admit card sent to ${enr.student_email}`, roll_number_degree: rollNumberDegree, roll_number_diploma: rollNumberDiploma });
    }

    if (isEse) {
      const { ESE_CENTRES, getEseCentreKey } = require('../config/eseTestSeries');
      const {
        generateEseRollNumber, buildEseAdmitCardHtml, buildEseComboAdmitCardHtml,
      } = require('./tally-ese-shared');
      const { send: resendSend, PRIORITY } = require('../services/resendQueue');
      const cfg = ESE_PROGRAMS[eseKey];

      const centreKey  = isOmr ? null : getEseCentreKey(centre);
      const centreInfo = isOmr ? { name: 'Online (Home Based)', address: '', mapsLink: '#' }
        : (ESE_CENTRES[centreKey] || { name: centre, address: 'TBD', mapsLink: '#' });

      if (isEseCombined) {
        const rollNumber = await generateEseRollNumber(isOmr ? 'ESE' : (centreKey || centreInfo.name), 'CMB');

        const pdfBuffer = await generateAdmitCard({
          name:         name || enr.student_name,
          govtId:       govt_id || 'N/A',
          rollNumber,
          centre:       centreInfo.name,
          targetExam:   cfg.seriesName,
          phone:        enr.student_phone || 'N/A',
          email:        enr.student_email,
          photoBuffer,
          seriesName:   cfg.seriesName,
          lastTestDate: '17 January 2027 (Test-22)',
          mode:         isOmr ? 'home' : 'offline',
        });

        const result = await resendSend({
          from:        'Dr. Jaspal Singh <team@jaspalsingh.in>',
          to:          enr.student_email,
          subject:     `Confirmed! Your Admit Card for ${cfg.seriesName}`,
          html:        buildEseComboAdmitCardHtml({ name: name || enr.student_name, centreInfo }),
          attachments: [{ filename: `AdmitCard_${rollNumber}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
        }, PRIORITY.ADMIT_CARD);

        if (result.error) {
          console.error('[resend-admit-card] Resend error:', result.error);
          return res.status(502).json({ error: `Email send failed: ${result.error.message}` });
        }

        console.log(`[resend-admit-card] Sent ESE combined to ${enr.student_email} | Roll: ${rollNumber}`);
        await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [rollNumber, enrollment_id]);
        return res.json({ message: `Admit card sent to ${enr.student_email}`, roll_number: rollNumber });
      }

      const rollNumber = await generateEseRollNumber(isOmr ? 'ESE' : (centreKey || centreInfo.name), cfg.examCode);

      const pdfBuffer = await generateAdmitCard({
        name:         name || enr.student_name,
        govtId:       govt_id || 'N/A',
        rollNumber,
        centre:       centreInfo.name,
        targetExam:   cfg.seriesName,
        phone:        enr.student_phone || 'N/A',
        email:        enr.student_email,
        photoBuffer,
        seriesName:   cfg.seriesName,
        lastTestDate: cfg.lastTestDate,
        mode:         isOmr ? 'home' : 'offline',
      });

      const result = await resendSend({
        from:        'Dr. Jaspal Singh <team@jaspalsingh.in>',
        to:          enr.student_email,
        subject:     `Confirmed! Your Admit Card for ${cfg.seriesName}`,
        html:        buildEseAdmitCardHtml({ name: name || enr.student_name, seriesName: cfg.seriesName, centreInfo, schedule: cfg.schedule }),
        attachments: [{ filename: `AdmitCard_${rollNumber}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
      }, PRIORITY.ADMIT_CARD);

      if (result.error) {
        console.error('[resend-admit-card] Resend error:', result.error);
        return res.status(502).json({ error: `Email send failed: ${result.error.message}` });
      }

      console.log(`[resend-admit-card] Sent ESE to ${enr.student_email} | Roll: ${rollNumber}`);
      await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [rollNumber, enrollment_id]);
      return res.json({ message: `Admit card sent to ${enr.student_email}`, roll_number: rollNumber });
    }

    const isDegreeCourse = program_type === 'degree' ? true
      : program_type === 'diploma' ? false
      : slug.includes('degree');

    let centreForCard, seriesName, schedule, lastTestDate, rollNumber, mode, htmlBody;

    if (isOmr) {
      const {
        generateOmrRollNumber, getOmrSeriesName, getOmrLastTestDate, buildOmrConfirmationHtml,
      } = require('./tally-omr-shared');

      mode         = 'home';
      centreForCard = 'Online (Home Based)';
      seriesName   = getOmrSeriesName(isDegreeCourse);
      lastTestDate = getOmrLastTestDate(isDegreeCourse);
      rollNumber   = generateOmrRollNumber(isDegreeCourse);
      htmlBody     = buildOmrConfirmationHtml({ name: name || enr.student_name, isDegreeCourse });
    } else {
      const { buildAdmitCardHtml, getCentreKey, CENTRES, SCHEDULE_DEGREE, SCHEDULE_DIPLOMA } = require('./tally-webhook');

      const centreKey  = getCentreKey(centre);
      const centreInfo = CENTRES[centreKey] || { name: centre, address: 'TBD', mapsLink: '#' };
      schedule         = isDegreeCourse ? SCHEDULE_DEGREE : SCHEDULE_DIPLOMA;

      mode         = 'offline';
      centreForCard = centreInfo.name;
      seriesName   = isDegreeCourse
        ? 'RSSB JE 2026 - Degree (Civil) - Offline Test Series'
        : 'RSSB JE 2026 - Diploma (Civil) - Offline Test Series';
      lastTestDate = isDegreeCourse ? '10 January 2027 (Test-28)' : '29 November 2026 (Test-22)';
      const prefix = (centreKey || centre || 'JSP').slice(0, 3).toUpperCase();
      const examCode = isDegreeCourse ? 'DEG' : 'DIP';
      rollNumber = null;
      for (let i = 0; i < 10; i++) {
        const candidate = `${prefix}-${examCode}-${Math.floor(10000 + Math.random() * 90000)}`;
        const exists = await query('SELECT 1 FROM enrollments WHERE roll_number = $1', [candidate]);
        if (!exists.rows.length) { rollNumber = candidate; break; }
      }
      if (!rollNumber) rollNumber = `${prefix}-${examCode}-${Math.floor(10000 + Math.random() * 90000)}`;
      htmlBody     = buildAdmitCardHtml({ name: name || enr.student_name, seriesName, centreInfo, schedule, isDegreeCourse });
    }

    const pdfBuffer = await generateAdmitCard({
      name:         name || enr.student_name,
      govtId:       govt_id || 'N/A',
      rollNumber,
      centre:       centreForCard,
      targetExam:   seriesName,
      phone:        enr.student_phone || 'N/A',
      email:        enr.student_email,
      photoBuffer,
      seriesName,
      lastTestDate,
      mode,
    });

    const result = await resendSend({
      from:        'Dr. Jaspal Singh <team@jaspalsingh.in>',
      to:          enr.student_email,
      subject:     isOmr ? `Identity Verified - You're enrolled in ${seriesName}` : `Confirmed! Your Admit Card for ${seriesName}`,
      html:        htmlBody,
      attachments: [{ filename: `AdmitCard_${rollNumber}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
    }, PRIORITY.ADMIT_CARD);

    if (result.error) {
      console.error('[resend-admit-card] Resend error:', result.error);
      return res.status(502).json({ error: `Email send failed: ${result.error.message}` });
    }

    console.log(`[resend-admit-card] Sent to ${enr.student_email} | Roll: ${rollNumber}`);
    await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [rollNumber, enrollment_id]);
    res.json({ message: `Admit card sent to ${enr.student_email}`, roll_number: rollNumber });
  } catch (err) { next(err); }
});

/* ── POST /api/enrollment/admin/send-omr-papers ──────────────
   Admin endpoint to send a test paper PDF (from Google Drive)
   to all paid enrollments for a given OMR program slug.
   Watermarks each PDF with the learner's email and phone.
   Body: { program_slug, pdf_url }
   Returns: { sent: N, failed: M }
   ─────────────────────────────────────────────────────────── */

const https = require('https');
const http  = require('http');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');

const OMR_FROM = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* Convert Google Drive share URL to direct download URL */
function toDriveDownloadUrl(url) {
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  return url; // return as-is if pattern not matched
}

/* Fetch URL as Buffer */
function fetchBuffer(url, depth = 0) {
  if (depth > 8) return Promise.reject(new Error('Too many redirects fetching PDF'));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jaspalsingh.in/1.0)' } }, (res) => {
      const redirect = [301, 302, 303, 307, 308];
      if (redirect.includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return fetchBuffer(next, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} fetching PDF`));

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Google Drive returns HTML confirmation page for large files.
        // Extract the confirm URL and retry.
        const isHtml = (res.headers['content-type'] || '').includes('text/html');
        if (isHtml) {
          const html = buf.toString('utf8');
          const confirmMatch = html.match(/href="(\/uc\?export=download[^"]+confirm=[^"]+)"/);
          if (confirmMatch) {
            const confirmUrl = 'https://drive.google.com' + confirmMatch[1].replace(/&amp;/g, '&');
            return fetchBuffer(confirmUrl, depth + 1).then(resolve).catch(reject);
          }
          return reject(new Error('Google Drive returned HTML - check file permissions are set to "Anyone with link"'));
        }
        resolve(buf);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/* Watermark every page of a PDF with "email | phone" diagonal text.
   `opts.cross` renders it steeper and darker, tilted the opposite way
   (crosses instead of running parallel under a pre-existing diagonal brand
   watermark, e.g. the "Jaspal Sir ki Test Series" stamp already baked into
   some Analysis/Workbook source PDFs - running parallel at the same angle
   made ours unreadable wherever the two overlapped). Question Paper / OMR
   Sheet sources have no such pre-existing watermark, so they keep the
   original subtler style by default. */
async function watermarkPdf(pdfBytes, email, phone, opts = {}) {
  const pdfDoc  = await PDFDocument.load(pdfBytes);
  const pages   = pdfDoc.getPages();
  const watermarkText = `${email} | ${phone}`;

  const style = opts.cross
    ? { rotateDeg: -25, color: rgb(0.25, 0.25, 0.25), x: 0.08, opacity: 0.4, size: 16 }
    : { rotateDeg: 35,  color: rgb(0.6, 0.6, 0.6),    x: 0.10, opacity: 0.18, size: 18 };

  for (const page of pages) {
    const { width, height } = page.getSize();
    /* Draw diagonal watermark text across the page center */
    page.drawText(watermarkText, {
      x:        width  * style.x,
      y:        height * (opts.cross ? 0.78 : 0.45),
      size:     style.size,
      color:    style.color,
      opacity:  style.opacity,
      rotate:   degrees(style.rotateDeg),
      maxWidth: width * 0.85,
    });
    /* Second instance slightly offset for coverage */
    page.drawText(watermarkText, {
      x:        width  * (opts.cross ? style.x : 0.15),
      y:        height * (opts.cross ? 0.42 : 0.20),
      size:     opts.cross ? style.size : 14,
      color:    style.color,
      opacity:  opts.cross ? style.opacity : 0.13,
      rotate:   degrees(style.rotateDeg),
      maxWidth: opts.cross ? width * 0.85 : width * 0.75,
    });
  }

  return Buffer.from(await pdfDoc.save());
}

/* ── Look up a program's display title + combo categories from the DB,
   so the email subject/admit-card label works for any OMR program instead
   of guessing "RSSB JE 2026 - Civil Degree/Diploma" from the slug text. ── */
async function getOmrProgramInfo(program_slug) {
  const result = await query(`SELECT title, omr_categories FROM programs WHERE slug = $1`, [program_slug]);
  if (!result.rows.length) return { title: program_slug, categories: [] };
  const row = result.rows[0];
  return { title: row.title, categories: Array.isArray(row.omr_categories) ? row.omr_categories : [] };
}
function omrSeriesLabel(programInfo, category) {
  if (category && programInfo.categories.length) {
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    return `${programInfo.title} - ${label} Paper`;
  }
  return programInfo.title;
}

router.post('/admin/send-omr-papers', protect, async (req, res) => {
  try {
    const { program_slug, test_number, question_paper_url, omr_sheet_url, category, sample_email, sample_phone, sample_name } = req.body;

    if (!program_slug || !test_number || !question_paper_url || !omr_sheet_url) {
      return res.status(400).json({ error: 'program_slug, test_number, question_paper_url and omr_sheet_url are all required.' });
    }

    const programInfo = await getOmrProgramInfo(program_slug);
    /* Combo/multi-paper programs (omr_categories set, e.g. ["degree","diploma"]
       or ["paper1","paper2"]) have a separate question paper per category -
       send this endpoint once per category and pass it explicitly so the
       email subject/label is correct. Single-category programs don't need it. */
    if (programInfo.categories.length && !category) {
      return res.status(400).json({ error: `category (one of: ${programInfo.categories.join(', ')}) is required for this program.` });
    }

    /* Sample mode: send to a single test address only, skip the enrollments table entirely */
    const isSample = !!sample_email;
    let enrollments;
    if (isSample) {
      enrollments = [{ id: 'sample', student_name: sample_name || 'Test User', student_email: sample_email, student_phone: sample_phone || '' }];
    } else {
      const enrResult = await query(
        `SELECT id, student_name, student_email, student_phone
         FROM enrollments
         WHERE program_slug = $1 AND status = 'paid' AND refund_status != 'initiated'
         ORDER BY id ASC`,
        [program_slug]
      );

      if (!enrResult.rows.length) {
        return res.json({ sent: 0, failed: 0, message: 'No paid enrollments found for this program.' });
      }

      enrollments = enrResult.rows;
    }

    /* Download both source PDFs once */
    let qpBytes, omrBytes;
    try {
      [qpBytes, omrBytes] = await Promise.all([
        fetchBuffer(toDriveDownloadUrl(question_paper_url)),
        fetchBuffer(toDriveDownloadUrl(omr_sheet_url)),
      ]);
    } catch (err) {
      return res.status(502).json({ error: `Failed to download PDF: ${err.message}` });
    }

    const seriesLabel = omrSeriesLabel(programInfo, category);
    const testLabel = `Test ${String(test_number).padStart(2, '0')}`;
    const subject   = `${seriesLabel} - ${testLabel} Question Paper | jaspalsingh.in`;

    /* Respond immediately for real batch sends; sample sends wait for the result */
    if (!isSample) {
      res.json({
        message: `Sending ${testLabel} papers to ${enrollments.length} learners in background...`,
        total: enrollments.length,
      });
    }

    let sent = 0, failed = 0;
    for (const enr of enrollments) {
      try {
        const email = enr.student_email;
        const phone = (enr.student_phone || '').replace(/\D/g, '').slice(-10);
        const name  = enr.student_name || 'Learner';
        const firstName = name.split(' ')[0];

        const [wmQp, wmOmr] = await Promise.all([
          watermarkPdf(qpBytes,  email, phone),
          watermarkPdf(omrBytes, email, phone),
        ]);

        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:800;color:#4338CA;">${seriesLabel} - ${testLabel}</span>
      </div>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">Your Test Paper is Here, ${firstName}!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.7;">
      Two PDFs are attached to this email - the <strong>Question Paper</strong> and the <strong>OMR Sheet</strong>.
      Print both, attempt the test, and submit your filled OMR before <strong>10:00 PM today</strong>.
    </p>

    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:18px 22px;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
        Submission Deadline - 10:00 PM Today
      </div>
      <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.7;">
        <strong>Reply to this email</strong> with a clear photo or scan of your completed OMR sheet before 10:00 PM.
        Late submissions will not be evaluated. You can still access the PDFs after the deadline.
      </p>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:800;color:#1A1A2E;margin-bottom:12px;">Steps to Follow</div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">1.</span> Download and print the Question Paper and OMR Sheet (2 attachments below).
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">2.</span> Attempt the test on paper. Fill answers on the OMR Sheet using blue/black ballpoint pen only.
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">3.</span> Take a clear photo/scan of your filled OMR and <strong>reply to this email</strong> before 10:00 PM.
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">4.</span> Results and rankings will be announced with offline test participants.
        </td></tr>
      </table>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7;">
        <strong>Note:</strong> Both PDFs are watermarked with your email and phone number. Do not share them - any leak will be traced back to you.
      </p>
    </div>

    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "Give your best. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;&middot;&nbsp; ESE AIR-04 &nbsp;&middot;&nbsp; GATE AIR-06</p>
    </div>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Reply to this email to submit your OMR sheet | +91 98291 33317</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

        const { error } = await resendSend({
          from:       OMR_FROM,
          reply_to:   'team@jaspalsingh.in',
          to:         email,
          subject,
          html,
          attachments: [
            {
              filename:    `QuestionPaper_${testLabel.replace(' ', '')}.pdf`,
              content:     wmQp.toString('base64'),
              contentType: 'application/pdf',
            },
            {
              filename:    `OMRSheet_${testLabel.replace(' ', '')}.pdf`,
              content:     wmOmr.toString('base64'),
              contentType: 'application/pdf',
            },
          ],
        });

        if (error) {
          console.error(`[send-omr-papers] Resend error for ${email}:`, error);
          failed++;
        } else {
          sent++;
          console.log(`[send-omr-papers] ${testLabel} sent to ${email} (${sent}/${enrollments.length})`);
        }
      } catch (err) {
        failed++;
        console.error(`[send-omr-papers] Failed for enrollment ${enr.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[send-omr-papers] ${testLabel} done. Sent: ${sent}, Failed: ${failed}`);

    if (isSample) {
      res.json({
        sent, failed,
        message: sent ? `Sample email sent to ${sample_email}.` : `Sample email failed to send to ${sample_email}.`,
      });
    }
  } catch (err) {
    console.error('[send-omr-papers]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/enrollment/admin/send-omr-analysis ────────────
   Admin endpoint to send the Detailed Analysis & Solutions and
   Analysis Workbook PDFs (from Google Drive) to all paid
   enrollments for a given OMR program slug.
   Watermarks each PDF with the learner's email and phone.
   Body: { program_slug, test_number, analysis_url, workbook_url }
   Returns: { sent: N, failed: M }
   ─────────────────────────────────────────────────────────── */
router.post('/admin/send-omr-analysis', protect, async (req, res) => {
  try {
    const { program_slug, test_number, analysis_urls, workbook_urls, category, sample_email, sample_phone, sample_name } = req.body;

    /* Each of these can be one or more Drive links (e.g. a multi-part analysis PDF) */
    const analysisUrls = (Array.isArray(analysis_urls) ? analysis_urls : [analysis_urls]).filter(Boolean);
    const workbookUrls = (Array.isArray(workbook_urls) ? workbook_urls : [workbook_urls]).filter(Boolean);

    if (!program_slug || !test_number || !analysisUrls.length || !workbookUrls.length) {
      return res.status(400).json({ error: 'program_slug, test_number, and at least one analysis_urls and workbook_urls link are all required.' });
    }

    const programInfo = await getOmrProgramInfo(program_slug);
    if (programInfo.categories.length && !category) {
      return res.status(400).json({ error: `category (one of: ${programInfo.categories.join(', ')}) is required for this program.` });
    }

    /* Sample mode: send to a single test address only, skip the enrollments table entirely */
    const isSample = !!sample_email;
    let enrollments;
    if (isSample) {
      enrollments = [{ id: 'sample', student_name: sample_name || 'Test User', student_email: sample_email, student_phone: sample_phone || '' }];
    } else {
      const enrResult = await query(
        `SELECT id, student_name, student_email, student_phone
         FROM enrollments
         WHERE program_slug = $1 AND status = 'paid' AND refund_status != 'initiated'
         ORDER BY id ASC`,
        [program_slug]
      );

      if (!enrResult.rows.length) {
        return res.json({ sent: 0, failed: 0, message: 'No paid enrollments found for this program.' });
      }

      enrollments = enrResult.rows;
    }

    /* Download every source PDF once (each list may hold multiple files) */
    let analysisBytesList, workbookBytesList;
    try {
      [analysisBytesList, workbookBytesList] = await Promise.all([
        Promise.all(analysisUrls.map(u => fetchBuffer(toDriveDownloadUrl(u)))),
        Promise.all(workbookUrls.map(u => fetchBuffer(toDriveDownloadUrl(u)))),
      ]);
    } catch (err) {
      return res.status(502).json({ error: `Failed to download PDF: ${err.message}` });
    }

    const seriesLabel = omrSeriesLabel(programInfo, category);
    const testLabel = `Test ${String(test_number).padStart(2, '0')}`;
    const subject   = `${seriesLabel} - ${testLabel} Analysis & Solutions | jaspalsingh.in`;

    /* Respond immediately for real batch sends; sample sends wait for the result */
    if (!isSample) {
      res.json({
        message: `Sending ${testLabel} analysis to ${enrollments.length} learners in background...`,
        total: enrollments.length,
      });
    }

    let sent = 0, failed = 0;
    for (const enr of enrollments) {
      try {
        const email = enr.student_email;
        const phone = (enr.student_phone || '').replace(/\D/g, '').slice(-10);
        const name  = enr.student_name || 'Learner';
        const firstName = name.split(' ')[0];

        const [wmAnalysisList, wmWorkbookList] = await Promise.all([
          Promise.all(analysisBytesList.map(bytes => watermarkPdf(bytes, email, phone, { cross: true }))),
          Promise.all(workbookBytesList.map(bytes => watermarkPdf(bytes, email, phone, { cross: true }))),
        ]);

        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:800;color:#4338CA;">${seriesLabel} - ${testLabel}</span>
      </div>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">Your Analysis & Solutions are Here, ${firstName}!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.7;">
      The <strong>Detailed Analysis & Solutions</strong> and <strong>Analysis Workbook</strong> are attached to this email.
      Go through them carefully to understand your mistakes and strengthen weak areas before the next test.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:800;color:#1A1A2E;margin-bottom:12px;">What's Inside</div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">1.</span> <strong>Detailed Analysis & Solutions</strong> - question-wise solutions with concepts explained.
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">2.</span> <strong>Analysis Workbook</strong> - practice workbook to reinforce the topics covered.
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;line-height:1.7;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;">3.</span> Review your mistakes and revise the concepts before the next test.
        </td></tr>
      </table>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7;">
        <strong>Note:</strong> Every attached PDF is watermarked with your email and phone number. Do not share them - any leak will be traced back to you.
      </p>
    </div>

    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "Give your best. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;&middot;&nbsp; ESE AIR-04 &nbsp;&middot;&nbsp; GATE AIR-06</p>
    </div>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Reply to this email for any queries | +91 98291 33317</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

        const attachments = [
          ...wmAnalysisList.map((buf, i) => ({
            filename:    `DetailedAnalysisAndSolutions_${testLabel.replace(' ', '')}${wmAnalysisList.length > 1 ? `_Part${i + 1}` : ''}.pdf`,
            content:     buf.toString('base64'),
            contentType: 'application/pdf',
          })),
          ...wmWorkbookList.map((buf, i) => ({
            filename:    `AnalysisWorkbook_${testLabel.replace(' ', '')}${wmWorkbookList.length > 1 ? `_Part${i + 1}` : ''}.pdf`,
            content:     buf.toString('base64'),
            contentType: 'application/pdf',
          })),
        ];

        const { error } = await resendSend({
          from:       OMR_FROM,
          reply_to:   'team@jaspalsingh.in',
          to:         email,
          subject,
          html,
          attachments,
        });

        if (error) {
          console.error(`[send-omr-analysis] Resend error for ${email}:`, error);
          failed++;
        } else {
          sent++;
          console.log(`[send-omr-analysis] ${testLabel} sent to ${email} (${sent}/${enrollments.length})`);
        }
      } catch (err) {
        failed++;
        console.error(`[send-omr-analysis] Failed for enrollment ${enr.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[send-omr-analysis] ${testLabel} done. Sent: ${sent}, Failed: ${failed}`);

    if (isSample) {
      res.json({
        sent, failed,
        message: sent ? `Sample email sent to ${sample_email}.` : `Sample email failed to send to ${sample_email}.`,
      });
    }
  } catch (err) {
    console.error('[send-omr-analysis]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

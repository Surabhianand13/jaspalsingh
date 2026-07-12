/* ============================================================
   routes/payment.js  -  Razorpay Payment Gateway
   Dr. Jaspal Singh Website  -  jaspalsingh.in
   ============================================================ */

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const { query } = require('../config/db');
const crypto  = require('crypto');
const { sendInvoiceEmail, sendWelcomePaymentEmail, sendAdminPaymentNotification, sendReferralCodeEmail } = require('../services/paymentEmailService');
const { protect } = require('../middleware/auth');
const { protectLearner, optionalLearner } = require('../middleware/learnerAuth');
const { isObviousTestSubmission } = require('../utils/spamFilter');
const { verifyTurnstile } = require('../utils/turnstile');

const REFERRAL_DISCOUNT = 100;

/* Dedicated limiter for order creation - each hit creates a real Razorpay
   order + a pending DB row, so it needs tighter throttling than the
   blanket 500/15min apiLimiter (a genuine buyer retries at most a few
   times; a bot script would otherwise be free to spam this). */
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many checkout attempts. Please wait a few minutes and try again.' },
});

/* ── Generate a unique referral code for a newly-paid enrollment ── */
async function ensureReferralCode(enrollment) {
  if (enrollment.referral_code) return enrollment.referral_code;
  const phoneDigits = (enrollment.student_phone || '').replace(/\D/g, '').slice(-4) || '0000';
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase(); // 16.7M combos - resists guessing
    const code = `REF${phoneDigits}${suffix}`;
    try {
      const result = await query(
        `UPDATE enrollments SET referral_code = $1 WHERE order_id = $2 AND referral_code IS NULL RETURNING referral_code`,
        [code, enrollment.order_id]
      );
      if (result.rows.length) return result.rows[0].referral_code;
      // Already set by a concurrent request - fetch it.
      const existing = await query(`SELECT referral_code FROM enrollments WHERE order_id = $1`, [enrollment.order_id]);
      return existing.rows[0]?.referral_code || null;
    } catch (err) {
      if (err.code !== '23505') throw err; // unique violation - retry with new suffix
    }
  }
  return null;
}

/* ── Record a referral credit once the referred enrollment is paid ──
   Re-checks self-referral here too (defense in depth) in case referred_by
   was ever set outside the normal create-order validation path. ── */
async function recordReferralCredit(enrollment) {
  if (!enrollment.referred_by) return;
  try {
    const referrer = await query(
      `SELECT order_id, student_phone, student_email, learner_id FROM enrollments WHERE referral_code = $1 AND status = 'paid'`,
      [enrollment.referred_by]
    );
    if (!referrer.rows.length) return;
    const ref = referrer.rows[0];
    if (ref.order_id === enrollment.order_id) return; // can't refer yourself within one order
    const samePhone   = enrollment.student_phone && ref.student_phone && ref.student_phone.replace(/\D/g, '').slice(-10) === enrollment.student_phone.replace(/\D/g, '').slice(-10);
    const sameEmail   = enrollment.student_email && ref.student_email && ref.student_email.toLowerCase() === enrollment.student_email.toLowerCase();
    const sameLearner = enrollment.learner_id && ref.learner_id && Number(enrollment.learner_id) === Number(ref.learner_id);
    if (samePhone || sameEmail || sameLearner) return;

    await query(
      `INSERT INTO referral_credits (referrer_order_id, referred_order_id, amount, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (referred_order_id) DO NOTHING`,
      [ref.order_id, enrollment.order_id, REFERRAL_DISCOUNT]
    );
  } catch (err) {
    console.error('[recordReferralCredit]', err.message);
  }
}

/* ── When a learner retries checkout, each attempt creates a new order_id
   row. Once one of those attempts is paid, the earlier attempt(s) are left
   stuck at 'pending' forever - showing up twice in the admin enrollments
   list and getting sales calls for a lead that already converted. Close
   those out here so only the live (paid) row remains callable. ── */
async function cancelDuplicatePendingEnrollments(enrollment) {
  try {
    await query(
      `UPDATE enrollments
       SET status = 'cancelled'
       WHERE student_phone = $1 AND program_slug = $2 AND order_id != $3 AND status = 'pending'`,
      [enrollment.student_phone, enrollment.program_slug, enrollment.order_id]
    );
  } catch (err) {
    console.error('[cancelDuplicatePendingEnrollments]', err.message);
  }
}

/* ── Called whenever an enrollment transitions to 'paid' ── */
async function onEnrollmentPaid(enrollment) {
  await ensureReferralCode(enrollment);
  await recordReferralCredit(enrollment);
  await cancelDuplicatePendingEnrollments(enrollment);
}

/* ── Coupon catalogue ────────────────────────────────────────
   Coupons now live in the `coupons` table (admin-editable from the
   dashboard) - see server.js migrate() for the one-time seed of the
   codes that used to be hardcoded here. This lookup + FALLBACK_COUPONS
   exist purely so an active coupon link never 404s even if the DB is
   briefly unreachable. ── */
const FALLBACK_COUPONS = {
  'FIRST':     { type: 'flat_price',        discount_amount: 1,    label: 'First-time offer' },
  'JASPAL200': { type: 'fixed_discount',     discount_amount: 1200, exclusive: true, label: 'Special Rs 1,200 off' },
};

async function getCoupon(code) {
  const upper = (code || '').toUpperCase();
  if (!upper) return null;
  try {
    const result = await query(`SELECT * FROM coupons WHERE code = $1 AND is_active = TRUE`, [upper]);
    if (result.rows.length) return result.rows[0];
  } catch (err) {
    console.error('[getCoupon] DB error, falling back to hardcoded coupon:', err.message);
  }
  const fb = FALLBACK_COUPONS[upper];
  return fb ? { code: upper, program_prices: null, program_slugs: null, max_uses: null, exclusive: false, expires_at: null, ...fb } : null;
}

/* ── Has this coupon hit its usage limit (if any)? ── */
async function isCouponUsageExceeded(couponRow) {
  if (couponRow.max_uses == null) return false;
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM enrollments WHERE coupon_code = $1 AND status = 'paid'`,
    [couponRow.code.toUpperCase()]
  );
  return result.rows[0].n >= couponRow.max_uses;
}

async function applyCoupon(coupon, originalPrice, programSlug) {
  if (!coupon) return { finalPrice: originalPrice, discount: 0, label: null, exclusive: false };
  const c = await getCoupon(coupon);
  if (!c) return null;
  if (c.expires_at && new Date(c.expires_at) < new Date()) return null;

  const scopeSlugs = Array.isArray(c.program_slugs) ? c.program_slugs : (c.program_slugs ? Object.values(c.program_slugs) : null);
  if (c.type !== 'program_price_map' && scopeSlugs && scopeSlugs.length && !scopeSlugs.includes(programSlug)) {
    return null; // coupon not valid on this program
  }

  if (c.type === 'program_price_map') {
    const fixedPrice = (c.program_prices || {})[programSlug];
    if (fixedPrice == null) return null; // not valid on this program
    return { finalPrice: fixedPrice, discount: originalPrice - fixedPrice, label: c.label, exclusive: !!c.exclusive, couponRow: c };
  }

  const discountAmt = c.type === 'flat_price' ? (originalPrice - c.discount_amount) : c.discount_amount;
  return {
    finalPrice: originalPrice - discountAmt,
    discount:   discountAmt,
    label:      c.label,
    exclusive:  !!c.exclusive,
    couponRow:  c,
  };
}

/* ── Program catalogue ─────────────────────────────────────────
   Pricing now lives in the `programs` table (admin-editable), so a
   price/title change made in the dashboard takes effect immediately
   with no code deploy. FALLBACK_PROGRAMS is the pre-2026-07-08 hardcoded
   catalogue, kept only as a safety net if the DB is briefly unreachable
   or a row is somehow missing. ── */
const FALLBACK_PROGRAMS = {
  'rssb-jen-diploma-test-series':     { name: 'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline', shortName: 'RSSB JE 2026 Test Series', price: 3799, mrp: 7999 },
  'rssb-jen-degree-test-series':      { name: 'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline', shortName: 'RSSB JE 2026 Test Series', price: 3999, mrp: 7999 },
  'rpsc-ae-interview':                { name: 'RPSC AE 2024 - Interview Guidance Programme', shortName: 'RPSC AE Interview Guidance', price: 4999, mrp: 8999 },
  'rssb-je-omr-degree-test-series':   { name: 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree (Home-Based OMR Test Series)', shortName: 'RSSB JE 2026 OMR Degree Test Series', price: 1999, mrp: 2999 },
  'rssb-jen-omr-diploma-test-series': { name: 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Diploma (Home-Based OMR Test Series)', shortName: 'RSSB JE 2026 OMR Diploma Test Series', price: 1999, mrp: 2999 },
};

async function getProgramData(slug) {
  try {
    const result = await query(`SELECT slug, title, short_name, price, mrp FROM programs WHERE slug = $1`, [slug]);
    if (result.rows.length && result.rows[0].price != null && result.rows[0].mrp != null) {
      const row = result.rows[0];
      return { name: row.title, shortName: row.short_name || row.title, price: row.price, mrp: row.mrp };
    }
  } catch (err) {
    console.error('[getProgramData] DB error, falling back to hardcoded catalogue:', err.message);
  }
  return FALLBACK_PROGRAMS[slug] || null;
}

/* ── Razorpay instance ───────────────────────────────────── */
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ── POST /api/payment/validate-coupon ───────────────────── */
router.post('/validate-coupon', async (req, res) => {
  const { coupon_code, program_slug } = req.body;
  if (!coupon_code || !program_slug) return res.status(400).json({ error: 'coupon_code and program_slug required.' });

  const program = await getProgramData(program_slug);
  if (!program) return res.status(400).json({ error: 'Invalid program.' });

  const result = await applyCoupon(coupon_code, program.price, program_slug);
  if (!result) return res.status(400).json({ valid: false, error: 'Invalid coupon code.' });

  if (await isCouponUsageExceeded(result.couponRow)) {
    return res.status(400).json({ valid: false, error: 'This coupon has already been used.' });
  }

  res.json({ valid: true, final_price: result.finalPrice, discount: result.discount, label: result.label, exclusive: result.exclusive });
});

/* ── Validate a referral code against the buyer's own identity ──
   Blocks self-referral by matching phone, email, AND learner_id - a
   logged-in learner can't dodge the phone/email check by entering a
   second phone number, since their learner_id stays the same. ── */
async function lookupReferral(referral_code, buyerPhone, buyerEmail, buyerLearnerId) {
  if (!referral_code) return null;
  const result = await query(
    `SELECT order_id, student_phone, student_email, learner_id FROM enrollments WHERE referral_code = $1 AND status = 'paid'`,
    [referral_code.toUpperCase()]
  );
  if (!result.rows.length) return null;
  const referrer = result.rows[0];
  const samePhone   = buyerPhone && referrer.student_phone && referrer.student_phone.replace(/\D/g, '').slice(-10) === buyerPhone.replace(/\D/g, '').slice(-10);
  const sameEmail   = buyerEmail && referrer.student_email && referrer.student_email.toLowerCase() === buyerEmail.toLowerCase();
  const sameLearner = buyerLearnerId && referrer.learner_id && Number(buyerLearnerId) === Number(referrer.learner_id);
  if (samePhone || sameEmail || sameLearner) return { selfReferral: true };
  return { selfReferral: false, referrer };
}

/* ── POST /api/payment/validate-referral ─────────────────── */
router.post('/validate-referral', optionalLearner, async (req, res) => {
  const { referral_code, program_slug, phone, email } = req.body;
  if (!referral_code || !program_slug) return res.status(400).json({ error: 'referral_code and program_slug required.' });

  const program = await getProgramData(program_slug);
  if (!program) return res.status(400).json({ error: 'Invalid program.' });

  const lookup = await lookupReferral(referral_code, phone || '', email || '', req.learner?.id);
  if (!lookup) return res.status(400).json({ valid: false, error: 'Invalid referral code.' });
  if (lookup.selfReferral) return res.status(400).json({ valid: false, error: 'You cannot use your own referral code.' });

  res.json({ valid: true, discount: REFERRAL_DISCOUNT, label: `Get an extra Rs ${REFERRAL_DISCOUNT} off` });
});

/* ── POST /api/payment/create-order ─────────────────────── */
router.post('/create-order', createOrderLimiter, optionalLearner, async (req, res) => {
  try {
    const { program_slug, name, email, phone, coupon_code, referral_code, turnstile_token } = req.body;

    if (!program_slug || !name || !email || !phone) {
      return res.status(400).json({ error: 'name, email, phone and program_slug are required.' });
    }

    const humanCheck = await verifyTurnstile(turnstile_token, req.ip);
    if (!humanCheck) {
      return res.status(400).json({ error: 'Verification failed. Please refresh the page and try again.' });
    }

    if (isObviousTestSubmission({ name, email, phone })) {
      console.warn(`[create-order] Blocked obvious test submission: ${name} / ${email} / ${phone}`);
      return res.status(400).json({ error: 'Please enter your real name, email and mobile number.' });
    }

    const program = await getProgramData(program_slug);
    if (!program) return res.status(400).json({ error: 'Invalid program.' });

    let finalPrice = program.price;
    let couponApplied = null;
    let couponExclusive = false;
    if (coupon_code) {
      const coup = await applyCoupon(coupon_code, program.price, program_slug);
      if (coup && coup.couponRow && await isCouponUsageExceeded(coup.couponRow)) {
        return res.status(400).json({ error: 'This coupon has already been used.' });
      }
      if (coup) { finalPrice = coup.finalPrice; couponApplied = coupon_code.toUpperCase(); couponExclusive = coup.exclusive; }
    }

    let referredBy = null;
    if (referral_code && !couponExclusive) {
      const lookup = await lookupReferral(referral_code, phone, email, req.learner?.id);
      if (lookup && !lookup.selfReferral) {
        finalPrice = Math.max(1, finalPrice - REFERRAL_DISCOUNT);
        referredBy = referral_code.toUpperCase();
      }
    }

    const order_id = `JSP-${program_slug.slice(0, 6).toUpperCase()}-${Date.now()}`;

    // Create Razorpay order (amount in paise)
    const rzpOrder = await razorpay.orders.create({
      amount:   finalPrice * 100,
      currency: 'INR',
      receipt:  order_id,
      notes: {
        jsp_order_id:  order_id,
        program_slug,
        program_name:  program.shortName,
        student_name:  name,
        student_email: email,
        student_phone: phone.replace(/\D/g, '').slice(-10),
      },
    });

    // Store enrollment as pending
    await query(
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone, status, coupon_code, referred_by, learner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
       ON CONFLICT (order_id) DO NOTHING`,
      [order_id, program_slug, program.name, finalPrice, name, email, phone, couponApplied, referredBy, req.learner?.id || null]
    );

    res.json({
      order_id,
      razorpay_order_id:  rzpOrder.id,
      razorpay_key_id:    process.env.RAZORPAY_KEY_ID,
      amount:             finalPrice,
      program_name:       program.name,
    });

  } catch (err) {
    console.error('[create-order] Razorpay error:', err?.error || err?.message || err);
    const razorpayMsg = err?.error?.description || err?.error?.reason || err?.message || 'Unknown error';
    res.status(500).json({ error: 'Payment gateway error. Please try again.', debug: razorpayMsg });
  }
});

/* ── sendAllPaymentEmails ─────────────────────────────────── */
async function sendAllPaymentEmails(enrollment, { sendInvoice = true } = {}) {
  if (sendInvoice) {
    sendInvoiceEmail(enrollment).catch(e => console.error('[invoice email]', e.message));
  }

  try {
    // Atomically claim the welcome send slot - prevents duplicate emails when
    // webhook and GET /verify both fire within milliseconds of each other.
    const claimed = await query(
      `UPDATE enrollments SET welcome_sent = TRUE WHERE order_id = $1 AND (welcome_sent IS NULL OR welcome_sent = FALSE) RETURNING order_id`,
      [enrollment.order_id]
    );
    if (!claimed.rows.length) {
      console.log(`[welcome email] already claimed for ${enrollment.order_id}, skipping`);
    } else {
      await sendWelcomePaymentEmail(enrollment);
      console.log(`[welcome email] sent OK for ${enrollment.order_id}`);
    }
  } catch (e) {
    console.error(`[welcome email] FAILED for ${enrollment.order_id}:`, e.message);
  }

  sendAdminPaymentNotification(enrollment).catch(e => console.error('[admin notify]', e.message));
}

/* ── GET /api/payment/verify - used by payment-success page to check DB status ── */
router.get('/verify', async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'order_id required.' });

    const enr = await query(`SELECT * FROM enrollments WHERE order_id = $1`, [order_id]);
    if (!enr.rows.length) return res.status(404).json({ error: 'Order not found.' });

    const e = enr.rows[0];

    // Self-heal: if paid but missing form_token or welcome_sent, fix now
    if (e.status === 'paid' && (!e.form_token || !e.welcome_sent)) {
      let target = e;
      if (!e.form_token) {
        const formToken = crypto.randomBytes(32).toString('hex');
        const fixed = await query(
          `UPDATE enrollments SET form_token = $1 WHERE order_id = $2 AND form_token IS NULL RETURNING *`,
          [formToken, order_id]
        );
        if (fixed.rows.length > 0) target = fixed.rows[0];
      }
      sendAllPaymentEmails(target, { sendInvoice: !e.welcome_sent }).catch(() => {});
    }

    if (e.status === 'paid') onEnrollmentPaid(e).catch(err => console.error('[onEnrollmentPaid]', err.message));

    const refreshed = await query(`SELECT form_token FROM enrollments WHERE order_id = $1`, [order_id]);

    res.json({
      paid:          e.status === 'paid',
      order_id,
      program_name:  e.program_name || '',
      amount:        e.amount || 0,
      student_name:  e.student_name || '',
      referral_code: e.referral_code || null,
      form_token:    refreshed.rows[0]?.form_token || e.form_token || null,
    });
  } catch (err) {
    console.error('[verify GET]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/payment/verify - called from checkout after Razorpay modal success ── */
router.post('/verify', async (req, res) => {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields.' });
    }

    // Check DB first (webhook may have already marked paid)
    const dbCheck = await query(`SELECT * FROM enrollments WHERE order_id = $1`, [order_id]);
    if (dbCheck.rows.length && dbCheck.rows[0].status === 'paid') {
      const enr = dbCheck.rows[0];
      if (!enr.form_token || !enr.welcome_sent) {
        let targetEnr = enr;
        if (!enr.form_token) {
          const formToken = crypto.randomBytes(32).toString('hex');
          const fixed = await query(
            `UPDATE enrollments SET form_token = $1 WHERE order_id = $2 AND form_token IS NULL RETURNING *`,
            [formToken, order_id]
          );
          if (fixed.rows.length > 0) targetEnr = fixed.rows[0];
        }
        sendAllPaymentEmails(targetEnr, { sendInvoice: !enr.welcome_sent }).catch(() => {});
      }
      onEnrollmentPaid(enr).catch(err => console.error('[onEnrollmentPaid]', err.message));
      const refreshedEnr = await query(`SELECT form_token FROM enrollments WHERE order_id = $1`, [order_id]);
      return res.json({ paid: true, order_id, program_name: enr.program_name || '', amount: enr.amount || 0, student_name: enr.student_name || '', referral_code: enr.referral_code || null, form_token: refreshedEnr.rows[0]?.form_token || enr.form_token || null });
    }

    // Verify Razorpay signature
    const generated = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated !== razorpay_signature) {
      console.warn('[verify] Razorpay signature mismatch for order:', order_id);
      return res.status(400).json({ error: 'Payment verification failed.' });
    }

    // Signature valid - mark as paid
    const formToken = crypto.randomBytes(32).toString('hex');
    const updateResult = await query(
      `UPDATE enrollments
       SET status = 'paid', paid_at = NOW(), cf_payment_id = $1,
           form_token = COALESCE(form_token, $3)
       WHERE order_id = $2 AND status != 'paid'
       RETURNING *`,
      [razorpay_payment_id, order_id, formToken]
    );

    if (updateResult.rows.length > 0) {
      sendAllPaymentEmails(updateResult.rows[0]).catch(() => {});
      onEnrollmentPaid(updateResult.rows[0]).catch(err => console.error('[onEnrollmentPaid]', err.message));
    }

    const enr = await query(`SELECT * FROM enrollments WHERE order_id = $1`, [order_id]);
    res.json({
      paid:          true,
      order_id,
      program_name:  enr.rows[0]?.program_name || '',
      amount:        enr.rows[0]?.amount || 0,
      student_name:  enr.rows[0]?.student_name || '',
      referral_code: enr.rows[0]?.referral_code || null,
      form_token:    enr.rows[0]?.form_token || null,
    });

  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});


/* ── GET /api/payment/programs ─────────────────────────────
   DB-backed catalogue for the checkout page: price/mrp/branding all
   come from the `programs` table (i.e. admin edits take effect with
   no code deploy), decorated with a fixed accent->gradient map and a
   category-based icon fallback so every row renders sensibly even if
   an admin hasn't set icon_class/accent explicitly. ── */
const ACCENT_GRADIENTS = {
  blue:   'linear-gradient(145deg,#0369A1,#0284C7)',
  teal:   'linear-gradient(145deg,#0F766E,#0D9488)',
  purple: 'linear-gradient(145deg,#6D28D9,#7C3AED)',
  indigo: 'linear-gradient(145deg,#4338CA,#6366F1)',
  orange: 'linear-gradient(145deg,#C2410C,#EA580C)',
  green:  'linear-gradient(145deg,#15803D,#16A34A)',
};
const DEFAULT_ICON_BY_CATEGORY = { 'test-series': 'fa-clipboard-list', interview: 'fa-user-tie', course: 'fa-book' };

router.get('/programs', async (req, res) => {
  const out = {};
  for (const [slug, p] of Object.entries(FALLBACK_PROGRAMS)) {
    out[slug] = { name: p.name, price: p.price, mrp: p.mrp, icon: 'fa-clipboard-list', color: ACCENT_GRADIENTS.blue, thumb: null };
  }
  try {
    const result = await query(
      `SELECT slug, title, price, mrp, thumbnail_url, accent, icon_class, category
       FROM programs WHERE price IS NOT NULL AND mrp IS NOT NULL`
    );
    for (const row of result.rows) {
      out[row.slug] = {
        name:  row.title,
        price: row.price,
        mrp:   row.mrp,
        icon:  row.icon_class || DEFAULT_ICON_BY_CATEGORY[row.category] || 'fa-clipboard-list',
        color: ACCENT_GRADIENTS[row.accent] || ACCENT_GRADIENTS.blue,
        thumb: row.thumbnail_url || null,
      };
    }
  } catch (err) {
    console.error('[GET /programs] DB error, serving hardcoded fallback catalogue only:', err.message);
  }
  res.json(out);
});

/* ── POST /api/payment/admin/backfill-referral-codes ─────────
   One-time/idempotent: assigns a referral code to every paid
   enrollment that doesn't have one yet (learners who paid before
   the referral program existed). Safe to re-run. ── */
router.post('/admin/backfill-referral-codes', protect, async (req, res) => {
  try {
    const pending = await query(
      `SELECT * FROM enrollments WHERE status = 'paid' AND referral_code IS NULL`
    );
    let assigned = 0;
    for (const enrollment of pending.rows) {
      const code = await ensureReferralCode(enrollment);
      if (code) assigned++;
    }
    res.json({ success: true, assigned, total_checked: pending.rows.length });
  } catch (err) {
    console.error('[backfill-referral-codes]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/payment/my-referral-code ───────────────────────
   Returns the logged-in learner's referral code (auto-generated
   from their most recent paid enrollment if missing), plus a
   summary of credits earned/pending. ── */
router.get('/my-referral-code', protectLearner, async (req, res) => {
  try {
    const learnerRes = await query(`SELECT email, phone FROM learners WHERE id = $1`, [req.learner.id]);
    if (!learnerRes.rows.length) return res.status(404).json({ error: 'Learner not found.' });
    const { email, phone } = learnerRes.rows[0];

    // Backfill linkage in case this learner has paid enrollments not yet tied to their account
    await query(
      `UPDATE enrollments SET learner_id = $1
       WHERE learner_id IS NULL AND status = 'paid' AND (student_email = $2 OR student_phone = $3)`,
      [req.learner.id, email, phone]
    );

    const enrollmentRes = await query(
      `SELECT * FROM enrollments WHERE status = 'paid' AND (learner_id = $1 OR student_email = $2 OR student_phone = $3)
       ORDER BY paid_at DESC LIMIT 1`,
      [req.learner.id, email, phone]
    );
    if (!enrollmentRes.rows.length) {
      return res.json({ referral_code: null, total_earned: 0, total_pending: 0 });
    }

    const enrollment = enrollmentRes.rows[0];
    const code = await ensureReferralCode(enrollment);

    const creditRows = await query(
      `SELECT rc.status, rc.amount FROM referral_credits rc
       JOIN enrollments ref ON ref.order_id = rc.referrer_order_id
       WHERE ref.learner_id = $1 OR ref.student_email = $2 OR ref.student_phone = $3`,
      [req.learner.id, email, phone]
    );
    let total_earned = 0, total_pending = 0;
    creditRows.rows.forEach(c => {
      if (c.status === 'paid') total_earned += c.amount;
      else if (c.status === 'pending') total_pending += c.amount;
    });

    res.json({ referral_code: code, total_earned, total_pending });
  } catch (err) {
    console.error('[my-referral-code]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/payment/admin/referral-codes ───────────────────
   Lists every paid learner's referral code (deduped to their most
   recent paid enrollment) so the admin can review before manually
   triggering announcement emails. ── */
router.get('/admin/referral-codes', protect, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (COALESCE(learner_id::text, student_email))
              order_id, student_name, student_email, student_phone,
              program_name, referral_code, referral_email_sent, referral_email_sent_at, paid_at
       FROM enrollments
       WHERE status = 'paid' AND referral_code IS NOT NULL
       ORDER BY COALESCE(learner_id::text, student_email), paid_at DESC`
    );
    res.json({ learners: result.rows });
  } catch (err) {
    console.error('[admin/referral-codes]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/payment/admin/referral-codes/:order_id/send-email ── */
router.post('/admin/referral-codes/:order_id/send-email', protect, async (req, res) => {
  try {
    const enr = await query(`SELECT * FROM enrollments WHERE order_id = $1 AND status = 'paid'`, [req.params.order_id]);
    if (!enr.rows.length) return res.status(404).json({ error: 'Paid enrollment not found.' });

    const enrollment = enr.rows[0];
    if (!enrollment.referral_code) {
      enrollment.referral_code = await ensureReferralCode(enrollment);
    }
    if (!enrollment.student_email) return res.status(400).json({ error: 'This learner has no email on file.' });

    await sendReferralCodeEmail(enrollment);
    await query(
      `UPDATE enrollments SET referral_email_sent = TRUE, referral_email_sent_at = NOW() WHERE order_id = $1`,
      [enrollment.order_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[send-referral-email]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/* ── GET /api/payment/admin/referral-credits ─────────────── */
router.get('/admin/referral-credits', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? `WHERE rc.status = $1` : '';
    const params = status ? [status] : [];
    const result = await query(
      `SELECT rc.id, rc.amount, rc.status, rc.created_at, rc.paid_at,
              rc.referrer_order_id, rc.referred_order_id,
              ref.student_name AS referrer_name, ref.student_phone AS referrer_phone, ref.student_email AS referrer_email,
              red.student_name AS referred_name, red.program_name AS referred_program
       FROM referral_credits rc
       JOIN enrollments ref ON ref.order_id = rc.referrer_order_id
       JOIN enrollments red ON red.order_id = rc.referred_order_id
       ${where}
       ORDER BY rc.created_at DESC`,
      params
    );
    res.json({ credits: result.rows });
  } catch (err) {
    console.error('[admin/referral-credits]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── PATCH /api/payment/admin/referral-credits/:id/mark-paid ── */
router.patch('/admin/referral-credits/:id/mark-paid', protect, async (req, res) => {
  try {
    const result = await query(
      `UPDATE referral_credits SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status != 'paid' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Credit not found or already paid.' });
    res.json({ success: true, credit: result.rows[0] });
  } catch (err) {
    console.error('[mark-paid]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── PATCH /api/payment/admin/referral-credits/:id/reject ───
   For claims that turn out to be fraudulent/invalid (e.g. fake
   screenshot) - keeps them out of the pending queue without
   marking them paid. ── */
router.patch('/admin/referral-credits/:id/reject', protect, async (req, res) => {
  try {
    const result = await query(
      `UPDATE referral_credits SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Credit not found or not pending.' });
    res.json({ success: true, credit: result.rows[0] });
  } catch (err) {
    console.error('[reject-referral-credit]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
// Shared with enrollment-account.js's admin "mark as paid" flow, so a
// manually-created enrollment triggers the exact same welcome
// email/referral-code/duplicate-cleanup pipeline a real Razorpay payment does.
module.exports.sendAllPaymentEmails = sendAllPaymentEmails;
module.exports.onEnrollmentPaid     = onEnrollmentPaid;
module.exports.getProgramData       = getProgramData;

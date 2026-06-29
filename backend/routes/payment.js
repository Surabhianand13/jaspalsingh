/* ============================================================
   routes/payment.js  -  Razorpay Payment Gateway
   Dr. Jaspal Singh Website  -  jaspalsingh.in
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const crypto  = require('crypto');
const { sendInvoiceEmail, sendWelcomePaymentEmail, sendAdminPaymentNotification } = require('../services/paymentEmailService');

/* ── Coupon catalogue ────────────────────────────────────── */
const COUPONS = {
  'FIRST':     { discountedPrice: 1,    label: 'First-time offer' },
  'JASPALSIR': { discount: 1000,        label: 'Get Rs 1,000 off' },
  'JASPAL200': { discount: 1200,        label: 'Special Rs 1,200 off' },
};

function applyCoupon(coupon, originalPrice) {
  if (!coupon) return { finalPrice: originalPrice, discount: 0, label: null };
  const c = COUPONS[coupon.toUpperCase()];
  if (!c) return null;
  const discountAmt = c.discountedPrice != null
    ? originalPrice - c.discountedPrice
    : c.discount;
  return {
    finalPrice: originalPrice - discountAmt,
    discount:   discountAmt,
    label:      c.label,
  };
}

/* ── Program catalogue ───────────────────────────────────── */
const PROGRAMS = {
  'rssb-jen-diploma-test-series': {
    name:      'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline',
    shortName: 'RSSB JE 2026 Test Series',
    price:     3799,
    mrp:       7999,
  },
  'rssb-jen-degree-test-series': {
    name:      'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline',
    shortName: 'RSSB JE 2026 Test Series',
    price:     3999,
    mrp:       7999,
  },
  'rpsc-ae-interview': {
    name:      'RPSC AE 2024 - Interview Guidance Programme',
    shortName: 'RPSC AE Interview Guidance',
    price:     4999,
    mrp:       8999,
  },
  'rssb-je-omr-degree-test-series': {
    name:      'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree (Home-Based OMR Test Series)',
    shortName: 'RSSB JE 2026 OMR Degree Test Series',
    price:     1999,
    mrp:       2999,
  },
  'rssb-jen-omr-diploma-test-series': {
    name:      'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Diploma (Home-Based OMR Test Series)',
    shortName: 'RSSB JE 2026 OMR Diploma Test Series',
    price:     1999,
    mrp:       2999,
  },
};

/* ── Razorpay instance ───────────────────────────────────── */
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ── POST /api/payment/validate-coupon ───────────────────── */
router.post('/validate-coupon', (req, res) => {
  const { coupon_code, program_slug } = req.body;
  if (!coupon_code || !program_slug) return res.status(400).json({ error: 'coupon_code and program_slug required.' });

  const program = PROGRAMS[program_slug];
  if (!program) return res.status(400).json({ error: 'Invalid program.' });

  const result = applyCoupon(coupon_code, program.price);
  if (!result) return res.status(400).json({ valid: false, error: 'Invalid coupon code.' });

  res.json({ valid: true, final_price: result.finalPrice, discount: result.discount, label: result.label });
});

/* ── POST /api/payment/create-order ─────────────────────── */
router.post('/create-order', async (req, res) => {
  try {
    const { program_slug, name, email, phone, coupon_code } = req.body;

    if (!program_slug || !name || !email || !phone) {
      return res.status(400).json({ error: 'name, email, phone and program_slug are required.' });
    }

    const program = PROGRAMS[program_slug];
    if (!program) return res.status(400).json({ error: 'Invalid program.' });

    let finalPrice = program.price;
    let couponApplied = null;
    if (coupon_code) {
      const coup = applyCoupon(coupon_code, program.price);
      if (coup) { finalPrice = coup.finalPrice; couponApplied = coupon_code.toUpperCase(); }
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
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone, status, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       ON CONFLICT (order_id) DO NOTHING`,
      [order_id, program_slug, program.name, finalPrice, name, email, phone, couponApplied]
    );

    res.json({
      order_id,
      razorpay_order_id:  rzpOrder.id,
      razorpay_key_id:    process.env.RAZORPAY_KEY_ID,
      amount:             finalPrice,
      program_name:       program.name,
    });

  } catch (err) {
    console.error('[create-order]', err);
    res.status(500).json({ error: 'Payment gateway error. Please try again.' });
  }
});

/* ── sendAllPaymentEmails ─────────────────────────────────── */
async function sendAllPaymentEmails(enrollment, { sendInvoice = true } = {}) {
  if (sendInvoice) {
    sendInvoiceEmail(enrollment).catch(e => console.error('[invoice email]', e.message));
  }

  try {
    await sendWelcomePaymentEmail(enrollment);
    await query(
      `UPDATE enrollments SET welcome_sent = TRUE WHERE order_id = $1`,
      [enrollment.order_id]
    );
    console.log(`[welcome email] sent OK for ${enrollment.order_id}`);
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

    res.json({
      paid:         e.status === 'paid',
      order_id,
      program_name: e.program_name || '',
      amount:       e.amount || 0,
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
      return res.json({ paid: true, order_id, program_name: enr.program_name || '', amount: enr.amount || 0 });
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
    }

    const enr = await query(`SELECT * FROM enrollments WHERE order_id = $1`, [order_id]);
    res.json({
      paid:         true,
      order_id,
      program_name: enr.rows[0]?.program_name || '',
      amount:       enr.rows[0]?.amount || 0,
    });

  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/payment/webhook ───────────────────────────── */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig  = req.headers['x-razorpay-signature'];
    if (!sig) {
      console.warn('[webhook] Missing Razorpay signature header');
      return res.status(401).json({ error: 'Missing signature.' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(req.body.toString())
      .digest('hex');

    if (sig !== expected) {
      console.warn('[webhook] Razorpay signature mismatch');
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const event = JSON.parse(req.body);

    // Handle payment.captured (successful payment)
    if (event.event === 'payment.captured') {
      const payment    = event.payload.payment.entity;
      const ourOrderId = payment.notes?.jsp_order_id;

      if (!ourOrderId) {
        console.warn('[webhook] No jsp_order_id in payment notes:', payment.id);
        return res.json({ status: 'ok' });
      }

      const formToken = crypto.randomBytes(32).toString('hex');
      const result = await query(
        `UPDATE enrollments
         SET status = 'paid', paid_at = NOW(),
             cf_payment_id = $1,
             form_token = COALESCE(form_token, $2)
         WHERE order_id = $3 AND status != 'paid'
         RETURNING *`,
        [payment.id, formToken, ourOrderId]
      );
      if (result.rows.length > 0) {
        sendAllPaymentEmails(result.rows[0], { sendInvoice: false }).catch(() => {});
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).json({ error: 'Webhook error.' });
  }
});

/* ── GET /api/payment/programs ───────────────────────────── */
router.get('/programs', (req, res) => {
  res.json(PROGRAMS);
});

module.exports = router;

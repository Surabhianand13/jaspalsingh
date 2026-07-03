/* ============================================================
   routes/payment-webhook.js  -  Razorpay Webhook Handler
   Registered in server.js BEFORE express.json() so that
   req.body is the raw Buffer needed for HMAC verification.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { query } = require('../config/db');
const { sendInvoiceEmail, sendWelcomePaymentEmail, sendAdminPaymentNotification } = require('../services/paymentEmailService');
const { sendReferralCodeEmail } = require('../services/paymentEmailService');

async function ensureReferralCode(enrollment) {
  if (enrollment.referral_code) return enrollment.referral_code;
  const phoneDigits = (enrollment.student_phone || '').replace(/\D/g, '').slice(-4) || '0000';
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `REF${phoneDigits}${suffix}`;
    try {
      const result = await query(
        `UPDATE enrollments SET referral_code = $1 WHERE order_id = $2 AND referral_code IS NULL RETURNING referral_code`,
        [code, enrollment.order_id]
      );
      if (result.rows.length) return result.rows[0].referral_code;
      const existing = await query(`SELECT referral_code FROM enrollments WHERE order_id = $1`, [enrollment.order_id]);
      return existing.rows[0]?.referral_code || null;
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  return null;
}

async function recordReferralCredit(enrollment) {
  if (!enrollment.referred_by) return;
  try {
    const referrer = await query(
      `SELECT order_id, student_phone, student_email, learner_id FROM enrollments WHERE referral_code = $1 AND status = 'paid'`,
      [enrollment.referred_by]
    );
    if (!referrer.rows.length) return;
    const ref = referrer.rows[0];
    if (ref.order_id === enrollment.order_id) return;
    const samePhone   = enrollment.student_phone && ref.student_phone && ref.student_phone.replace(/\D/g, '').slice(-10) === enrollment.student_phone.replace(/\D/g, '').slice(-10);
    const sameEmail   = enrollment.student_email && ref.student_email && ref.student_email.toLowerCase() === enrollment.student_email.toLowerCase();
    const sameLearner = enrollment.learner_id && ref.learner_id && Number(enrollment.learner_id) === Number(ref.learner_id);
    if (samePhone || sameEmail || sameLearner) return;
    await query(
      `INSERT INTO referral_credits (referrer_order_id, referred_order_id, amount, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (referred_order_id) DO NOTHING`,
      [ref.order_id, enrollment.order_id, 100]
    );
  } catch (err) {
    console.error('[recordReferralCredit]', err.message);
  }
}

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

async function onEnrollmentPaid(enrollment) {
  await ensureReferralCode(enrollment);
  await recordReferralCredit(enrollment);
  await cancelDuplicatePendingEnrollments(enrollment);
}

async function sendAllPaymentEmails(enrollment, { sendInvoice = true } = {}) {
  if (sendInvoice) {
    sendInvoiceEmail(enrollment).catch(e => console.error('[invoice email]', e.message));
  }
  try {
    await sendWelcomePaymentEmail(enrollment);
    await query(`UPDATE enrollments SET welcome_sent = TRUE WHERE order_id = $1`, [enrollment.order_id]);
    console.log(`[welcome email] sent OK for ${enrollment.order_id}`);
  } catch (e) {
    console.error(`[welcome email] FAILED for ${enrollment.order_id}:`, e.message);
  }
  sendAdminPaymentNotification(enrollment).catch(e => console.error('[admin notify]', e.message));
}

/* ── POST /api/payment/webhook ── */
router.post('/', async (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    if (!sig) {
      console.warn('[webhook] Missing Razorpay signature header');
      return res.status(401).json({ error: 'Missing signature.' });
    }

    // Razorpay signs with RAZORPAY_WEBHOOK_SECRET (set in Razorpay dashboard),
    // NOT the API key secret.
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body) // req.body is a raw Buffer here - critical for correct HMAC
      .digest('hex');

    if (sig !== expected) {
      console.warn('[webhook] Razorpay signature mismatch - check RAZORPAY_WEBHOOK_SECRET env var');
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const event = JSON.parse(req.body);

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
        console.log(`[webhook] Marked paid: ${ourOrderId}`);
        sendAllPaymentEmails(result.rows[0], { sendInvoice: false }).catch(() => {});
        onEnrollmentPaid(result.rows[0]).catch(err => console.error('[onEnrollmentPaid]', err.message));
      } else {
        console.log(`[webhook] Already paid or not found: ${ourOrderId}`);
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).json({ error: 'Webhook error.' });
  }
});

module.exports = router;

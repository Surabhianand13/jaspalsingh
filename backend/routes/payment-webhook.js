/* ============================================================
   routes/payment-webhook.js  -  Razorpay Webhook Handler
   Registered in server.js BEFORE express.json() so that
   req.body is the raw Buffer needed for HMAC verification.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { query } = require('../config/db');

// Shared with routes/payment.js (which also exports these for enrollment-account.js) -
// this file used to keep its own duplicate copies, which meant a change wired into
// only payment.js's onEnrollmentPaid silently never ran on this, the primary
// payment-confirmation path (Razorpay webhooks fire here first; POST/GET /verify
// are the self-heal fallback for when a webhook is delayed or missed).
const { sendAllPaymentEmails, onEnrollmentPaid } = require('./payment');

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

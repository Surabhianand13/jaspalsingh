/* ============================================================
   routes/payment.js  -  Cashfree Payment Gateway
   Dr. Jaspal Singh Website  -  jaspalsingh.in
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const https   = require('https');
const crypto  = require('crypto');
const { sendInvoiceEmail, sendWelcomePaymentEmail, sendAdminPaymentNotification } = require('../services/paymentEmailService');

/* ── Coupon catalogue ────────────────────────────────────── */
const COUPONS = {
  'FIRST':     { discountedPrice: 1,    label: 'First-time offer' },
  'JASPALSIR': { discount: 1000,        label: 'Get Rs 1,000 off' },
};

function applyCoupon(coupon, originalPrice) {
  if (!coupon) return { finalPrice: originalPrice, discount: 0, label: null };
  const c = COUPONS[coupon.toUpperCase()];
  if (!c) return null; // invalid
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
};

/* ── Cashfree API helper ─────────────────────────────────── */
function cashfreeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cashfree.com',
      path,
      method,
      headers: {
        'x-client-id':     process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version':   '2023-08-01',
        'Content-Type':    'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Invalid JSON from Cashfree')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

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

    // Apply coupon if provided
    let finalPrice = program.price;
    let couponApplied = null;
    if (coupon_code) {
      const coup = applyCoupon(coupon_code, program.price);
      if (coup) { finalPrice = coup.finalPrice; couponApplied = coupon_code.toUpperCase(); }
    }

    // Unique order ID
    const order_id = `JSP-${program_slug.slice(0,6).toUpperCase()}-${Date.now()}`;

    // Always use www version for return URL to avoid DNS issues with root domain
    const frontendUrl = 'https://www.jaspalsingh.in';

    const payload = {
      order_id,
      order_amount:   finalPrice,
      order_currency: 'INR',
      customer_details: {
        customer_id:    `CUST-${Date.now()}`,
        customer_name:  name,
        customer_email: email,
        customer_phone: phone.replace(/\D/g, '').slice(-10),
      },
      order_meta: {
        return_url: `${frontendUrl}/payment-success/?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL || 'https://jaspalsingh.onrender.com'}/api/payment/webhook`,
      },
      order_note: program.shortName,
    };

    const cf = await cashfreeRequest('POST', '/pg/orders', payload);

    if (cf.status !== 200) {
      console.error('[Cashfree create-order error]', cf.body);
      return res.status(502).json({ error: 'Payment gateway error. Please try again.' });
    }

    // Store enrollment record as pending
    await query(
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone, status, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       ON CONFLICT (order_id) DO NOTHING`,
      [order_id, program_slug, program.name, finalPrice, name, email, phone, couponApplied]
    );

    res.json({
      order_id,
      payment_session_id: cf.body.payment_session_id,
      program_name: program.name,
      amount: program.price,
    });

  } catch (err) {
    console.error('[create-order]', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ── GET /api/payment/verify ─────────────────────────────── */
router.get('/verify', async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'order_id required.' });

    // Check DB first - webhook may have already confirmed and marked paid
    const dbCheck = await query(
      `SELECT * FROM enrollments WHERE order_id = $1`, [order_id]
    );
    if (dbCheck.rows.length && dbCheck.rows[0].status === 'paid') {
      const enr = dbCheck.rows[0];
      return res.json({
        paid:         true,
        order_id,
        program_name: enr.program_name || '',
        amount:       enr.amount || 0,
      });
    }

    // DB not yet updated - ask Cashfree directly
    const cf = await cashfreeRequest('GET', `/pg/orders/${order_id}`);

    if (cf.status !== 200) {
      return res.status(502).json({ error: 'Could not verify payment.' });
    }

    const order = cf.body;
    const paid  = order.order_status === 'PAID';

    if (paid) {
      const formToken = crypto.randomBytes(32).toString('hex');
      const updateResult = await query(
        `UPDATE enrollments
         SET status = 'paid', paid_at = NOW(), cf_payment_id = $1,
             form_token = COALESCE(form_token, $3)
         WHERE order_id = $2 AND status != 'paid'
         RETURNING *`,
        [order.cf_order_id || order_id, order_id, formToken]
      );

      if (updateResult.rows.length > 0) {
        const enrollment = updateResult.rows[0];
        sendInvoiceEmail(enrollment).catch(e => console.error('[invoice email]', e.message));
        sendWelcomePaymentEmail(enrollment).catch(e => console.error('[welcome email]', e.message));
        sendAdminPaymentNotification(enrollment).catch(e => console.error('[admin notify]', e.message));
      }
    }

    // Fetch enrollment details
    const enr = await query(
      `SELECT * FROM enrollments WHERE order_id = $1`,
      [order_id]
    );

    res.json({
      paid,
      order_status: order.order_status,
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
    // Verify Cashfree webhook signature
    const ts  = req.headers['x-webhook-timestamp'];
    const sig = req.headers['x-webhook-signature'];
    if (!ts || !sig) {
      console.warn('[webhook] Missing signature headers');
      return res.status(401).json({ error: 'Missing signature.' });
    }
    const expected = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(ts + req.body.toString())
      .digest('base64');
    if (sig !== expected) {
      console.warn('[webhook] Signature mismatch');
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const event = JSON.parse(req.body);
    if (event?.data?.order?.order_status === 'PAID') {
      const order_id  = event.data.order.order_id;
      const formToken = crypto.randomBytes(32).toString('hex');
      const result = await query(
        `UPDATE enrollments
         SET status = 'paid', paid_at = NOW(),
             form_token = COALESCE(form_token, $2)
         WHERE order_id = $1 AND status != 'paid'
         RETURNING *`,
        [order_id, formToken]
      );
      if (result.rows.length > 0) {
        const enrollment = result.rows[0];
        sendWelcomePaymentEmail(enrollment).catch(e => console.error('[webhook welcome email]', e.message));
        sendAdminPaymentNotification(enrollment).catch(e => console.error('[webhook admin notify]', e.message));
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

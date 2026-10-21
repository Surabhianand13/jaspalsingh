/* ============================================================
   routes/icici-payment.js  -  ICICI Bank Orange PG (EMI only)
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Integration mode: Standard Redirection (payType = "0")
   Shown only for programs priced above Rs 5000.
   Coupon/referral discounts are not supported in the EMI flow;
   learners who want a discount should use the standard Razorpay option.

   Flow:
     1. Frontend POSTs learner details to POST /api/icici/create-order
     2. Backend builds ICICI initiateSale request, gets redirectURI + tranCtx
     3. Backend returns { redirect_url, order_id } to frontend
     4. Frontend redirects browser to redirect_url
     5. Learner pays on ICICI-hosted page
     6. ICICI browser-POSTs payment result to POST /api/icici/return (returnURL)
     7. Backend verifies hash, marks enrollment paid, redirects browser
   ============================================================ */

const express   = require('express');
const router    = express.Router();
const https     = require('https');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/db');
const { sendAllPaymentEmails, onEnrollmentPaid, getProgramData } = require('./payment');
const { optionalLearner } = require('../middleware/learnerAuth');
const { isObviousTestSubmission } = require('../utils/spamFilter');
const { verifyTurnstile } = require('../utils/turnstile');

const ICICI_MID          = '100000000539179';
const ICICI_AGGREGATOR   = 'A100000000539178';
const ICICI_INITIATE_URL = 'https://pgpay.icicibank.com/pg/api/v2/initiateSale';
const BACKEND_URL        = 'https://jaspalsingh.onrender.com';
const FRONTEND_URL       = 'https://www.jaspalsingh.in';
const EMI_MIN_PRICE      = 5000;

const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many checkout attempts. Please wait a few minutes and try again.' },
});

/* ── HMAC-SHA256 secureHash for ICICI ───────────────────────
   Sort all keys alphabetically (excluding secureHash itself),
   concatenate values in sorted-key order, then HMAC-SHA256. ── */
function buildSecureHash(fields) {
  const secret = process.env.ICICI_PG_SECRET;
  if (!secret) throw new Error('ICICI_PG_SECRET env var not set');
  const sortedKeys = Object.keys(fields).sort();
  const plaintext  = sortedKeys.map(k => fields[k]).join('');
  return crypto.createHmac('sha256', secret).update(plaintext).digest('hex');
}

function verifySecureHash(fields, providedHash) {
  try {
    const expected = buildSecureHash(fields);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from((providedHash || '').toLowerCase().padEnd(expected.length, '0'), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ── Server-to-server POST to ICICI API ── */
function iciciPost(payload) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const urlObj  = new URL(ICICI_INITIATE_URL);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Non-JSON from ICICI: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── txnDate format: YYYYMMDDHHMMISS (UTC) ── */
function iciciTxnDate() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

/* ── POST /api/icici/create-order ─────────────────────────── */
router.post('/create-order', createOrderLimiter, optionalLearner, async (req, res) => {
  // Fail fast before consuming the Turnstile token so the frontend can
  // fall back to Pay Now without needing to wait for Turnstile to reset.
  if (!process.env.ICICI_PG_SECRET) {
    return res.status(503).json({
      error: 'EMI payment is temporarily unavailable. Please use the Pay Now button instead.',
      skip_reset: true,
    });
  }

  try {
    const { program_slug, name, email: rawEmail, phone: rawPhone, turnstile_token } = req.body;

    if (!program_slug || !name || !rawEmail || !rawPhone) {
      return res.status(400).json({ error: 'name, email, phone and program_slug are required.' });
    }

    const email = rawEmail.toLowerCase().trim();
    const phone = rawPhone.replace(/\D/g, '').slice(-10);

    const origin = req.headers.origin || '';
    const isTranslateProxy = /\.translate\.goog$/.test(origin);
    const humanCheck = isTranslateProxy || await verifyTurnstile(turnstile_token, req.ip);
    if (!humanCheck) {
      return res.status(400).json({ error: 'Verification failed. Please refresh the page and try again.' });
    }

    if (isObviousTestSubmission({ name, email, phone })) {
      return res.status(400).json({ error: 'Please enter your real name, email and mobile number.' });
    }

    const program = await getProgramData(program_slug);
    if (!program) return res.status(400).json({ error: 'Invalid program.' });

    if (program.price < EMI_MIN_PRICE) {
      return res.status(400).json({ error: 'EMI option is only available for programs priced above Rs ' + EMI_MIN_PRICE + '.' });
    }

    if (program.pricingTiers) {
      return res.status(400).json({ error: 'EMI payment is not available for tiered-pricing programs. Please use the standard payment option.' });
    }

    const finalPrice = program.price;

    // order_id: ICICI-{6-char-slug}-{timestamp}
    const order_id = 'ICICI-' + program_slug.slice(0, 6).toUpperCase() + '-' + Date.now();

    // merchantTxnNo: alphanumeric only, max 20 chars (ICICI requirement)
    const merchantTxnNo = order_id.replace(/-/g, '').slice(0, 20);

    await query(
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone, status, learner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       ON CONFLICT (order_id) DO NOTHING`,
      [order_id, program_slug, program.name, finalPrice, name, email, phone, req.learner?.id || null]
    );

    // Store merchantTxnNo in cf_payment_id for the return callback lookup
    await query(
      `UPDATE enrollments SET cf_payment_id = $1 WHERE order_id = $2`,
      ['icici_pending:' + merchantTxnNo, order_id]
    );

    const returnURL = BACKEND_URL + '/api/icici/return';
    const txnDate   = iciciTxnDate();

    const requestFields = {
      addlParam1:       order_id,
      aggregatorID:     ICICI_AGGREGATOR,
      amount:           finalPrice.toFixed(2),
      currencyCode:     '356',
      customerEmailID:  email,
      customerMobileNo: '91' + phone,
      customerName:     name,
      merchantId:       ICICI_MID,
      merchantTxnNo,
      payType:          '0',
      returnURL,
      transactionType:  'SALE',
      txnDate,
    };

    const secureHash = buildSecureHash(requestFields);
    const iciResponse = await iciciPost({ ...requestFields, secureHash });

    if (iciResponse.responseCode !== 'R1000' || !iciResponse.redirectURI || !iciResponse.tranCtx) {
      console.error('[icici/create-order] ICICI API error:', JSON.stringify(iciResponse));
      return res.status(502).json({ error: 'EMI gateway error. Please use the standard payment option or try again later.' });
    }

    const redirect_url = iciResponse.redirectURI + '?tranCtx=' + encodeURIComponent(iciResponse.tranCtx);

    res.json({ redirect_url, order_id });

  } catch (err) {
    console.error('[icici/create-order]', err.message || err);
    res.status(500).json({ error: 'Server error. Please try the standard payment option.' });
  }
});

/* ── POST /api/icici/return ─────────────────────────────────
   ICICI browser-POSTs the payment result to this URL.
   global express.urlencoded already parses req.body.
   Must redirect the browser (302) at the end. ── */
router.post('/return', async (req, res) => {
  try {
    const params = req.body || {};
    console.log('[icici/return] params:', JSON.stringify(params));

    // Build field map without the hash field for verification
    const providedHash = params.securehash || params.secureHash || '';
    const fieldsForVerify = {};
    for (const [k, v] of Object.entries(params)) {
      const lk = k.toLowerCase();
      if (lk !== 'securehash' && lk !== 'securehash') fieldsForVerify[k] = v;
    }

    // Verify hash - but do NOT block if ICICI_PG_SECRET not set (env var issue)
    if (process.env.ICICI_PG_SECRET) {
      if (!verifySecureHash(fieldsForVerify, providedHash)) {
        console.error('[icici/return] secureHash mismatch - possible tampering. Params:', JSON.stringify(params));
        return res.redirect(FRONTEND_URL + '/payment-success/?icici_error=hash');
      }
    } else {
      console.warn('[icici/return] ICICI_PG_SECRET not set - skipping hash verification');
    }

    // Success: responseCode starts with "0000" or equals "000"
    const rc        = params.responseCode || '';
    const isSuccess = rc.startsWith('0000') || rc === '000';

    // Locate enrollment by addlParam1 (our order_id) then by merchantTxnNo
    let enrollment = null;
    const orderId        = params.addlParam1 || null;
    const merchantTxnNo  = params.merchantTxnNo || null;

    if (orderId) {
      const r = await query(`SELECT * FROM enrollments WHERE order_id = $1`, [orderId]);
      enrollment = r.rows[0] || null;
    }
    if (!enrollment && merchantTxnNo) {
      const r = await query(`SELECT * FROM enrollments WHERE cf_payment_id = $1`, ['icici_pending:' + merchantTxnNo]);
      enrollment = r.rows[0] || null;
    }

    if (!enrollment) {
      console.error('[icici/return] Enrollment not found for order_id:', orderId, 'txnNo:', merchantTxnNo);
      return res.redirect(FRONTEND_URL + '/payment-success/?icici_error=notfound');
    }

    if (!isSuccess) {
      console.log('[icici/return] Payment failed/cancelled. order_id:', enrollment.order_id, 'rc:', rc, 'desc:', params.respdescription);
      return res.redirect(
        FRONTEND_URL + '/checkout/?program=' + encodeURIComponent(enrollment.program_slug) + '&icici_failed=1'
      );
    }

    // Mark enrollment as paid
    const formToken     = crypto.randomBytes(32).toString('hex');
    const paymentRef    = params.paymentID || params.txnID || merchantTxnNo || 'icici';
    const updateResult  = await query(
      `UPDATE enrollments
       SET status = 'paid', paid_at = NOW(),
           cf_payment_id = $1,
           form_token = COALESCE(form_token, $3)
       WHERE order_id = $2 AND status != 'paid'
       RETURNING *`,
      [paymentRef, enrollment.order_id, formToken]
    );

    if (updateResult.rows.length > 0) {
      sendAllPaymentEmails(updateResult.rows[0]).catch(e => console.error('[icici/return email]', e.message));
      onEnrollmentPaid(updateResult.rows[0]).catch(e => console.error('[icici/return onPaid]', e.message));
    }

    res.redirect(FRONTEND_URL + '/payment-success/?order_id=' + encodeURIComponent(enrollment.order_id));

  } catch (err) {
    console.error('[icici/return] Server error:', err.message || err);
    res.redirect(FRONTEND_URL + '/payment-success/?icici_error=server');
  }
});

/* ── GET /api/icici/available ────────────────────────────────
   Used by checkout page on load to decide whether to show the
   EMI section. Returns true only when both the secret and the
   ICICI_EMI_ENABLED flag are set, so EMI can be toggled from
   the Render dashboard without a code deploy. ── */
router.get('/available', (req, res) => {
  res.json({
    available: process.env.ICICI_EMI_ENABLED === 'true' && !!process.env.ICICI_PG_SECRET,
  });
});

/* ── GET /api/icici/status/:order_id ───────────────────────
   Thin status check used by the success page if needed.
   The main /api/payment/verify GET already handles generic
   order verification - this is a lightweight alternative. ── */
router.get('/status/:order_id', async (req, res) => {
  try {
    const r = await query(
      `SELECT status, program_name, amount, student_name, form_token, referral_code FROM enrollments WHERE order_id = $1`,
      [req.params.order_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Order not found.' });
    const e = r.rows[0];
    res.json({
      paid:          e.status === 'paid',
      order_id:      req.params.order_id,
      program_name:  e.program_name,
      amount:        e.amount,
      student_name:  e.student_name,
      form_token:    e.form_token,
      referral_code: e.referral_code || null,
    });
  } catch (err) {
    console.error('[icici/status]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

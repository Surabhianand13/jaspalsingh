/* ============================================================
   middleware/tallyAuth.js  -  Tally Webhook Signature Verification
   Registered with express.raw() BEFORE express.json(), same pattern
   as the Razorpay webhook, so we can HMAC the exact bytes Tally signed.

   Configure a Signing Secret in each Tally form's webhook settings,
   then set the same value as TALLY_SIGNING_SECRET in Render env vars.
   Tally sends it as the "Tally-Signature" header (base64 HMAC-SHA256
   of the raw request body).

   If TALLY_SIGNING_SECRET is not set, requests are still processed
   (so existing forms keep working) but a warning is logged - webhook
   authenticity is NOT verified until the secret is configured.
   ============================================================ */

const crypto = require('crypto');

function verifyTallySignature(req, res, next) {
  const secret = process.env.TALLY_SIGNING_SECRET;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  if (secret) {
    const signature = req.headers['tally-signature'];
    if (!signature) {
      console.warn('[tally-auth] Missing Tally-Signature header - rejecting');
      return res.status(401).json({ error: 'Missing signature.' });
    }

    const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    const sigBuf = Buffer.from(String(signature));
    const expBuf = Buffer.from(expected);
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      console.warn('[tally-auth] Signature mismatch - rejecting');
      return res.status(401).json({ error: 'Invalid signature.' });
    }
  } else {
    console.warn('[tally-auth] TALLY_SIGNING_SECRET not configured - webhook authenticity NOT verified. Set a Signing Secret in Tally + TALLY_SIGNING_SECRET in Render to close this gap.');
  }

  try {
    req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  next();
}

module.exports = { verifyTallySignature };

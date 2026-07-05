/* ============================================================
   utils/turnstile.js  -  Cloudflare Turnstile server-side verification
   Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

   If TURNSTILE_SECRET_KEY isn't set, verification is skipped (with a
   warning) so local/dev environments without the key keep working -
   production has it configured in Render, so it's enforced there.
   ============================================================ */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not configured - skipping verification.');
    return true;
  }

  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.error('[turnstile] Verification request failed:', err.message);
    return false;
  }
}

module.exports = { verifyTurnstile };

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

    if (!data.success) {
      const errorCodes = data['error-codes'] || [];
      // Log Cloudflare's error codes so misconfigurations are diagnosable from Render logs.
      // 'invalid-input-secret' means TURNSTILE_SECRET_KEY doesn't match the frontend site key.
      // 'invalid-input-response' means the token is expired or already used.
      console.warn('[turnstile] Verification failed - error-codes:', errorCodes, 'hostname:', data.hostname);

      // If the secret key is misconfigured (admin error, not a bot), bypass verification
      // rather than blocking every legitimate buyer. This only triggers when the Render env
      // var TURNSTILE_SECRET_KEY doesn't match the Cloudflare site key - fix it by copying
      // the Secret Key from Cloudflare Turnstile dashboard for widget 0x4AAAAAADwBsHyyE7gWH-Oj
      // and updating TURNSTILE_SECRET_KEY in Render environment variables.
      if (errorCodes.includes('invalid-input-secret')) {
        console.error('[turnstile] CRITICAL: TURNSTILE_SECRET_KEY does not match site key 0x4AAAAAADwBsHyyE7gWH-Oj');
        console.error('[turnstile] Fix: Cloudflare dashboard -> Turnstile -> that widget -> copy Secret Key -> Render env vars -> TURNSTILE_SECRET_KEY');
        console.error('[turnstile] Bypassing this check to avoid blocking paying customers while misconfigured.');
        return true;
      }
    }

    return !!data.success;
  } catch (err) {
    console.error('[turnstile] Verification request failed:', err.message);
    return false;
  }
}

module.exports = { verifyTurnstile };

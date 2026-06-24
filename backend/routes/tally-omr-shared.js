/* ============================================================
   routes/tally-omr-shared.js
   Shared logic for OMR Online Test Series Tally webhooks.
   Validates form token, marks used, sends confirmation email.
   Does NOT generate an admit card PDF.
   ============================================================ */

const { Resend } = require('resend');
const { query }  = require('../config/db');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* ── Parse Tally fields (simplified - only name, email, phone, token) ── */

function resolveValue(field) {
  const raw = field.value;
  if (!raw && raw !== 0) return '';
  if (Array.isArray(raw)) {
    const options = field.options || [];
    const texts = raw.map(v => {
      if (typeof v === 'object' && v !== null) return v.text || v.label || '';
      const match = options.find(o => o.id === v);
      return match ? match.text : String(v);
    });
    return texts.filter(Boolean).join(', ');
  }
  if (typeof raw === 'object' && raw !== null) return raw.text || raw.label || JSON.stringify(raw);
  return String(raw).trim();
}

function parseTallyFields(fields) {
  const result = {};
  for (const field of fields) {
    const label = (field.label || '').toLowerCase().trim();
    const value = resolveValue(field);
    if (label.includes('name') && !label.includes('exam') && !label.includes('centre')) {
      result.name = value;
    }
    if (label.includes('email')) {
      result.email = value;
    }
    if (label.includes('phone') || label.includes('mobile') || label.includes('whatsapp') || label.includes('number')) {
      if (!result.phone) result.phone = value;
    }
    if (label === 'token' || label.includes('form token') || label.includes('enrollment token')) {
      result.token = value;
    }
  }
  return result;
}

/* ── Send rejection email ── */

async function sendRejectionEmail(toEmail, reason) {
  await resend.emails.send({
    from: FROM,
    to:   toEmail,
    subject: 'Enrollment form - action needed | jaspalsingh.in',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#991b1b;">Your form submission could not be processed</p>
      <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.65;">${reason}</p>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
      If you believe this is an error or need help, please contact us immediately on WhatsApp.
    </p>
    <a href="https://wa.me/919829133317?text=${encodeURIComponent('Hi, I need help with my OMR enrollment form submission for jaspalsingh.in')}"
       style="display:inline-block;background:#25D366;color:#fff;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      WhatsApp Us Now
    </a>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  }).catch(e => console.error('[omr rejection email]', e.message));
}

/* ── Main handler: validate token and send confirmation ── */

async function processOmrSubmission(fields, type) {
  const { name, email, phone, token } = parseTallyFields(fields);

  if (!email) {
    console.warn('[tally-omr] No email found in fields');
    return;
  }

  const normEmail = email.toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token) {
    console.warn('[tally-omr] No token in submission - rejecting');
    await sendRejectionEmail(email,
      'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email. Please check your email for the "Fill Details Form" button and use that link.'
    );
    return;
  }

  /* Look up token in enrollments, scoped to OMR program slugs */
  const enrResult = await query(
    `SELECT id, student_email, student_phone, form_used, form_token, program_slug
     FROM enrollments
     WHERE form_token = $1 AND program_slug LIKE '%omr%'`,
    [token]
  );

  if (!enrResult.rows.length) {
    console.warn('[tally-omr] Invalid token or not an OMR enrollment:', token);
    await sendRejectionEmail(email,
      'The enrollment token in your submission is invalid or does not match any paid OMR enrollment. Please use the original link sent in your enrollment email.'
    );
    return;
  }

  const enrollment = enrResult.rows[0];

  if (enrollment.form_used) {
    console.warn('[tally-omr] Token already used, enrollment:', enrollment.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake, please contact us on WhatsApp.'
    );
    return;
  }

  /* Verify email matches */
  const expectedEmail = (enrollment.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    console.warn('[tally-omr] Email mismatch - submitted:', normEmail, 'expected:', expectedEmail);
    await sendRejectionEmail(email,
      `The email address you entered (${email}) does not match the email used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  /* Verify phone */
  const expectedPhone = (enrollment.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    console.warn('[tally-omr] Phone mismatch - submitted:', normPhone, 'expected:', expectedPhone);
    await sendRejectionEmail(email,
      `The mobile number you entered does not match the number used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  /* All checks passed - mark token as used */
  await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW() WHERE form_token = $1`,
    [token]
  );
  console.log('[tally-omr] Token validated, enrollment:', enrollment.id, 'type:', type);

  const isDegreeCourse = type === 'omr-degree';
  const seriesName = isDegreeCourse
    ? 'RSSB JE 2026 - Civil Degree - OMR Based Online Test Series'
    : 'RSSB JEN 2026-27 - Civil Diploma - OMR Based Online Test Series';

  /* Send confirmation email */
  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;max-width:620px;margin:0 auto;padding:20px;">

  <div style="background:#0f172a;border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Dr. Jaspal Singh</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">jaspalsingh.in</p>
  </div>

  <p style="font-size:16px;">Dear <strong>${name || 'Learner'}</strong>,</p>
  <p>Your identity has been verified. You are now enrolled in the <strong>${seriesName}</strong>.</p>

  <div style="background:#f0f4ff;border:1px solid rgba(99,102,241,.25);border-radius:12px;padding:22px 26px;margin:24px 0;">
    <h2 style="font-size:16px;margin:0 0 14px;color:#4338CA;">What happens next</h2>
    <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
      <li>On each scheduled test day, you will receive the <strong>question paper PDF via this email</strong>.</li>
      <li>Download and attempt the paper at home. Fill the OMR sheet on paper.</li>
      <li>Take a clear photo/scan of your completed OMR sheet and reply to the test email before <strong>end of day</strong>.</li>
      <li>Results and rankings will be announced together with offline participants.</li>
    </ol>
    <p style="font-size:13px;color:#6366F1;margin:14px 0 0;font-weight:600;">
      The first test is on 5 July 2026. Keep an eye on your inbox on each Sunday test day.
    </p>
  </div>

  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:18px 22px;margin:20px 0;">
    <p style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px;">Important</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.75;color:#78350f;">
      <li>If you do not submit your OMR sheet by end of day on the test date, evaluation will not be done for that test.</li>
      <li>You can still access all test PDFs even if you miss a submission.</li>
      <li>Make sure this email address is not in your spam/junk folder so you receive test papers on time.</li>
    </ul>
  </div>

  <p style="font-size:14px;">For any queries, reach us on WhatsApp at +91 98291 33317.</p>
  <p style="font-size:14px;margin-top:20px;">
    Best wishes for your preparation!<br/>
    <strong>Dr. Jaspal Singh</strong><br/>
    <a href="https://jaspalsingh.in" style="color:#4338CA;">jaspalsingh.in</a>
  </p>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:11px;color:#94a3b8;text-align:center;">
    This is an automated confirmation email. Please do not reply to this email directly.
  </p>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `Identity Verified - You're enrolled in ${seriesName}`,
    html:    htmlBody,
  });

  if (error) {
    console.error('[tally-omr] Resend error:', error);
  } else {
    console.log(`[tally-omr] Confirmation email sent to ${email} | type: ${type}`);
  }
}

module.exports = { processOmrSubmission };

/* ============================================================
   services/paymentEmailService.js
   Post-payment emails via Resend
   - Invoice receipt
   - Welcome email with learner details form link
   ============================================================ */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'Dr. Jaspal Singh <team@jaspalsingh.in>';
const SITE   = 'https://jaspalsingh.in';

const TALLY_FORM_URL = process.env.TALLY_FORM_URL || 'https://tally.so/r/XXXXXXX';

function fmtDate(iso) {
  return new Date(iso || Date.now()).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

function fmtAmount(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

function baseHtml(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:28px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in &nbsp;·&nbsp; Jaipur, Rajasthan</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">${body}</td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:20px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
      Questions? Reply to this email or WhatsApp us at +91 98291 33317<br/>
      <a href="${SITE}" style="color:#C81240;text-decoration:none;">${SITE}</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ── 1. Invoice Receipt ──────────────────────────────────────── */

async function sendInvoiceEmail(enrollment) {
  const firstName = (enrollment.student_name || 'there').split(' ')[0];
  const paidAt    = fmtDate(enrollment.paid_at);

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#f0fdf4;border:1px solid #86efac;border-radius:50px;padding:8px 20px;">
        <span style="font-size:13px;font-weight:700;color:#16a34a;">Payment Confirmed</span>
      </div>
    </div>

    <h2 style="margin:0 0 6px;font-size:22px;color:#1A1A2E;font-weight:800;">Thank you, ${firstName}!</h2>
    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.7;">
      Your enrollment is confirmed. Here is your payment receipt.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <tr><td colspan="2" style="padding-bottom:14px;border-bottom:1px solid #e2e8f0;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#94a3b8;text-transform:uppercase;">Payment Receipt</div>
      </td></tr>
      <tr><td style="padding:10px 0 4px;font-size:13px;color:#64748b;">Program</td>
          <td style="padding:10px 0 4px;font-size:14px;color:#1A1A2E;font-weight:700;text-align:right;">${enrollment.program_name}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Order ID</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;font-family:monospace;text-align:right;">${enrollment.order_id}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Date</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${paidAt}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Name</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${enrollment.student_name}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Phone</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${enrollment.student_phone || '-'}</td></tr>
      ${enrollment.coupon_code ? `<tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Coupon</td>
          <td style="padding:4px 0;font-size:13px;color:#16a34a;font-weight:600;text-align:right;">${enrollment.coupon_code}</td></tr>` : ''}
      <tr><td colspan="2" style="padding-top:14px;border-top:1px solid #e2e8f0;"></td></tr>
      <tr><td style="padding:4px 0;font-size:15px;font-weight:800;color:#1A1A2E;">Amount Paid</td>
          <td style="padding:4px 0;font-size:18px;font-weight:800;color:#C81240;text-align:right;">${fmtAmount(enrollment.amount)}</td></tr>
    </table>

    <p style="font-size:14px;color:#374151;line-height:1.75;margin:0 0 8px;">
      We will contact you on <strong>${enrollment.student_phone}</strong> with further details about the program schedule and venue.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.75;margin:0 0 28px;">
      For any queries, WhatsApp us at <strong>+91 98291 33317</strong> or email <a href="mailto:team@jaspalsingh.in" style="color:#C81240;text-decoration:none;">team@jaspalsingh.in</a>
    </p>

    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "See you in the classroom. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;·&nbsp; ESE AIR-04 &nbsp;·&nbsp; GATE AIR-06</p>
    </div>
  `;

  return resend.emails.send({
    from:    FROM,
    to:      enrollment.student_email,
    subject: `Payment confirmed - ${enrollment.program_name} | jaspalsingh.in`,
    html:    baseHtml(body),
  });
}

/* ── 2. Welcome + Details Form Email ────────────────────────── */

async function sendWelcomePaymentEmail(enrollment) {
  const firstName = (enrollment.student_name || 'there').split(' ')[0];

  const formUrl = `${TALLY_FORM_URL}?name=${encodeURIComponent(enrollment.student_name)}&email=${encodeURIComponent(enrollment.student_email)}&order=${encodeURIComponent(enrollment.order_id)}&program=${encodeURIComponent(enrollment.program_name)}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#1A1A2E;font-weight:800;">Welcome aboard, ${firstName}!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.75;">
      You are now enrolled in <strong>${enrollment.program_name}</strong>. We are excited to have you.
    </p>

    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <div style="font-size:13px;font-weight:800;color:#c2410c;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">
        Action Required
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
        Please fill in your details so we can complete your enrollment and set up your seat.
        This takes less than 2 minutes.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">We need:</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">1.</span> Preferred test center location
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">2.</span> Full name as on your photo ID
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">3.</span> A photo matching your ID (for test hall verification)
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">4.</span> WhatsApp number for batch updates
        </td></tr>
      </table>
      <a href="${formUrl}" style="display:inline-block;background:#C81240;color:#fff;border-radius:10px;padding:14px 28px;font-size:15px;font-weight:700;text-decoration:none;">
        Complete Your Enrollment →
      </a>
    </div>

    <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;">
      Your Order ID: <span style="font-family:monospace;color:#475569;">${enrollment.order_id}</span>
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 24px;">
      Keep this email for your records. Your receipt has been sent in a separate email.
    </p>

    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "See you in the classroom. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;·&nbsp; ESE AIR-04 &nbsp;·&nbsp; GATE AIR-06</p>
    </div>
  `;

  return resend.emails.send({
    from:    FROM,
    to:      enrollment.student_email,
    subject: `Welcome to ${enrollment.program_name} - complete your enrollment`,
    html:    baseHtml(body),
  });
}

module.exports = { sendInvoiceEmail, sendWelcomePaymentEmail };

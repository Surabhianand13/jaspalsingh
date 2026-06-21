/* ============================================================
   services/paymentEmailService.js
   Post-payment emails via Resend
   - Invoice receipt
   - Welcome email with learner details form link
   ============================================================ */

const { Resend } = require('resend');
const { transporter: gmailTransporter, isConfigured: gmailReady } = require('../config/mailer');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'Dr. Jaspal Singh <team@jaspalsingh.in>';
const SITE   = 'https://jaspalsingh.in';
const ADMIN_EMAIL = 'jaspalsingh.pec@gmail.com';

const TALLY_FORM_URL_DIPLOMA = process.env.TALLY_FORM_URL_DIPLOMA || 'https://tally.so/r/b5AY87';
const TALLY_FORM_URL_DEGREE  = process.env.TALLY_FORM_URL_DEGREE  || 'https://tally.so/r/b5AD1Z';

const WA_GROUP_DIPLOMA = 'https://chat.whatsapp.com/Iq5hz6qm9kPFdjOEESK4Ka?s=sh&p=a&ilr=4';
const WA_GROUP_DEGREE  = 'https://chat.whatsapp.com/K0Upt2jTmdQLkaI5c0CvM0?s=sh&p=a&ilr=4';
const WA_GROUP_RPSC_AE = '';

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
  const firstName = esc((enrollment.student_name || 'there').split(' ')[0]);
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
          <td style="padding:10px 0 4px;font-size:14px;color:#1A1A2E;font-weight:700;text-align:right;">${esc(enrollment.program_name)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Order ID</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;font-family:monospace;text-align:right;">${esc(enrollment.order_id)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Date</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${paidAt}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Name</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${esc(enrollment.student_name)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Phone</td>
          <td style="padding:4px 0;font-size:13px;color:#475569;text-align:right;">${esc(enrollment.student_phone) || '-'}</td></tr>
      ${enrollment.coupon_code ? `<tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Coupon</td>
          <td style="padding:4px 0;font-size:13px;color:#16a34a;font-weight:600;text-align:right;">${esc(enrollment.coupon_code)}</td></tr>` : ''}
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
  const firstName = esc((enrollment.student_name || 'there').split(' ')[0]);

  const slug = enrollment.program_slug || '';
  const tallyBase = slug.includes('degree') ? TALLY_FORM_URL_DEGREE : TALLY_FORM_URL_DIPLOMA;
  const formUrl = `${tallyBase}?name=${encodeURIComponent(enrollment.student_name)}&email=${encodeURIComponent(enrollment.student_email)}&phone=${encodeURIComponent(enrollment.student_phone || '')}&order=${encodeURIComponent(enrollment.order_id)}&token=${encodeURIComponent(enrollment.form_token || '')}`;

  const waGroup = slug.includes('degree') ? WA_GROUP_DEGREE : slug.includes('diploma') ? WA_GROUP_DIPLOMA : WA_GROUP_RPSC_AE;

  const normPhone = (enrollment.student_phone || '').replace(/\D/g, '').slice(-10);

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#1A1A2E;font-weight:800;">Welcome aboard, ${firstName}!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75;">
      You are now enrolled in <strong>${esc(enrollment.program_name)}</strong>. We are excited to have you.
    </p>

    <!-- ONE CHANCE WARNING -->
    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:18px 22px;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">
        ⚠️ Important - Read Before Filling
      </div>
      <p style="margin:0 0 10px;font-size:14px;color:#7f1d1d;line-height:1.7;font-weight:600;">
        You have <u>ONE chance</u> to fill the details form below. It cannot be re-submitted.
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#991b1b;line-height:1.65;">
        Use <strong>exactly</strong> the same email and mobile number you used during payment:
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:8px 0 12px;">
        <tr><td style="padding:3px 0;font-size:13px;color:#7f1d1d;">
          Email: <strong>${esc(enrollment.student_email)}</strong>
        </td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#7f1d1d;">
          Mobile: <strong>${normPhone ? '+91 ' + normPhone : esc(enrollment.student_phone || 'as entered at checkout')}</strong>
        </td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#b91c1c;">
        If the details don't match your payment, your admit card will NOT be generated. Contact us on WhatsApp (+91 98291 33317) if you need help.
      </p>
    </div>

    <!-- ACTION REQUIRED -->
    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <div style="font-size:13px;font-weight:800;color:#c2410c;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">
        Action Required - Complete Your Enrollment
      </div>
      <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">
        Fill in your details so we can set up your seat and send your Admit Card. Takes less than 2 minutes.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">We need:</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">1.</span> Preferred test centre location (Jaipur / Kota / Bikaner)
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">2.</span> Full name as on your Govt Photo ID
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">3.</span> Your photo (passport size, same as on your ID)
        </td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
          <span style="color:#C81240;margin-right:8px;font-weight:700;">4.</span> WhatsApp number for batch updates
        </td></tr>
      </table>
      <a href="${formUrl}" style="display:inline-block;background:#C81240;color:#fff;border-radius:10px;padding:14px 28px;font-size:15px;font-weight:700;text-decoration:none;">
        Fill Details Form (One Time Only) →
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">
        This link is unique to your enrollment. Do not share it.
      </p>
    </div>

    ${waGroup ? `
    <!-- WHATSAPP GROUP -->
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <div style="font-size:13px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">
        Join Your WhatsApp Batch Group
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
        Get live updates, schedule notifications, and connect with your batch. Join using the link below.
      </p>
      <a href="${waGroup}" style="display:inline-block;background:#25D366;color:#fff;border-radius:10px;padding:13px 24px;font-size:15px;font-weight:700;text-decoration:none;">
        Join WhatsApp Group →
      </a>
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">
        This is a one-time invite link for your program. Do not share it publicly.
      </p>
    </div>
    ` : ''}

    <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;">
      Order ID: <span style="font-family:monospace;color:#475569;">${esc(enrollment.order_id)}</span>
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 24px;">
      Your payment receipt has been sent in a separate email.
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
    subject: `Action required - fill your details to get your Admit Card | ${enrollment.program_name}`,
    html:    baseHtml(body),
  });
}

/* ── 3. Admin Payment Notification (Gmail - free) ────────────── */

async function sendAdminPaymentNotification(enrollment) {
  const paid = new Date(enrollment.paid_at || Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const slug = enrollment.program_slug || '';
  const tier = slug.includes('degree') ? 'Degree' : slug.includes('diploma') ? 'Diploma' : '';
  const programLabel = tier ? `${enrollment.program_name} [${tier}]` : enrollment.program_name;
  const phone = (enrollment.student_phone || '').replace(/\D/g, '').slice(-10);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:16px 16px 0 0;
                 padding:28px 32px;text-align:center;border-bottom:1px solid #334155;">
    <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px;">
      jaspalsingh.in
    </div>
    <div style="display:inline-block;background:linear-gradient(135deg,#16a34a,#22c55e);
                border-radius:50px;padding:8px 22px;margin-bottom:6px;">
      <span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:.05em;">
        Payment Received
      </span>
    </div>
    <div style="font-size:28px;font-weight:800;color:#fff;margin-top:12px;">
      Rs ${Number(enrollment.amount).toLocaleString('en-IN')}
    </div>
    <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${esc(paid)} IST</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#1e293b;padding:28px 32px;">

    <!-- Student info -->
    <div style="background:#0f172a;border-radius:12px;padding:20px 22px;margin-bottom:20px;border:1px solid #334155;">
      <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">
        Student
      </div>
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-bottom:10px;">
        ${esc(enrollment.student_name)}
      </div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;">
          <span style="font-size:13px;color:#64748b;min-width:60px;display:inline-block;">Email</span>
          <span style="font-size:13px;color:#cbd5e1;">${esc(enrollment.student_email)}</span>
        </td></tr>
        <tr><td style="padding:4px 0;">
          <span style="font-size:13px;color:#64748b;min-width:60px;display:inline-block;">Phone</span>
          <span style="font-size:13px;color:#cbd5e1;">${phone ? '+91 ' + phone : '-'}</span>
        </td></tr>
      </table>
    </div>

    <!-- Program info -->
    <div style="background:#0f172a;border-radius:12px;padding:20px 22px;margin-bottom:20px;border:1px solid #334155;">
      <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">
        Program
      </div>
      ${tier ? `<div style="display:inline-block;background:#C8124022;color:#f87171;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:8px;">${esc(tier)}</div>` : ''}
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:10px;line-height:1.4;">
        ${esc(enrollment.program_name)}
      </div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;">
          <span style="font-size:13px;color:#64748b;min-width:70px;display:inline-block;">Order</span>
          <span style="font-size:12px;color:#94a3b8;font-family:monospace;">${esc(enrollment.order_id)}</span>
        </td></tr>
        ${enrollment.coupon_code ? `<tr><td style="padding:4px 0;">
          <span style="font-size:13px;color:#64748b;min-width:70px;display:inline-block;">Coupon</span>
          <span style="font-size:13px;color:#4ade80;font-weight:700;">${esc(enrollment.coupon_code)}</span>
        </td></tr>` : ''}
      </table>
    </div>

    <!-- Quick actions -->
    <table cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:0 5px 0 0;width:50%;">
          <a href="https://jaspalsingh.in/admin/dashboard.html"
             style="display:block;background:#C81240;color:#fff;border-radius:9px;padding:12px;
                    font-size:13px;font-weight:700;text-decoration:none;text-align:center;">
            Admin Dashboard
          </a>
        </td>
        <td style="padding:0 0 0 5px;width:50%;">
          <a href="https://wa.me/91${phone}"
             style="display:block;background:#16a34a;color:#fff;border-radius:9px;padding:12px;
                    font-size:13px;font-weight:700;text-decoration:none;text-align:center;">
            WhatsApp Student
          </a>
        </td>
      </tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;
                 border-top:1px solid #1e293b;">
    <p style="margin:0;font-size:11px;color:#334155;">jaspalsingh.in - admin notification</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return resend.emails.send({
    from:    FROM,
    to:      ADMIN_EMAIL,
    subject: `Rs ${Number(enrollment.amount).toLocaleString('en-IN')} - ${enrollment.student_name} | ${programLabel}`,
    html,
  });
}

module.exports = { sendInvoiceEmail, sendWelcomePaymentEmail, sendAdminPaymentNotification };

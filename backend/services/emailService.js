/* ============================================================
   services/emailService.js  -  Email Templates & Sending
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   All functions are fire-and-forget  -  they return a Promise
   but callers should .catch() silently so email failures
   never break API responses.

   Exported functions:
     sendContactNotification(msg)    -  admin notified of new contact/strategy
     sendContactAutoReply(msg)       -  sender gets "we received your message"
     sendWelcomeEmail(learner)       -  new learner welcome
   ============================================================ */

const { transporter, isConfigured } = require('../config/mailer');

const ADMIN_EMAIL   = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER;
const FROM_ADDRESS  = `"jaspalsingh.in" <${process.env.GMAIL_USER}>`;
const SITE_URL      = 'https://jaspalsingh.in';
const ADMIN_URL     = 'https://jaspalsingh.in/admin/dashboard.html';

/* ── Shared helpers ──────────────────────────────────────────── */

function esc(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  return new Date(iso || Date.now()).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

/* ── Base email wrapper ──────────────────────────────────────── */

function baseEmail(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>jaspalsingh.in</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1A1A2E 0%,#2d1f4e 100%);border-radius:14px 14px 0 0;padding:28px 36px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Dr. Jaspal Singh</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:4px;letter-spacing:1px;text-transform:uppercase;">jaspalsingh.in</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#fff;padding:32px 36px;">
        ${content}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:20px 36px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
          jaspalsingh.in · Free Civil Engineering Resources for GATE &amp; ESE<br/>
          <a href="${SITE_URL}" style="color:#F0345A;text-decoration:none;">${SITE_URL}</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* Accent block for highlighting info rows */
function infoRow(label, value) {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:#1A1A2E;font-weight:600;">${esc(value || ' - ')}</td>
  </tr>`;
}

/* ── 1. Admin  -  New Contact / Strategy Message ───────────────── */

async function sendContactNotification(msg) {
  if (!isConfigured || !ADMIN_EMAIL) return;

  const isStrategy = msg.subject && msg.subject.toLowerCase().includes('strategy');
  const alertColor = isStrategy ? '#8b5cf6' : '#F0345A';
  const alertType  = isStrategy ? 'Strategy Plan Request' : 'New Contact Message';
  const alertIcon  = isStrategy ? '📋' : '✉️';

  const content = `
    <div style="display:inline-block;background:${alertColor}1a;color:${alertColor};
                border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;
                text-transform:uppercase;letter-spacing:0.5px;margin-bottom:20px;">
      ${alertIcon} ${alertType}
    </div>
    <h2 style="margin:0 0 6px;font-size:20px;color:#1A1A2E;font-weight:800;">
      ${esc(msg.name)} sent you a message
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Received ${fmtDate(msg.created_at)}</p>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${infoRow('From',    msg.name)}
      ${infoRow('Email',   msg.email)}
      ${msg.subject ? infoRow('Subject', msg.subject) : ''}
    </table>

    <div style="background:#f8f8fc;border-left:3px solid ${alertColor};border-radius:0 8px 8px 0;
                padding:16px 18px;margin-bottom:28px;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.75;white-space:pre-wrap;">${esc(msg.message)}</p>
    </div>

    <a href="${ADMIN_URL}#messages" style="display:inline-block;background:${alertColor};color:#fff;
       border-radius:9px;padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      View in Admin Panel →
    </a>
  `;

  return transporter.sendMail({
    from:    FROM_ADDRESS,
    to:      ADMIN_EMAIL,
    subject: `${alertIcon} ${alertType} from ${msg.name}  -  jaspalsingh.in`,
    html:    baseEmail(content),
  });
}

/* ── 2. Auto-Reply to Sender ─────────────────────────────────── */

async function sendContactAutoReply(msg) {
  if (!isConfigured) return;

  const isStrategy = msg.subject && msg.subject.toLowerCase().includes('strategy');
  const firstName  = (msg.name || 'there').split(' ')[0];
  const responseTime = isStrategy
    ? 'within 24–48 hours with your personalised strategy plan'
    : 'personally  -  usually within a few days';

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">
      Got it, ${esc(firstName)}! 🙏
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
      Dr. Jaspal Singh received your message and will get back to you ${responseTime}.
      He reads every message personally.
    </p>

    <div style="background:#f8f8fc;border-radius:10px;padding:18px 20px;margin-bottom:24px;
                border:1px solid rgba(240,52,90,0.12);">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Your message</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.65;white-space:pre-wrap;">${esc(msg.message)}</p>
    </div>

    <p style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;">
      For the fastest response, join the Telegram community  -  Dr. Jaspal is most active there daily:
    </p>
    <a href="https://t.me/jaspalsirofficial"
       style="display:inline-block;background:linear-gradient(135deg,#1a9fd8,#28bce8);color:#fff;
              border-radius:9px;padding:12px 22px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:24px;">
      Join Telegram Community →
    </a>

    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.6;">
      You can also browse free Civil Engineering notes and formula books at
      <a href="${SITE_URL}/resources.html" style="color:#F0345A;text-decoration:none;">jaspalsingh.in/resources</a>
      while you wait.
    </p>
  `;

  return transporter.sendMail({
    from:    FROM_ADDRESS,
    to:      `"${msg.name}" <${msg.email}>`,
    subject: `Re: Your message to Dr. Jaspal Singh  -  we received it!`,
    html:    baseEmail(content),
  });
}

/* ── 3. Welcome Email to New Learner ─────────────────────────── */

async function sendWelcomeEmail(learner) {
  if (!isConfigured) return;

  const firstName = (learner.name || 'there').split(' ')[0];
  const examLabel = {
    'GATE':        'GATE CE',
    'ESE':         'UPSC IES / ESE',
    'SSC JE':      'SSC JE',
    'State AE/JE': 'State AE / JE',
    'General':     'Civil Engineering exams',
  }[learner.target_exam] || 'Civil Engineering exams';

  const content = `
    <!-- Hero -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#C81240,#F0345A);
                  border-radius:50px;padding:8px 22px;margin-bottom:18px;">
        <span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:.06em;text-transform:uppercase;">
          Account Activated
        </span>
      </div>
      <h2 style="margin:0 0 10px;font-size:26px;color:#1A1A2E;font-weight:800;line-height:1.25;">
        Welcome, ${esc(firstName)}!
      </h2>
      <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.7;">
        You are now part of <strong style="color:#1A1A2E;">Dr. Jaspal Singh's</strong> community of
        <strong style="color:#C81240;">${examLabel}</strong> aspirants.
      </p>
    </div>

    <!-- What you get free -->
    <div style="background:#f8fafc;border-radius:14px;padding:22px 24px;margin-bottom:24px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;">
        Free for you, always
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr><td style="padding:7px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:16px;margin-right:10px;">📥</span>
          <span style="font-size:14px;color:#1A1A2E;font-weight:600;">Notes, formula books &amp; PYQs</span>
          <div style="font-size:12px;color:#6b7280;padding-left:26px;margin-top:2px;">GATE, ESE, SSC JE, State AE/JE - all subjects</div>
        </td></tr>
        <tr><td style="padding:7px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:16px;margin-right:10px;">📋</span>
          <span style="font-size:14px;color:#1A1A2E;font-weight:600;">Personalised strategy plan</span>
          <div style="font-size:12px;color:#6b7280;padding-left:26px;margin-top:2px;">Tell us your exam and timeline - Dr. Jaspal responds personally</div>
        </td></tr>
        <tr><td style="padding:7px 0;">
          <span style="font-size:16px;margin-right:10px;">🔔</span>
          <span style="font-size:14px;color:#1A1A2E;font-weight:600;">Exam updates before anyone else</span>
          <div style="font-size:12px;color:#6b7280;padding-left:26px;margin-top:2px;">Notifications, admit cards, cutoffs - directly to your inbox</div>
        </td></tr>
      </table>
    </div>

    <!-- Active programs -->
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;">
        Live offline programs
      </p>
      <!-- Program card 1 -->
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:10px;background:#fff;">
        <div style="display:inline-block;background:#fef2f2;color:#C81240;border-radius:6px;
                    padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:8px;">RSSB JE 2026</div>
        <div style="font-size:15px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          Jaspal Sir Ki Test Series - Diploma
        </div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">
          Offline test series at Jaipur, Kota &amp; Bikaner - taught by Dr. Jaspal Singh (ESE AIR-04)
        </div>
        <a href="${SITE_URL}/rssb-jen-diploma-test-series.html"
           style="display:inline-block;background:#C81240;color:#fff;border-radius:8px;
                  padding:9px 18px;font-size:13px;font-weight:700;text-decoration:none;">
          View Program →
        </a>
      </div>
      <!-- Program card 2 -->
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;background:#fff;">
        <div style="display:inline-block;background:#fef2f2;color:#C81240;border-radius:6px;
                    padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:8px;">RSSB JE 2026</div>
        <div style="font-size:15px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          Jaspal Sir Ki Test Series - Degree
        </div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">
          Offline test series at Jaipur, Kota &amp; Bikaner - for degree holders
        </div>
        <a href="${SITE_URL}/rssb-jen-degree-test-series.html"
           style="display:inline-block;background:#C81240;color:#fff;border-radius:8px;
                  padding:9px 18px;font-size:13px;font-weight:700;text-decoration:none;">
          View Program →
        </a>
      </div>
    </div>

    <!-- CTA buttons -->
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
      <tr>
        <td style="padding:0 5px 0 0;width:50%;">
          <a href="${SITE_URL}/resources.html"
             style="display:block;background:#1A1A2E;color:#fff;border-radius:10px;padding:13px 12px;
                    font-size:13px;font-weight:700;text-decoration:none;text-align:center;">
            Browse Free Resources
          </a>
        </td>
        <td style="padding:0 0 0 5px;width:50%;">
          <a href="https://t.me/jaspalsirofficial"
             style="display:block;background:linear-gradient(135deg,#1a9fd8,#28bce8);color:#fff;
                    border-radius:10px;padding:13px 12px;font-size:13px;font-weight:700;
                    text-decoration:none;text-align:center;">
            Join Telegram Community
          </a>
        </td>
      </tr>
    </table>

    <!-- Quote -->
    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 6px;font-size:14px;color:#374151;font-style:italic;line-height:1.75;">
        "Har aspirant deserves a teacher who truly cares. I'm glad you're here."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">
        - Dr. Jaspal Singh &nbsp;·&nbsp; ESE AIR-04 &nbsp;·&nbsp; GATE AIR-06
      </p>
    </div>
  `;

  return transporter.sendMail({
    from:    FROM_ADDRESS,
    to:      `"${learner.name}" <${learner.email}>`,
    subject: `Welcome to jaspalsingh.in - your free account is ready`,
    html:    baseEmail(content),
  });
}

/* ── 4. Admin  -  New Learner Alert ────────────────────────────── */

async function sendNewLearnerAlert(learner) {
  if (!isConfigured || !ADMIN_EMAIL) return;

  const content = `
    <div style="display:inline-block;background:#10b9811a;color:#10b981;border-radius:8px;
                padding:6px 14px;font-size:12px;font-weight:700;text-transform:uppercase;
                letter-spacing:0.5px;margin-bottom:20px;">
      👤 New Learner Registered
    </div>
    <h2 style="margin:0 0 20px;font-size:20px;color:#1A1A2E;font-weight:800;">
      ${esc(learner.name)} just joined your community
    </h2>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
      ${infoRow('Name',        learner.name)}
      ${infoRow('Email',       learner.email)}
      ${infoRow('Target Exam', learner.target_exam || 'General')}
      ${infoRow('Joined',      fmtDate(learner.created_at))}
    </table>
    <a href="${ADMIN_URL}#learners"
       style="display:inline-block;background:#10b981;color:#fff;border-radius:9px;
              padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      View All Learners →
    </a>
  `;

  return transporter.sendMail({
    from:    FROM_ADDRESS,
    to:      ADMIN_EMAIL,
    subject: `👤 New learner: ${learner.name} (${learner.target_exam || 'General'})  -  jaspalsingh.in`,
    html:    baseEmail(content),
  });
}

async function sendOtpEmail(email, otp) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: 'Dr. Jaspal Singh <team@jaspalsingh.in>',
    to:   email,
    subject: 'Your verification code - jaspalsingh.in',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#C81240;margin:0 0 8px;">Verify your email</h2>
        <p style="color:#374151;margin:0 0 24px;">Enter this code to complete your account registration on jaspalsingh.in:</p>
        <div style="background:#f8fafc;border:2px solid #C81240;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#0f172a;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
        <p style="color:#6b7280;font-size:13px;margin:8px 0 0;">- Team jaspalsingh.in</p>
      </div>`,
  });
}

module.exports = {
  sendContactNotification,
  sendContactAutoReply,
  sendWelcomeEmail,
  sendNewLearnerAlert,
  sendOtpEmail,
};

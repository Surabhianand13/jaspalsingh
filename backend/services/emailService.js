/* ============================================================
   services/emailService.js — Email Templates & Sending
   Dr. Jaspal Singh Website — jaspalsingh.in

   All functions are fire-and-forget — they return a Promise
   but callers should .catch() silently so email failures
   never break API responses.

   Exported functions:
     sendContactNotification(msg)   — admin notified of new contact/strategy
     sendContactAutoReply(msg)      — sender gets "we received your message"
     sendWelcomeEmail(learner)      — new learner welcome
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
    <td style="padding:6px 0;font-size:14px;color:#1A1A2E;font-weight:600;">${esc(value || '—')}</td>
  </tr>`;
}

/* ── 1. Admin — New Contact / Strategy Message ───────────────── */

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
    subject: `${alertIcon} ${alertType} from ${msg.name} — jaspalsingh.in`,
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
    : 'personally — usually within a few days';

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
      For the fastest response, join the Telegram community — Dr. Jaspal is most active there daily:
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
    subject: `Re: Your message to Dr. Jaspal Singh — we received it!`,
    html:    baseEmail(content),
  });
}

/* ── 3. Welcome Email to New Learner ─────────────────────────── */

async function sendWelcomeEmail(learner) {
  if (!isConfigured) return;

  const firstName = (learner.name || 'there').split(' ')[0];
  const examLabel = {
    'GATE':       'GATE CE',
    'ESE':        'UPSC IES / ESE',
    'SSC JE':     'SSC JE',
    'State AE/JE':'State AE / JE',
    'General':    'Civil Engineering exams',
  }[learner.target_exam] || 'Civil Engineering exams';

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#1A1A2E;font-weight:800;">
      Welcome, ${esc(firstName)}! 🎉
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75;">
      You're now part of Dr. Jaspal Singh's community of <strong>${examLabel}</strong> aspirants.
      Your account is ready — everything is free, always.
    </p>

    <div style="background:linear-gradient(135deg,#F0345A1a,#67C8E81a);border-radius:12px;
                padding:22px 24px;margin-bottom:26px;border:1px solid rgba(240,52,90,0.12);">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1A1A2E;">What you can do now:</p>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:14px;color:#374151;">
          <span style="color:#F0345A;margin-right:8px;">⬇</span>
          Download all notes, formula books, PYQs — tracked in your account
        </td></tr>
        <tr><td style="padding:5px 0;font-size:14px;color:#374151;">
          <span style="color:#F0345A;margin-right:8px;">📋</span>
          Request a personalised strategy plan for ${esc(examLabel)}
        </td></tr>
        <tr><td style="padding:5px 0;font-size:14px;color:#374151;">
          <span style="color:#F0345A;margin-right:8px;">📢</span>
          Get exam update notifications before anyone else
        </td></tr>
      </table>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
      <tr>
        <td style="padding:0 6px 0 0;width:50%;">
          <a href="${SITE_URL}/resources.html"
             style="display:block;background:#F0345A;color:#fff;border-radius:9px;padding:13px 16px;
                    font-size:14px;font-weight:700;text-decoration:none;text-align:center;">
            Browse Free Resources
          </a>
        </td>
        <td style="padding:0 0 0 6px;width:50%;">
          <a href="https://t.me/jaspalsirofficial"
             style="display:block;background:#1a9fd8;color:#fff;border-radius:9px;padding:13px 16px;
                    font-size:14px;font-weight:700;text-decoration:none;text-align:center;">
            Join Telegram
          </a>
        </td>
      </tr>
    </table>

    <div style="border-top:1px solid #f0f0f6;padding-top:20px;">
      <p style="margin:0 0 6px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "Har aspirant deserves a teacher who truly cares. I'm glad you're here."
      </p>
      <p style="margin:0;font-size:13px;color:#F0345A;font-weight:700;">
        — Dr. Jaspal Singh · PhD · Ex-IES Officer (AIR-04)
      </p>
    </div>
  `;

  return transporter.sendMail({
    from:    FROM_ADDRESS,
    to:      `"${learner.name}" <${learner.email}>`,
    subject: `Welcome to Dr. Jaspal Singh's community — your account is ready 🎉`,
    html:    baseEmail(content),
  });
}

/* ── 4. Admin — New Learner Alert ────────────────────────────── */

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
    subject: `👤 New learner: ${learner.name} (${learner.target_exam || 'General'}) — jaspalsingh.in`,
    html:    baseEmail(content),
  });
}

module.exports = {
  sendContactNotification,
  sendContactAutoReply,
  sendWelcomeEmail,
  sendNewLearnerAlert,
};

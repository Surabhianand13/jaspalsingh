/* ============================================================
   config/mailer.js — Nodemailer Gmail SMTP Transporter
   Dr. Jaspal Singh Website — jaspalsingh.in

   Requires in .env:
     GMAIL_USER=your_gmail@gmail.com
     GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  (16-char Google App Password)
     ADMIN_NOTIFICATION_EMAIL=jaspal@jaspalsingh.in

   How to get Gmail App Password:
     1. Enable 2-Step Verification on your Google account
     2. Go to Google Account → Security → App Passwords
     3. Create one for "Mail" → copy the 16-char password
   ============================================================ */

const nodemailer = require('nodemailer');

const isConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/* Verify connection on startup — non-fatal */
if (isConfigured) {
  transporter.verify()
    .then(()  => console.log('✅ Gmail SMTP connected — email notifications active'))
    .catch(e  => console.warn('⚠️  Gmail SMTP error:', e.message));
} else {
  console.warn('⚠️  Email not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD in .env');
}

module.exports = { transporter, isConfigured };

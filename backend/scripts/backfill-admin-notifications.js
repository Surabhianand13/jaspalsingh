/* ============================================================
   scripts/backfill-admin-notifications.js
   One-time script: send admin payment notifications for all
   past paid enrollments to jaspalsingh.pec@gmail.com

   Run once from backend folder:
     node scripts/backfill-admin-notifications.js
   ============================================================ */

require('dotenv').config();
const { query } = require('../config/db');
const { transporter, isConfigured } = require('../config/mailer');

if (!isConfigured) {
  console.error('Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
  process.exit(1);
}

const ADMIN_EMAIL = 'jaspalsingh.pec@gmail.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const result = await query(
    `SELECT * FROM enrollments WHERE status = 'paid' ORDER BY paid_at ASC`
  );
  const enrollments = result.rows;
  console.log(`Found ${enrollments.length} paid enrollments. Sending notifications...`);

  let sent = 0, failed = 0;

  for (const enrollment of enrollments) {
    try {
      const paid = new Date(enrollment.paid_at || enrollment.created_at || Date.now())
        .toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      const slug = enrollment.program_slug || '';
      const tier = slug.includes('degree') ? 'Degree' : slug.includes('diploma') ? 'Diploma' : '';
      const programLabel = tier ? `${enrollment.program_name} [${tier}]` : enrollment.program_name;

      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to:   ADMIN_EMAIL,
        subject: `[Past payment] ${enrollment.student_name} - Rs ${enrollment.amount} | ${programLabel}`,
        text: [
          `Past payment (backfill) from jaspalsingh.in`,
          ``,
          `Name:    ${enrollment.student_name}`,
          `Email:   ${enrollment.student_email}`,
          `Phone:   ${enrollment.student_phone || '-'}`,
          `Program: ${programLabel}`,
          `Amount:  Rs ${enrollment.amount}`,
          `Order:   ${enrollment.order_id}`,
          `Paid at: ${paid} IST`,
          enrollment.coupon_code ? `Coupon:  ${enrollment.coupon_code}` : '',
        ].filter(Boolean).join('\n'),
      });

      sent++;
      console.log(`[${sent}/${enrollments.length}] Sent for ${enrollment.student_name} (${enrollment.order_id})`);

      // Small delay to avoid Gmail rate limiting
      await sleep(500);
    } catch (err) {
      failed++;
      console.error(`Failed for ${enrollment.order_id}:`, err.message);
    }
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });

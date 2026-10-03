/* ============================================================
   scripts/resend-ese-p1p2-welcome-emails.js
   One-time: resend correct welcome email (with right ESE P1P2
   Tally form link) to all paid enrollees of:
     - ese-2027-prelims-jaspalsirki-testseries-p1p2-offline
     - ese-2027-prelims-jaspalsirki-testseries-p1p2-omr
   These users received the wrong RSSB JE form link on purchase.

   Run ONCE from the Render shell:
     node backend/scripts/resend-ese-p1p2-welcome-emails.js
   ============================================================ */

'use strict';

require('dotenv').config();

const { query }                  = require('../config/db');
const { sendWelcomePaymentEmail } = require('../services/paymentEmailService');

const TARGET_SLUGS = [
  'ese-2027-prelims-jaspalsirki-testseries-p1p2-offline',
  'ese-2027-prelims-jaspalsirki-testseries-p1p2-omr',
];

async function main() {
  const result = await query(
    `SELECT e.id, e.order_id, e.student_name, e.student_email, e.student_phone,
            e.amount, e.coupon_code, e.paid_at, e.form_token,
            p.slug AS program_slug, p.name AS program_name
     FROM enrollments e
     JOIN programs p ON p.id = e.program_id
     WHERE p.slug = ANY($1)
       AND e.payment_status = 'paid'
       AND e.is_refund IS NOT TRUE
     ORDER BY e.paid_at ASC`,
    [TARGET_SLUGS]
  );

  const rows = result.rows;
  console.log(`Found ${rows.length} paid enrollments across ESE P1P2 programs.`);
  if (!rows.length) { process.exit(0); }

  let ok = 0, fail = 0;

  for (const row of rows) {
    try {
      await sendWelcomePaymentEmail(row);
      console.log(`  SENT  ${row.student_email}  [${row.program_slug}]  order=${row.order_id}`);
      ok++;
    } catch (err) {
      console.error(`  FAIL  ${row.student_email}  order=${row.order_id}  err=${err.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\nDone. ${ok} sent, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

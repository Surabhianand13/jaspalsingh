/* ============================================================
   utils/adminPreview.js

   Admin preview learners (2026-10-23): these admin emails get a Rs 0
   paid enrollment in every visible paid program, so they see exactly
   what a paid learner sees (dashboard, tests, uploads, results,
   interview booking) and can reproduce learner issues.

   ensureGrants(email) is called from GET /api/enrollment/my-enrollments
   (so access appears the moment an admin opens /my-programs) and
   grantAll() once after boot. Both only add programs the email doesn't
   already have, so new programs are picked up automatically, and both
   swallow their own errors - this must never break the dashboard or
   the boot sequence.

   Rows are tagged by order_id (JSP-ADMINPREVIEW-...), amount 0 and
   student_name 'Admin Preview'; welcome_sent = TRUE so no welcome
   email is ever sent for them. The phone is a placeholder (the column
   is NOT NULL); access is matched on email.
   ============================================================ */

const { query } = require('../config/db');

const ADMIN_PREVIEW_EMAILS = ['anand.surabhi.a@gmail.com', 'jaspalsingh.pec@gmail.com'];

/* SQL condition that leaves admin preview grants out. Add it to every
   query that COUNTS, LISTS or EMAILS learners (paid learner list,
   revenue, dashboard, admit card queue, bulk emails, interview invites),
   but never to access checks - the admins must keep their preview access.
   Pass the table alias when the query uses one: realLearnersOnly('e'). */
function realLearnersOnly(alias) {
  return `${alias ? alias + '.' : ''}order_id NOT LIKE 'JSP-ADMINPREVIEW-%'`;
}

function isAdminPreviewEmail(email) {
  return ADMIN_PREVIEW_EMAILS.includes(String(email || '').toLowerCase().trim());
}

async function ensureGrants(email) {
  const norm = String(email || '').toLowerCase().trim();
  if (!ADMIN_PREVIEW_EMAILS.includes(norm)) return 0;
  try {
    const tag = norm.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 24);
    const r = await query(
      `INSERT INTO enrollments (order_id, program_slug, program_name, amount, student_name, student_email, student_phone,
                                status, paid_at, welcome_sent, form_token)
       SELECT 'JSP-ADMINPREVIEW-' || p.id::text || '-' || $2::text, p.slug, p.title, 0, 'Admin Preview', $1::text, '0000000000',
              'paid', NOW(), TRUE, md5(random()::text || clock_timestamp()::text)
       FROM programs p
       WHERE p.is_visible = TRUE AND p.price IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.program_slug = p.slug AND e.status = 'paid' AND e.refund_status != 'initiated'
             AND LOWER(TRIM(e.student_email)) = $1::text
         )
       ON CONFLICT (order_id) DO NOTHING`,
      [norm, tag]
    );
    if (r.rowCount) console.log(`[admin-preview] Added ${r.rowCount} program(s) for ${norm}`);
    return r.rowCount || 0;
  } catch (err) {
    console.error(`[admin-preview] grant failed for ${norm}:`, err.message);
    return 0;
  }
}

async function grantAll() {
  for (const email of ADMIN_PREVIEW_EMAILS) await ensureGrants(email);
}

module.exports = { ADMIN_PREVIEW_EMAILS, isAdminPreviewEmail, realLearnersOnly, ensureGrants, grantAll };

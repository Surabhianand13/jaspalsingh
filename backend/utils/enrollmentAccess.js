/* ============================================================
   utils/enrollmentAccess.js

   Single source of truth for "does this learner currently have
   access to this program's paid content" - used by every
   learner-facing schedule/test/OMR endpoint so the refund
   exclusion can never be forgotten on one path (it has been
   forgotten before on other features - see /api/enrollment/my-enrollments).

   A learner has access if they have at least one enrollment for
   the program that is paid AND not refunded. Matches on
   learner_id OR student_email/student_phone, same as
   /api/enrollment/my-enrollments, so a purchase made before the
   learner had an account still counts once they're logged in.
   ============================================================ */

const { query } = require('../config/db');
const { slugsFor } = require('./programSlugAliases');

/**
 * Returns the learner's active (paid, non-refunded) enrollment row
 * for a program, or null if they have none. Checks the canonical slug
 * and any legacy checkout slugs known to map to it (see
 * programSlugAliases.js) - some enrollments were stored under an older
 * slug and never backfilled.
 */
async function getActiveEnrollment(learnerId, learnerEmail, learnerPhone, programSlug) {
  const result = await query(
    `SELECT id, order_id, program_slug, paid_at
     FROM enrollments
     WHERE program_slug = ANY($4::text[])
       AND status = 'paid'
       AND refund_status != 'initiated'
       AND (learner_id = $1 OR student_email = $2 OR student_phone = $3)
     ORDER BY paid_at DESC
     LIMIT 1`,
    [learnerId, learnerEmail, learnerPhone, slugsFor(programSlug)]
  );
  return result.rows[0] || null;
}

module.exports = { getActiveEnrollment };

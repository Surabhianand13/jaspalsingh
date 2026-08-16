/* ============================================================
   utils/rollNumberPrefix.js  -  Resolve a program's roll-number
   prefix from its slug alone, so a roll number can be assigned the
   instant a purchase completes (onEnrollmentPaid) - before the
   learner has submitted their Tally form and told us anything else
   (centre, target exam) that the old per-program generators used to
   depend on.

   Returns either a single prefix string, or - for RSSB's Degree+
   Diploma combo programs - { degree, diploma } so the caller can
   mint two roll numbers, matching the existing "DEG_NUM|DIP_NUM"
   storage convention on enrollments.roll_number.
   ============================================================ */

const { query } = require('../config/db');
const { ESE_PROGRAMS } = require('../config/eseTestSeries');

async function resolveRollNumberPrefix(programSlug) {
  const slug = (programSlug || '').toLowerCase();

  if (slug.startsWith('rssb-')) {
    // Combo slugs contain both "degree" and "diploma" - check first.
    if (slug.includes('combo')) return { degree: 'DEG', diploma: 'DIP' };
    if (slug.includes('diploma')) return 'DIP';
    if (slug.includes('degree'))  return 'DEG';
  }

  const eseEntry = Object.values(ESE_PROGRAMS).find(p => p.slug === slug);
  if (eseEntry) return eseEntry.examCode || 'ESE';

  // Generic launch-config programs (UP Polytechnic, RVUNL, BPSC, RPSC AE, etc.)
  const prog = await query('SELECT launch_config, short_name, title FROM programs WHERE slug = $1', [programSlug]);
  const row = prog.rows[0];
  if (row && row.launch_config && row.launch_config.rollPrefix) {
    return row.launch_config.rollPrefix;
  }

  // Fallback for anything else - mirrors the existing generic-path fallback
  // in enrollment-account.js's /admin/resend-admit-card.
  const fallbackSource = (row && (row.short_name || row.title)) || programSlug || 'JSP';
  return fallbackSource.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'JSP';
}

module.exports = { resolveRollNumberPrefix };

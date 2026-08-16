/* ============================================================
   utils/rollNumber.js  -  Shared admit-card roll number generator
   Format: {PREFIX}-{5-digit-random}, uniqueness checked against
   enrollments.roll_number (backstopped by the partial unique index
   enrollments_roll_number_uidx). Promoted out of tally-generic.js's
   generateGenericRollNumber() so every program - RSSB, ESE, and the
   admin-launched generic ones - shares one implementation instead of
   four near-identical copies.
   ============================================================ */

const { query } = require('../config/db');

async function generateRollNumber(prefix) {
  const clean = (prefix || 'JSP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'JSP';
  let roll;
  for (let i = 0; i < 10; i++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    roll = `${clean}-${num}`;
    // Combo (Degree+Diploma) enrollments store roll_number as a packed
    // "DEG-X|DIP-Y" pair, not the bare value - an exact match alone would
    // miss a collision with either half of an existing combo pair, letting
    // two different students end up with the same printed number.
    const exists = await query(
      `SELECT 1 FROM enrollments WHERE roll_number = $1 OR roll_number LIKE $1 || '|%' OR roll_number LIKE '%|' || $1`,
      [roll]
    );
    if (!exists.rows.length) return roll;
  }
  return roll;
}

module.exports = { generateRollNumber };

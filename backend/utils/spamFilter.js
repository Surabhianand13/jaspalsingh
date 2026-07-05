/* ============================================================
   utils/spamFilter.js  -  Obvious test/bot submission heuristics
   Catches the common "someone is scripting our forms with junk
   test data" pattern (test@test.com, 9999999999, "Test User", ...).
   Deliberately conservative - only blocks patterns no genuine buyer
   would plausibly submit, so it can't reject real customers.
   ============================================================ */

const JUNK_EMAIL_RE = /^(test|admin|demo|foo|bar|abc|asdf|qwerty|sample|dummy|fake|xxx+)@(test|example|demo|mail|foo|abc)\.(com|in|org|net)$/i;
const JUNK_NAME_RE  = /^(test( ?user)?|demo( ?user)?|asdf|qwerty|foo ?bar|sample|dummy|xxx+)$/i;

function isJunkPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(digits)) return true;              // 9999999999, 0000000000, ...
  if (digits === '1234567890' || digits === '0123456789') return true;
  return false;
}

function isJunkEmail(email) {
  return JUNK_EMAIL_RE.test((email || '').trim());
}

function isJunkName(name) {
  return JUNK_NAME_RE.test((name || '').trim());
}

/* True if at least two of {name, email, phone} look like placeholder
   test data - a single coincidental match (e.g. a real person named
   "Sample") shouldn't be enough to block a genuine buyer. */
function isObviousTestSubmission({ name, email, phone }) {
  const hits = [isJunkName(name), isJunkEmail(email), isJunkPhone(phone)].filter(Boolean).length;
  return hits >= 2;
}

module.exports = { isObviousTestSubmission, isJunkPhone, isJunkEmail, isJunkName };

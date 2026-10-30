/* ============================================================
   config/interviewRules.js  -  Fixed text for the interview slot
   booking flow (routes/interviews.js). Shown on /book-interview and
   in every booking email, so the learner sees the same rules in both
   places. Edit here, not in the templates.
   ============================================================ */

const BRANCHES = ['Civil', 'Mechanical', 'Electrical'];

/* Every RPSC order (programme, add-on packs, interviews only) asks the
   branch at payment time (2026-10-30); it is stored in
   enrollments.engg_branch and pre-fills the booking page. */
function needsBranch(slug) { return /^rpsc-/.test(String(slug || '')); }

const CONTACT_PHONE   = '+91 98291 33317';
const CONTACT_WA_LINK = 'https://wa.me/919829133317';

/* No default interview venue (2026-10-30): the interviews are NOT at the
   Tonk Road centre - the venue is communicated later, so new phases start
   as "Venue not finalised" and the admin fills it in from Edit venue. */
const DEFAULT_VENUE = { name: '', address: '', mapsLink: '' };

const INSTRUCTIONS = [
  'Reach the venue 15 minutes before your slot.',
  'Bring 4 copies of your DAF (Detailed Application Form).',
  'Wear formal attire.',
  'Carry an original photo ID (Aadhaar / PAN / Driving Licence / Passport).',
  'Keep this confirmation with you (printed or on your phone).',
  'Late arrival may lead to losing your slot - the next interview starts on time.',
];

const TERMS = [
  'Slots are subject to availability and allotted on a first-come, first-served basis.',
  'Each learner gets 3 interview slots in total, each on a different day - book them together or one at a time. Extra mock interviews can only be added by buying a Mock Interview Add-on pack on this booking page.',
  'Add-on mock interviews follow the same rules as the included slots (one per day, first-come first-served, no reschedule or cancellation) and are booked in the same booking rounds.',
  'Booked slots cannot be rescheduled, cancelled or exchanged.',
  'A missed slot (no-show or late arrival) is forfeited. No compensation or replacement slot will be given.',
  'Report 15 minutes early in formal attire with 4 copies of your DAF and a valid photo ID.',
  'If an emergency on our side (e.g. faculty unavailability) affects your slot, we will contact you and allot an alternative slot.',
  'Slots are non-transferable. Only the registered learner may attend.',
  'The programme fee is not refundable on the grounds of missed or unbooked slots.',
  'The management\'s decision on slot allotment is final.',
];

/* Mock Interview Add-on packs (2026-10-30): extra mock interviews on top
   of the 3 included slots, sold only to paid (not refunded) RPSC AE
   Interview learners - from their booking page, never the public
   checkout. Each paid pack adds `slots` to that learner's limit and packs
   stack (4 + 2 = 6 extra). Add-on slots are booked in the same phases as
   everyone else. price here is only the fallback - the live price comes
   from the programs table (admin-editable). */
const ADDON_BASE_PROGRAM = 'rpsc-ae-interview';
const ADDON_PACKS = [
  { slug: 'rpsc-ae-mock-interview-addon-2', slots: 2, price: 2999, title: 'RPSC AE 2024 - Mock Interview Add-on (2 Interviews)', shortName: 'RPSC AE Mock Interview Add-on (2)' },
  { slug: 'rpsc-ae-mock-interview-addon-4', slots: 4, price: 4999, title: 'RPSC AE 2024 - Mock Interview Add-on (4 Interviews)', shortName: 'RPSC AE Mock Interview Add-on (4)' },
];
const ADDON_SLUGS = ADDON_PACKS.map(p => p.slug);
function addonPack(slug) { return ADDON_PACKS.find(p => p.slug === slug) || null; }

module.exports = { BRANCHES, needsBranch, CONTACT_PHONE, CONTACT_WA_LINK, DEFAULT_VENUE, INSTRUCTIONS, TERMS, ADDON_BASE_PROGRAM, ADDON_PACKS, ADDON_SLUGS, addonPack };

/* ============================================================
   config/interviewRules.js  -  Fixed text for the interview slot
   booking flow (routes/interviews.js). Shown on /book-interview and
   in every booking email, so the learner sees the same rules in both
   places. Edit here, not in the templates.
   ============================================================ */

const BRANCHES = ['Civil', 'Mechanical', 'Electrical'];

const CONTACT_PHONE   = '+91 98291 33317';
const CONTACT_WA_LINK = 'https://wa.me/919829133317';

const DEFAULT_VENUE = {
  name: 'WHITE HOUSE',
  address: '33, Tonk Road, Opp. Zone Tech, Madhuvan Colony, Mansingh Pura, Tonk Phatak, Jaipur, Rajasthan 302018',
  mapsLink: 'https://maps.app.goo.gl/UiYpXv447AWrfyMX8',
};

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
  'Each learner gets 3 interview slots in total, on 3 different days - book them together or one at a time. Additional slots cannot be booked.',
  'Booked slots cannot be rescheduled, cancelled or exchanged.',
  'A missed slot (no-show or late arrival) is forfeited. No compensation or replacement slot will be given.',
  'Report 15 minutes early in formal attire with 4 copies of your DAF and a valid photo ID.',
  'If an emergency on our side (e.g. faculty unavailability) affects your slot, we will contact you and allot an alternative slot.',
  'Slots are non-transferable. Only the registered learner may attend.',
  'The programme fee is not refundable on the grounds of missed or unbooked slots.',
  'The management\'s decision on slot allotment is final.',
];

module.exports = { BRANCHES, CONTACT_PHONE, CONTACT_WA_LINK, DEFAULT_VENUE, INSTRUCTIONS, TERMS };

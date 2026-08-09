/* ============================================================
   data.js  -  Offline CBT roster + question bank
   Dr. Jaspal Singh - jaspalsingh.in

   THIS IS SAMPLE DATA. Replace ROSTER and EXAM below with the real
   slot roster and real question bank before using this with actual
   learners. Loaded as a plain <script src> (not fetch/XHR) on purpose -
   fetching a local JSON file is blocked by the browser when this page
   is opened directly (file://) instead of through a server, which is
   exactly how staff will open it on the offline exam machines.

   To regenerate ROSTER for a real slot: export mobile/name/roll_number/
   program for everyone booked into that slot from the admin dashboard,
   and replace the array below. Copy the whole offline-cbt folder to
   each machine via USB before the slot starts.
   ============================================================ */

/* Must match the CBT_SYNC_KEY env var set on the backend (Render).
   Anyone with this key can only submit exam results, not read or
   change anything - low value, but still not something to publish
   anywhere public. Change this before real use, and set the matching
   value in Render's environment variables. */
var SYNC_KEY = '4wEFQ-cBzykiTJ8OPAEJ-6ii4pbQKJDg';

var ROSTER = [
  { mobile: '9660942983', name: 'Vinod Rathore',   roll_number: 'JAI-DEG-10234', program: 'RSSB JE 2026 - Diploma (Jaipur)' },
  { mobile: '9782260523', name: 'Vipin Kumar Meena', roll_number: 'JAI-DEG-10235', program: 'RSSB JE 2026 - Degree (Jaipur)' },
  { mobile: '9999999999', name: 'Sample Learner',   roll_number: 'JAI-DEG-10236', program: 'RSSB JE 2026 - Diploma (Jaipur)' },
];

var EXAM = {
  test_id: 'sample-cbt-test-1',
  title: 'RSSB JE 2026 - Full Length Mock (SAMPLE QUESTIONS)',
  duration_minutes: 30,
  questions: [
    {
      id: 1,
      text: 'Which of the following rivers does NOT originate in Rajasthan?',
      options: ['Banas', 'Luni', 'Chambal', 'Sabarmati'],
      correct: 2,
    },
    {
      id: 2,
      text: 'The unit of measurement of the modulus of elasticity is the same as that of:',
      options: ['Force', 'Stress', 'Strain', 'Energy'],
      correct: 1,
    },
    {
      id: 3,
      text: 'Which committee recommended the reorganization of Rajasthan\'s Panchayati Raj system?',
      options: ['Balwant Rai Mehta Committee', 'Ashok Mehta Committee', 'G.V.K. Rao Committee', 'L.M. Singhvi Committee'],
      correct: 0,
    },
    {
      id: 4,
      text: 'In a simply supported beam with a central point load W, the maximum bending moment is:',
      options: ['WL/2', 'WL/4', 'WL/8', 'WL²/8'],
      correct: 1,
    },
    {
      id: 5,
      text: 'The Rajasthan High Court was established in the year:',
      options: ['1947', '1949', '1950', '1956'],
      correct: 1,
    },
  ],
};

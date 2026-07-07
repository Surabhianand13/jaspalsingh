/* ============================================================
   config/eseTestSeries.js
   Shared data for the 6 ESE 2027 Prelims Tally webhook flows
   (Paper 1, Paper 2 Civil, Combined - each Offline + Home-Based OMR).
   Kept separate from tally-webhook.js's RSSB JE data since the two
   exams have entirely different centres/schedules.
   ============================================================ */

/* ── Offline test centres ──
   Addresses/maps links to be finalized - update these once confirmed. */
const ESE_CENTRES = {
  jaipur:    { name: 'Jaipur',    address: 'To be announced - contact us on WhatsApp for details', mapsLink: 'https://wa.me/919829133317' },
  delhi:     { name: 'Delhi',     address: 'To be announced - contact us on WhatsApp for details', mapsLink: 'https://wa.me/919829133317' },
  bhopal:    { name: 'Bhopal',    address: 'To be announced - contact us on WhatsApp for details', mapsLink: 'https://wa.me/919829133317' },
  hyderabad: { name: 'Hyderabad', address: 'To be announced - contact us on WhatsApp for details', mapsLink: 'https://wa.me/919829133317' },
};

function getEseCentreKey(centreValue) {
  const v = (centreValue || '').toLowerCase();
  if (v.includes('jaipur'))    return 'jaipur';
  if (v.includes('delhi'))     return 'delhi';
  if (v.includes('bhopal'))    return 'bhopal';
  if (v.includes('hyderabad')) return 'hyderabad';
  return null;
}

/* ── Test schedules ── */

const SCHEDULE_PAPER1 = [
  { test: 'Test-01', date: '02 August 2026',    syllabus: 'Engineering Aptitude', questions: 50 },
  { test: 'Test-02', date: '09 August 2026',    syllabus: 'Engineering Mathematics', questions: 50 },
  { test: 'Test-03', date: '16 August 2026',    syllabus: 'Standards & Quality Practices', questions: 50 },
  { test: 'Test-04', date: '23 August 2026',    syllabus: 'Basics of Energy & Environment', questions: 50 },
  { test: 'Test-05', date: '30 August 2026',    syllabus: 'Information & Communication Technology (ICT)', questions: 50 },
  { test: 'Test-06', date: '06 September 2026', syllabus: 'Ethics and Values in the Engineering Profession', questions: 50 },
  { test: 'Test-07', date: '13 September 2026', syllabus: 'Basics of Project Management', questions: 50 },
  { test: 'Test-08', date: '20 September 2026', syllabus: 'General Principles of Design, Drawing & Importance of Safety', questions: 50 },
  { test: 'Test-09', date: '27 September 2026', syllabus: 'Basics of Material Science and Engineering', questions: 50 },
  { test: 'Test-10', date: '04 October 2026',   syllabus: 'Current Issues of National and International Importance', questions: 50 },
  { test: 'Test-11', date: '11 October 2026',   syllabus: 'Mixed Test 1: Engineering Aptitude + Engineering Mathematics', questions: 50 },
  { test: 'Test-12', date: '18 October 2026',   syllabus: 'Mixed Test 2: ICT + Ethics & Values', questions: 50 },
  { test: 'Test-13', date: '25 October 2026',   syllabus: 'Mixed Test 3: Standards & Quality Practices + Project Management', questions: 50 },
  { test: 'Test-14', date: '01 November 2026',  syllabus: 'Mixed Test 4: Energy & Environment + Current Issues', questions: 50 },
  { test: 'Test-15', date: '15 November 2026',  syllabus: 'Mixed Test 5: Engineering Aptitude + ICT (Advanced)', questions: 50 },
  { test: 'Test-16', date: '22 November 2026',  syllabus: 'Mixed Test 6: Engineering Mathematics + Ethics', questions: 50 },
  { test: 'Test-17', date: '29 November 2026',  syllabus: 'Mixed Test 7: Standards & Quality Practices + Project Management (Advanced)', questions: 50 },
  { test: 'Test-18', date: '06 December 2026',  syllabus: 'Mixed Test 8: Energy & Environment + Current Issues (Advanced)', questions: 50 },
  { test: 'Test-19', date: '13 December 2026',  syllabus: 'Full Length Test - 01', questions: 100 },
  { test: 'Test-20', date: '27 December 2026',  syllabus: 'Full Length Test - 02', questions: 100 },
  { test: 'Test-21', date: '11 January 2027',   syllabus: 'Full Length Test - 03', questions: 100 },
  { test: 'Test-22', date: '17 January 2027',   syllabus: 'Full Length Test - 04', questions: 100 },
];

const SCHEDULE_PAPER2 = [
  { test: 'Test-01', date: '02 August 2026',    syllabus: 'Solid Mechanics', questions: 75 },
  { test: 'Test-02', date: '09 August 2026',    syllabus: 'Design of Concrete & Masonry Structures + Building Materials', questions: 75 },
  { test: 'Test-03', date: '16 August 2026',    syllabus: 'Hydrology and Water Resource Engineering', questions: 75 },
  { test: 'Test-04', date: '23 August 2026',    syllabus: 'Transportation Engineering + Surveying and Geology', questions: 75 },
  { test: 'Test-05', date: '30 August 2026',    syllabus: 'Environmental Engineering', questions: 75 },
  { test: 'Test-06', date: '06 September 2026', syllabus: 'Flow of Fluids, Hydraulic Machines and Hydro Power', questions: 75 },
  { test: 'Test-07', date: '13 September 2026', syllabus: 'Construction Practice, Planning and Management', questions: 75 },
  { test: 'Test-08', date: '20 September 2026', syllabus: 'Design of Steel Structures', questions: 75 },
  { test: 'Test-09', date: '27 September 2026', syllabus: 'Geotechnical Engineering and Foundation Engineering', questions: 75 },
  { test: 'Test-10', date: '04 October 2026',   syllabus: 'Structural Analysis', questions: 75 },
  { test: 'Test-11', date: '11 October 2026',   syllabus: 'Mixed Test 1: Solid Mechanics + Structural Analysis', questions: 75 },
  { test: 'Test-12', date: '18 October 2026',   syllabus: 'Mixed Test 2: RCC Design + Steel Structures', questions: 75 },
  { test: 'Test-13', date: '25 October 2026',   syllabus: 'Mixed Test 3: Building Materials + Geotechnical Engineering', questions: 75 },
  { test: 'Test-14', date: '01 November 2026',  syllabus: 'Mixed Test 4: Surveying + Transportation Engineering', questions: 75 },
  { test: 'Test-15', date: '15 November 2026',  syllabus: 'Mixed Test 5: Environmental Engineering + Hydrology', questions: 75 },
  { test: 'Test-16', date: '22 November 2026',  syllabus: 'Mixed Test 6: Fluid Mechanics + Hydraulic Machines', questions: 75 },
  { test: 'Test-17', date: '29 November 2026',  syllabus: 'Mixed Test 7: Construction Planning + Design & Drawing', questions: 75 },
  { test: 'Test-18', date: '06 December 2026',  syllabus: 'Mixed Test 8: Environmental Engineering + Transportation Engineering', questions: 75 },
  { test: 'Test-19', date: '13 December 2026',  syllabus: 'Full Length Test - 01', questions: 150 },
  { test: 'Test-20', date: '27 December 2026',  syllabus: 'Full Length Test - 02', questions: 150 },
  { test: 'Test-21', date: '11 January 2027',   syllabus: 'Full Length Test - 03', questions: 150 },
  { test: 'Test-22', date: '17 January 2027',   syllabus: 'Full Length Test - 04', questions: 150 },
];

/* ── Program registry - one entry per Tally webhook route ──
   `paper` is used for the roll number exam code and single-paper email/PDF
   content; `combo` programs (Paper1+2) use both papers' schedules. */
const ESE_PROGRAMS = {
  paper1: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper1',
    examCode:   'P1',
    seriesName: 'ESE 2027 Prelims - Paper 1 (GS & Engineering Aptitude) - Offline Test Series',
    schedule:   SCHEDULE_PAPER1,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  paper2: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper2-civil',
    examCode:   'P2',
    seriesName: 'ESE 2027 Prelims - Paper 2 (Civil) - Offline Test Series',
    schedule:   SCHEDULE_PAPER2,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  combined: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-combined',
    seriesName: 'ESE 2027 Prelims - Paper 1 + 2 (GS, Eng. Aptitude & Civil) - Offline Test Series',
  },
  paper1Omr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper1-omr',
    examCode:   'P1',
    seriesName: 'ESE 2027 Prelims - Paper 1 (GS & Engineering Aptitude) - Home-Based OMR Test Series',
    schedule:   SCHEDULE_PAPER1,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  paper2Omr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr',
    examCode:   'P2',
    seriesName: 'ESE 2027 Prelims - Paper 2 (Civil) - Home-Based OMR Test Series',
    schedule:   SCHEDULE_PAPER2,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  combinedOmr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-combined-omr',
    seriesName: 'ESE 2027 Prelims - Paper 1 + 2 (GS, Eng. Aptitude & Civil) - Home-Based OMR Test Series',
  },
};

const TALLY_FORM_URL_PAPER1        = process.env.TALLY_FORM_URL_ESE_PAPER1        || 'https://tally.so/r/2E5JEg';
const TALLY_FORM_URL_PAPER2        = process.env.TALLY_FORM_URL_ESE_PAPER2        || 'https://tally.so/r/vGbOX4';
const TALLY_FORM_URL_COMBINED      = process.env.TALLY_FORM_URL_ESE_COMBINED      || 'https://tally.so/r/KYyJpD';
const TALLY_FORM_URL_PAPER1_OMR    = process.env.TALLY_FORM_URL_ESE_PAPER1_OMR    || 'https://tally.so/r/LZyJZz';
const TALLY_FORM_URL_PAPER2_OMR    = process.env.TALLY_FORM_URL_ESE_PAPER2_OMR    || 'https://tally.so/r/obQ7b5';
const TALLY_FORM_URL_COMBINED_OMR  = process.env.TALLY_FORM_URL_ESE_COMBINED_OMR  || 'https://tally.so/r/PdyXdP';

const WA_GROUP_OFFLINE = 'https://chat.whatsapp.com/GUWPBuhIKSBC4S1RW1NxMm?s=sh&p=a&ilr=4';
const WA_GROUP_OMR     = 'https://chat.whatsapp.com/L8gwagkk7Yz9mBS0oKmFnK?s=sh&p=a&ilr=4';

module.exports = {
  ESE_CENTRES,
  getEseCentreKey,
  SCHEDULE_PAPER1,
  SCHEDULE_PAPER2,
  ESE_PROGRAMS,
  TALLY_FORM_URL_PAPER1,
  TALLY_FORM_URL_PAPER2,
  TALLY_FORM_URL_COMBINED,
  TALLY_FORM_URL_PAPER1_OMR,
  TALLY_FORM_URL_PAPER2_OMR,
  TALLY_FORM_URL_COMBINED_OMR,
  WA_GROUP_OFFLINE,
  WA_GROUP_OMR,
};

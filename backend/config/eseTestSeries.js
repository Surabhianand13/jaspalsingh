/* ============================================================
   config/eseTestSeries.js
   Shared data for the 6 ESE 2027 Prelims Tally webhook flows
   (Paper 1, Paper 2 Civil, Combined - each Offline + Printed OMR).
   Kept separate from tally-webhook.js's RSSB JE data since the two
   exams have entirely different centres/schedules.
   ============================================================ */

/* ── Offline test centres ──
   Jaipur/Delhi confirmed (2026-07-19, shared with tally-webhook.js's RSSB
   centres). Bhopal/Hyderabad addresses still to be finalized. */
const ESE_CENTRES = {
  jaipur:    { name: 'Jaipur',    address: '33, White House, Opp. Zone Tech, Tonk Road, Madhuvan Colony, Mansingh Pura, Jaipur, Rajasthan 302015', mapsLink: 'https://maps.app.goo.gl/UiYpXv447AWrfyMX8' },
  delhi:     { name: 'Delhi',     address: 'P R Library, F-462, 1st Floor, Smart Point Building, Old MB Road, Lado Sarai, South Delhi 110030', mapsLink: 'https://maps.app.goo.gl/bv3wtG4rp7f6TuSk6' },
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

/* ── Combined P1+P2 (13-test) schedule - 4 Oct 2026 to 17 Jan 2027 ── */
const SCHEDULE_P1P2 = [
  { test: 'Test-01', date: '04 October 2026',  syllabus: 'P1: Current Issues | P2: Design of Concrete & Masonry Structures', questions: 125 },
  { test: 'Test-02', date: '11 October 2026',  syllabus: 'P1: Engineering Aptitude + Mathematics | P2: Solid Mechanics', questions: 125 },
  { test: 'Test-03', date: '18 October 2026',  syllabus: 'P1: Standards & Quality Practices | P2: Environmental Engineering', questions: 125 },
  { test: 'Test-04', date: '25 October 2026',  syllabus: 'P1: Basics of Energy & Environment | P2: Structural Analysis', questions: 125 },
  { test: 'Test-05', date: '01 November 2026', syllabus: 'P1: ICT | P2: Transportation, Water Resources & Hydrology', questions: 125 },
  { test: 'Test-06', date: '15 November 2026', syllabus: 'P1: Ethics & Values in Engineering | P2: Fluid Mechanics & Hydro Power', questions: 125 },
  { test: 'Test-07', date: '22 November 2026', syllabus: 'P1: Basics of Project Management | P2: Geotechnical & Foundation Engineering', questions: 125 },
  { test: 'Test-08', date: '29 November 2026', syllabus: 'P1: Design, Drawing & Safety | P2: Construction Practice, Planning & BMC', questions: 125 },
  { test: 'Test-09', date: '06 December 2026', syllabus: 'P1: Material Science & Engineering | P2: Design of Steel Structures + Surveying', questions: 125 },
  { test: 'Test-10', date: '13 December 2026', syllabus: 'Full Test 1 - P1: 100Q / P2: 150Q', questions: 250 },
  { test: 'Test-11', date: '27 December 2026', syllabus: 'Full Test 2 - P1: 100Q / P2: 150Q', questions: 250 },
  { test: 'Test-12', date: '11 January 2027',  syllabus: 'Full Test 3 - P1: 100Q / P2: 150Q', questions: 250 },
  { test: 'Test-13', date: '17 January 2027',  syllabus: 'Full Test 4 - P1: 100Q / P2: 150Q', questions: 250 },
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
    examCode:   'CMB',
    seriesName: 'ESE 2027 Prelims - Paper 1 + 2 (GS, Eng. Aptitude & Civil) - Offline Test Series',
  },
  paper1Omr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper1-omr',
    examCode:   'P1',
    seriesName: 'ESE 2027 Prelims - Paper 1 (GS & Engineering Aptitude) - Printed OMR Offline Test Series',
    schedule:   SCHEDULE_PAPER1,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  paper2Omr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr',
    examCode:   'P2',
    seriesName: 'ESE 2027 Prelims - Paper 2 (Civil) - Printed OMR Offline Test Series',
    schedule:   SCHEDULE_PAPER2,
    lastTestDate: '17 January 2027 (Test-22)',
  },
  combinedOmr: {
    slug:       'ese-2027-prelims-jaspalsirki-testseries-combined-omr',
    examCode:   'CMB',
    seriesName: 'ESE 2027 Prelims - Paper 1 + 2 (GS, Eng. Aptitude & Civil) - Printed OMR Offline Test Series',
  },
  p1p2Offline: {
    slug:         'ese-2027-prelims-jaspalsirki-testseries-p1p2-offline',
    examCode:     'P12',
    seriesName:   'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 + 2 Civil (Offline)',
    schedule:     SCHEDULE_P1P2,
    lastTestDate: '17 January 2027 (Test-13)',
  },
  p1p2Omr: {
    slug:         'ese-2027-prelims-jaspalsirki-testseries-p1p2-omr',
    examCode:     'P12',
    seriesName:   'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 + 2 Civil (Printed OMR)',
    schedule:     SCHEDULE_P1P2,
    lastTestDate: '17 January 2027 (Test-13)',
  },
};

const TALLY_FORM_URL_PAPER1        = process.env.TALLY_FORM_URL_ESE_PAPER1        || 'https://tally.so/r/2E5JEg';
const TALLY_FORM_URL_PAPER2        = process.env.TALLY_FORM_URL_ESE_PAPER2        || 'https://tally.so/r/vGbOX4';
const TALLY_FORM_URL_COMBINED      = process.env.TALLY_FORM_URL_ESE_COMBINED      || 'https://tally.so/r/KYyJpD';
const TALLY_FORM_URL_PAPER1_OMR    = process.env.TALLY_FORM_URL_ESE_PAPER1_OMR    || 'https://tally.so/r/LZyJZz';
const TALLY_FORM_URL_PAPER2_OMR    = process.env.TALLY_FORM_URL_ESE_PAPER2_OMR    || 'https://tally.so/r/obQ7b5';
const TALLY_FORM_URL_COMBINED_OMR  = process.env.TALLY_FORM_URL_ESE_COMBINED_OMR  || 'https://tally.so/r/PdyXdP';

const TALLY_FORM_URL_P1P2_OFFLINE  = process.env.TALLY_FORM_URL_ESE_P1P2_OFFLINE  || 'https://tally.so/r/9qe9A1';
const TALLY_FORM_URL_P1P2_OMR      = process.env.TALLY_FORM_URL_ESE_P1P2_OMR      || 'https://tally.so/r/xXGM8J';

const WA_GROUP_OFFLINE = 'https://chat.whatsapp.com/GUWPBuhIKSBC4S1RW1NxMm?s=sh&p=a&ilr=4';
const WA_GROUP_OMR     = 'https://chat.whatsapp.com/L8gwagkk7Yz9mBS0oKmFnK?s=sh&p=a&ilr=4';

module.exports = {
  ESE_CENTRES,
  getEseCentreKey,
  SCHEDULE_PAPER1,
  SCHEDULE_PAPER2,
  SCHEDULE_P1P2,
  ESE_PROGRAMS,
  TALLY_FORM_URL_PAPER1,
  TALLY_FORM_URL_PAPER2,
  TALLY_FORM_URL_COMBINED,
  TALLY_FORM_URL_PAPER1_OMR,
  TALLY_FORM_URL_PAPER2_OMR,
  TALLY_FORM_URL_COMBINED_OMR,
  TALLY_FORM_URL_P1P2_OFFLINE,
  TALLY_FORM_URL_P1P2_OMR,
  WA_GROUP_OFFLINE,
  WA_GROUP_OMR,
};

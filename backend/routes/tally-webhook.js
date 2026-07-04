/* ============================================================
   tally-webhook.js  -  Handles Tally form submissions
   Parses response, generates admit card PDF, sends email
   ============================================================ */

const express       = require('express');
const router        = express.Router();
const PDFDocument   = require('pdfkit');
const https         = require('https');
const http          = require('http');
const sharp         = require('sharp');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');

const FROM   = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* ── Centre data ─────────────────────────────────────────── */

const CENTRES = {
  kota: {
    name: 'Kota',
    address: 'Achievers Point, D-24, Main Road, Near Sarvottam Library, Shrinathpuram, Kota, Rajasthan - 324010',
    mapsLink: 'https://maps.app.goo.gl/fW4XGF3S7r5LYGMv5',
  },
  bikaner: {
    name: 'Bikaner',
    address: 'Holy Mission Public Sec. School, 2-E-24, Sector-2, Opposite Reliance Smart - Baba Bhawan, Pawanpuri, Bikaner - 334003',
    mapsLink: 'https://maps.app.goo.gl/Qdz84DDnmgokcugC8',
  },
  jaipur: {
    name: 'Jaipur',
    address: '311, Apex Mall, Lalkothi, Jaipur - 302015',
    mapsLink: 'https://maps.app.goo.gl/MzosW13pcH9pQ2Zn7',
  },
  sikar: {
    name: 'Sikar',
    address: 'Dev Library, Near Shree Balaji Hospital, Piprali Road, Sikar, Rajasthan',
    mapsLink: 'https://maps.app.goo.gl/sWNomYeyfFjDc8xK6?g_st=iw',
  },
  jodhpur: {
    name: 'Jodhpur',
    address: '2nd Floor, 19-B, UIT Road, Near Bhaskar Circle, Ratanada, Jodhpur, Rajasthan - 342001',
    mapsLink: 'https://share.google/fPw3qqIjy1A1jTsin',
  },
  alwar: {
    name: 'Alwar',
    address: 'To be announced - contact us on WhatsApp for details',
    mapsLink: 'https://wa.me/919829133317',
  },
  ajmer: {
    name: 'Ajmer',
    address: 'To be announced - contact us on WhatsApp for details',
    mapsLink: 'https://wa.me/919829133317',
  },
};

/* ── Schedule content ────────────────────────────────────── */

const SCHEDULE_DEGREE = [
  { test: 'Test-01', date: '05 July 2026',       syllabus: 'Rajasthan Geography-I + Building Technology & Construction Management',       questions: 120 },
  { test: 'Test-02', date: '12 July 2026',       syllabus: 'Rajasthan History-I + Fluid Mechanics',                                        questions: 120 },
  { test: 'Test-03', date: '19 July 2026',       syllabus: 'Rajasthan Art & Culture-I + Surveying, Estimating Costing & Field Engineering', questions: 120 },
  { test: 'Test-04', date: '26 July 2026',       syllabus: 'Rajasthan Political & Administrative System-I + Irrigation & Water Resources',  questions: 120 },
  { test: 'Test-05', date: '02 August 2026',     syllabus: 'Rajasthan Geography-II + Theory of Structures & Strength of Materials',        questions: 120 },
  { test: 'Test-06', date: '09 August 2026',     syllabus: 'Rajasthan History-II + Structural Analysis',                                   questions: 120 },
  { test: 'Test-07', date: '16 August 2026',     syllabus: 'Rajasthan Art & Culture-II + Soil Mechanics & Foundation Engineering',         questions: 120 },
  { test: 'Test-08', date: '23 August 2026',     syllabus: 'Rajasthan Political & Administrative System-II + Design of RCC & Masonry Structures', questions: 120 },
  { test: 'Test-09', date: '30 August 2026',     syllabus: 'Rajasthan GK Mixed Revision-I + Design of Steel Structures',                  questions: 120 },
  { test: 'Test-10', date: '06 September 2026',  syllabus: 'Rajasthan GK Mixed Revision-II + Construction Technology',                    questions: 120 },
  { test: 'Test-11', date: '13 September 2026',  syllabus: 'Rajasthan GK Mixed Revision-III + AutoCAD Civil Engineering Drawing',         questions: 120 },
  { test: 'Test-12', date: '20 September 2026',  syllabus: 'Rajasthan GK Mixed Revision-IV + Public Health Engineering',                  questions: 120 },
  { test: 'Test-13', date: '27 September 2026',  syllabus: 'Rajasthan GK Mixed Revision-V + Highway & Bridges',                           questions: 120 },
  { test: 'Test-14', date: '04 October 2026',    syllabus: 'Full Length Test-01',  questions: 120 },
  { test: 'Test-15', date: '11 October 2026',    syllabus: 'Full Length Test-02',  questions: 120 },
  { test: 'Test-16', date: '18 October 2026',    syllabus: 'Full Length Test-03',  questions: 120 },
  { test: 'Test-17', date: '25 October 2026',    syllabus: 'Full Length Test-04',  questions: 120 },
  { test: 'Test-18', date: '01 November 2026',   syllabus: 'Full Length Test-05',  questions: 120 },
  { test: 'Test-19', date: '08 November 2026',   syllabus: 'Full Length Test-06',  questions: 120 },
  { test: 'Test-20', date: '15 November 2026',   syllabus: 'Full Length Test-07',  questions: 120 },
  { test: 'Test-21', date: '22 November 2026',   syllabus: 'Full Length Test-08',  questions: 120 },
  { test: 'Test-22', date: '29 November 2026',   syllabus: 'Full Length Test-09',  questions: 120 },
  { test: 'Test-23', date: '06 December 2026',   syllabus: 'Full Length Test-10',  questions: 120 },
  { test: 'Test-24', date: '13 December 2026',   syllabus: 'Full Length Test-11',  questions: 120 },
  { test: 'Test-25', date: '20 December 2026',   syllabus: 'Full Length Test-12',  questions: 120 },
  { test: 'Test-26', date: '27 December 2026',   syllabus: 'Full Length Test-13',  questions: 120 },
  { test: 'Test-27', date: '03 January 2027',    syllabus: 'Full Length Test-14',  questions: 120 },
  { test: 'Test-28', date: '10 January 2027',    syllabus: 'Full Length Test-15',  questions: 120 },
];

const SCHEDULE_DIPLOMA = [
  { test: 'Test-01', date: '05 July 2026',      syllabus: 'Rajasthan GK (Geography) + Building Technology & Construction Management',       questions: 120 },
  { test: 'Test-02', date: '12 July 2026',      syllabus: 'Rajasthan GK (History) + Surveying, Estimating & Costing',                      questions: 120 },
  { test: 'Test-03', date: '19 July 2026',      syllabus: 'Rajasthan GK (Art & Culture) + Strength of Materials',                          questions: 120 },
  { test: 'Test-04', date: '26 July 2026',      syllabus: 'Rajasthan GK (Political & Administrative System) + Reinforced Concrete Design',  questions: 120 },
  { test: 'Test-05', date: '02 August 2026',    syllabus: 'Rajasthan GK Mixed Revision-I + Irrigation & Water Resources',                  questions: 120 },
  { test: 'Test-06', date: '09 August 2026',    syllabus: 'Rajasthan GK Mixed Revision-II + Soil Engineering',                             questions: 120 },
  { test: 'Test-07', date: '16 August 2026',    syllabus: 'Rajasthan GK Mixed Revision-III + AutoCAD Civil Engineering Drawing',           questions: 120 },
  { test: 'Test-08', date: '23 August 2026',    syllabus: 'Full Length Test-01',  questions: 120 },
  { test: 'Test-09', date: '30 August 2026',    syllabus: 'Full Length Test-02',  questions: 120 },
  { test: 'Test-10', date: '06 September 2026', syllabus: 'Full Length Test-03',  questions: 120 },
  { test: 'Test-11', date: '13 September 2026', syllabus: 'Full Length Test-04',  questions: 120 },
  { test: 'Test-12', date: '20 September 2026', syllabus: 'Full Length Test-05',  questions: 120 },
  { test: 'Test-13', date: '27 September 2026', syllabus: 'Full Length Test-06',  questions: 120 },
  { test: 'Test-14', date: '04 October 2026',   syllabus: 'Full Length Test-07',  questions: 120 },
  { test: 'Test-15', date: '11 October 2026',   syllabus: 'Full Length Test-08',  questions: 120 },
  { test: 'Test-16', date: '18 October 2026',   syllabus: 'Full Length Test-09',  questions: 120 },
  { test: 'Test-17', date: '25 October 2026',   syllabus: 'Full Length Test-10',  questions: 120 },
  { test: 'Test-18', date: '01 November 2026',  syllabus: 'Full Length Test-11',  questions: 120 },
  { test: 'Test-19', date: '08 November 2026',  syllabus: 'Full Length Test-12',  questions: 120 },
  { test: 'Test-20', date: '15 November 2026',  syllabus: 'Full Length Test-13',  questions: 120 },
  { test: 'Test-21', date: '22 November 2026',  syllabus: 'Full Length Test-14',  questions: 120 },
  { test: 'Test-22', date: '29 November 2026',  syllabus: 'Full Length Test-15',  questions: 120 },
];

const DOS_AND_DONTS = `
DOs:
- Carry this Admit Card (printed or on phone) to every test
- Reach the centre at least 15 minutes before the test start time
- Bring a valid Govt Photo ID (Aadhar, Voter ID, Driving Licence, Passport)
- Use only a blue or black ballpoint pen
- Negative Marking: 0.33 marks deducted per wrong answer
- Review your answers before the time limit ends
- Collect your Detailed Solution Booklet after each test

DON'Ts:
- Do NOT bring mobile phones, smartwatches, or electronic devices inside the exam hall
- Do NOT use pencil, gel pens, or whitener on the OMR sheet
- Do NOT share your admit card or attend on behalf of another student
- Do NOT arrive late - latecomers will not be allowed entry once the test begins
- Do NOT discuss questions with others during the test
- Do NOT carry books, notes, or study material into the exam hall
`.trim();

/* ── Roll number generator ───────────────────────────────── */

function generateRollNumber(centre, targetExam) {
  const prefix = centre.slice(0, 3).toUpperCase();
  const examCode = targetExam.toLowerCase().includes('degree') ? 'DEG' : 'DIP';
  const num = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${examCode}-${num}`;
}

/* ── Parse Tally webhook payload ─────────────────────────── */

function resolveValue(field) {
  const raw = field.value;
  if (!raw && raw !== 0) return '';

  /* Tally sends dropdown/multiple-choice as an array of option IDs.
     Cross-reference with field.options to get the human-readable text. */
  if (Array.isArray(raw)) {
    const options = field.options || [];
    const texts = raw.map(v => {
      if (typeof v === 'object' && v !== null) return v.text || v.label || '';
      const match = options.find(o => o.id === v);
      return match ? match.text : String(v);
    });
    return texts.filter(Boolean).join(', ');
  }

  if (typeof raw === 'object' && raw !== null) return raw.text || raw.label || JSON.stringify(raw);
  return String(raw).trim();
}

function parseTallyFields(fields) {
  const result = {};
  console.log('[tally-webhook] Raw fields:', JSON.stringify(fields, null, 2));

  for (const field of fields) {
    const label = (field.label || '').toLowerCase().trim();
    const value = resolveValue(field);

    if (label.includes('name') && !label.includes('exam') && !label.includes('centre') && !label.includes('center')) {
      result.name = value;
    }
    if (label.includes('govt') || label.includes('id proof') || label.includes('aadhar') || label.includes('voter')) {
      result.govtId = value;
    }
    if (label.includes('centre') || label.includes('center') || label.includes('location')) {
      result.centre = value;
    }
    if (label.includes('target') || label.includes('exam') || label.includes('course') || label.includes('degree') || label.includes('diploma')) {
      if (!label.includes('centre') && !label.includes('center')) result.targetExam = value;
    }
    if (label.includes('phone') || label.includes('mobile') || label.includes('contact') || label.includes('whatsapp') || label.includes('number')) {
      if (!result.phone) result.phone = value;
    }
    if (label.includes('email')) {
      result.email = value;
    }
    if (label.includes('photo') || label.includes('photograph') || label.includes('picture') || label.includes('image')) {
      // Tally file uploads come as array of objects with a url property
      const raw = field.value;
      if (Array.isArray(raw) && raw.length && raw[0].url) result.photoUrl = raw[0].url;
      else if (typeof raw === 'object' && raw && raw.url) result.photoUrl = raw.url;
      else if (typeof raw === 'string' && raw.startsWith('http')) result.photoUrl = raw;
    }
    if (label === 'token' || label.includes('form token') || label.includes('enrollment token')) {
      result.token = value;
    }
  }

  console.log('[tally-webhook] Parsed:', result);
  return result;
}

/* ── Normalise centre name to a key ─────────────────────── */

function getCentreKey(centreValue) {
  const v = (centreValue || '').toLowerCase();
  if (v.includes('kota'))    return 'kota';
  if (v.includes('bikaner')) return 'bikaner';
  if (v.includes('jaipur'))  return 'jaipur';
  if (v.includes('sikar'))   return 'sikar';
  if (v.includes('jodhpur')) return 'jodhpur';
  if (v.includes('alwar'))   return 'alwar';
  if (v.includes('ajmer'))   return 'ajmer';
  return null;
}

/* ── Fetch remote image as buffer ────────────────────────── */

function downloadRaw(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    // Without a timeout, a stalled upstream response hangs this request
    // forever - the whole admit card email would silently never send.
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/* Downscales/recompresses the candidate photo before it gets embedded in the
   PDF - source uploads can be multi-MB camera photos, which would otherwise
   bloat the email attachment and occasionally fail to embed cleanly. */
async function fetchImageBuffer(url) {
  if (!url) return null;
  const raw = await downloadRaw(url);
  if (!raw) return null;
  try {
    return await sharp(raw)
      .rotate() // respect EXIF orientation before resizing
      .resize({ width: 400, height: 500, fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.warn('[fetchImageBuffer] resize failed, using original:', e.message);
    return raw;
  }
}

/* ── Generate admit card PDF buffer ─────────────────────── */

function generateAdmitCard({ name, govtId, rollNumber, centre, targetExam, phone, email, photoBuffer, seriesName, lastTestDate, mode = 'offline' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    const W  = doc.page.width;   // 595
    const H  = doc.page.height;  // 841
    const M  = 30;               // side margin
    const CW = W - M * 2;

    /* ── Palette ── */
    const RED    = '#C81240';
    const DARK   = '#0f172a';
    const NAVY   = '#1A1A2E';
    const MID    = '#475569';
    const LIGHT  = '#94a3b8';
    const BG     = '#f8fafc';
    const WHITE  = '#ffffff';
    const BORD   = '#e2e8f0';
    const AMBER  = '#f59e0b';
    const AMBERB = '#78350f';
    const AMBERG = '#fff7ed';

    /* ══════════════════════════════════════════════
       HEADER  (dark gradient band, 0 - 110)
    ══════════════════════════════════════════════ */
    // Dark background
    doc.rect(0, 0, W, 110).fill(NAVY);
    // Accent red stripe at very top
    doc.rect(0, 0, W, 4).fill(RED);

    // Watermark-style large text (low opacity simulation via light grey)
    doc.fillColor('#ffffff').opacity(0.04).font('Helvetica-Bold').fontSize(72)
       .text('ADMIT', 60, 20, { lineBreak: false });
    doc.opacity(1);

    // Brand
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(22)
       .text('Dr. Jaspal Singh', M, 18, { width: CW, align: 'center', lineBreak: false });
    doc.fillColor(LIGHT).font('Helvetica').fontSize(8.5)
       .text(seriesName + '  |  jaspalsingh.in', M, 46, { width: CW, align: 'center', lineBreak: false });

    // ADMIT CARD pill badge
    const bW = 126, bH = 22, bX = (W - bW) / 2, bY = 62;
    doc.roundedRect(bX, bY, bW, bH, 11).fill(RED);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8.5)
       .text('A D M I T   C A R D', bX, bY + 6.5, { width: bW, align: 'center', lineBreak: false });

    // Subtle bottom border for header
    doc.rect(0, 109, W, 1.5).fill(RED);

    /* ══════════════════════════════════════════════
       MAIN CONTENT  starts at y = 120
    ══════════════════════════════════════════════ */
    doc.rect(0, 110, W, H - 110).fill(WHITE);

    let y = 120;

    /* ── Roll number highlight bar ── */
    doc.rect(M, y, CW, 30).fill(BG);
    doc.rect(M, y, 3, 30).fill(RED);
    // Roll label
    doc.fillColor(MID).font('Helvetica').fontSize(7.5)
       .text('ROLL NUMBER', M + 12, y + 5, { lineBreak: false });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14)
       .text(rollNumber, M + 12, y + 14, { lineBreak: false });
    // Series on right
    doc.fillColor(MID).font('Helvetica').fontSize(7.5)
       .text(mode === 'home' ? 'MODE' : 'EXAM CENTRE', M + 200, y + 5, { lineBreak: false });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
       .text(centre || 'TBD', M + 200, y + 16, { lineBreak: false });

    y += 38;

    /* ── Student details + photo ── */
    const PHOTO_W = 88, PHOTO_H = 108;
    const photoX  = W - M - PHOTO_W;
    const detailsW = CW - PHOTO_W - 16;

    // Photo box
    doc.roundedRect(photoX, y, PHOTO_W, PHOTO_H, 4)
       .lineWidth(1.5).strokeColor(BORD).stroke();
    if (photoBuffer) {
      try {
        doc.save();
        doc.roundedRect(photoX + 1.5, y + 1.5, PHOTO_W - 3, PHOTO_H - 3, 3).clip();
        doc.image(photoBuffer, photoX + 1.5, y + 1.5, { width: PHOTO_W - 3, height: PHOTO_H - 3, cover: [PHOTO_W - 3, PHOTO_H - 3] });
        doc.restore();
      } catch(e) {
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
           .text('Photo', photoX, y + PHOTO_H / 2 - 4, { width: PHOTO_W, align: 'center', lineBreak: false });
      }
    } else {
      doc.roundedRect(photoX, y, PHOTO_W, PHOTO_H, 4).fill('#f1f5f9');
      doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
         .text('Photograph', photoX, y + PHOTO_H / 2 - 4, { width: PHOTO_W, align: 'center', lineBreak: false });
    }
    // Photo caption
    doc.fillColor(LIGHT).font('Helvetica').fontSize(6.5)
       .text('Candidate Photo', photoX, y + PHOTO_H + 3, { width: PHOTO_W, align: 'center', lineBreak: false });

    // Section heading
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(8)
       .text('STUDENT DETAILS', M, y, { lineBreak: false });
    y += 13;

    const details = [
      ['Candidate Name', name],
      ['Govt ID',        govtId || 'N/A'],
      ['Mobile',         phone],
      ['Email',          email],
      ['Program',        seriesName],
    ];

    for (const [lbl, val] of details) {
      doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
         .text(lbl, M, y, { width: detailsW, lineBreak: false });
      y += 9;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
         .text(val || 'N/A', M, y, { width: detailsW, lineBreak: false });
      y += 14;
    }

    // Move y below photo if content is shorter
    const photoBottom = 158 + PHOTO_H + 14;
    if (y < photoBottom) y = photoBottom;

    /* ── Divider ── */
    doc.rect(M, y, CW, 0.75).fill(BORD);
    y += 12;

    /* ── Instructions in 2 columns ── */
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(8.5)
       .text('IMPORTANT INSTRUCTIONS', M, y, { lineBreak: false });
    y += 13;

    const instructions = mode === 'home' ? [
      'Question Paper & OMR Sheet PDFs emailed on each test morning.',
      'Print both PDFs and attempt the test on paper at home.',
      'Fill your answers using a blue or black ballpoint pen only.',
      'Reply to the test email with a clear photo of your filled OMR sheet.',
      'Submit before 10:00 PM on the same day - no evaluation after that.',
      'Negative Marking: 0.33 marks deducted per wrong answer.',
    ] : [
      'Carry this Admit Card (printed or on phone) to every test.',
      'Reach centre at least 15 minutes before test start time.',
      'Bring a valid Govt Photo ID (Aadhar / Voter ID / Passport).',
      'Negative Marking: 0.33 marks deducted per wrong answer.',
      'No mobile phones or electronic devices inside the exam hall.',
      'Detailed Solution Booklet will be distributed after each test.',
    ];

    const colW = (CW - 12) / 2;
    const startY = y;
    instructions.forEach((line, i) => {
      const col = i < 3 ? 0 : 1;
      const cx  = M + col * (colW + 12);
      const cy  = startY + (i % 3) * 16;
      // Bullet dot
      doc.roundedRect(cx, cy + 3.5, 4, 4, 2).fill(RED);
      doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
         .text(line, cx + 9, cy, { width: colW - 9, lineBreak: false });
    });
    y = startY + 3 * 16 + 8;

    /* ── Divider ── */
    doc.rect(M, y, CW, 0.75).fill(BORD);
    y += 10;

    /* ── Validity note (single line, contained) ── */
    const validityText = `Valid for: ${seriesName}${lastTestDate ? '  |  Valid till: ' + lastTestDate : ''}  |  Schedule subject to change - notified via email & WhatsApp.`;
    doc.rect(M, y, CW, 22).fill(AMBERG);
    doc.rect(M, y, 3, 22).fill(AMBER);
    doc.fillColor(AMBERB).font('Helvetica-Bold').fontSize(7)
       .text('VALIDITY NOTE  ', M + 10, y + 7.5, { continued: true, lineBreak: false })
       .font('Helvetica').fontSize(7)
       .text(validityText, { width: CW - 20, lineBreak: false });
    y += 30;

    /* ── Signature line ── */
    doc.rect(M + CW - 120, y, 120, 0.75).fill(DARK);
    doc.fillColor(MID).font('Helvetica').fontSize(7)
       .text('Authorised Signatory', M + CW - 120, y + 3, { width: 120, align: 'center', lineBreak: false });
    y += 22;

    /* ── Footer band (placed after content, not absolute) ── */
    doc.rect(0, y, W, 28).fill(DARK);
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
       .text(
         'Computer-generated  |  No signature required  |  jaspalsingh.in  |  +91 98291 33317',
         M, y + 9.5, { width: CW, align: 'center', lineBreak: false }
       );

    doc.end();
  });
}


/* ── Build admit card email HTML ─────────────────────────── */

function buildAdmitCardHtml({ name, seriesName, centreInfo, schedule, isDegreeCourse }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;max-width:620px;margin:0 auto;padding:20px;">

  <div style="background:#0f172a;border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Dr. Jaspal Singh</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">jaspalsingh.in</p>
  </div>

  <p style="font-size:16px;">Dear <strong>${name || 'Student'}</strong>,</p>
  <p>Congratulations! Your registration for the <strong>${seriesName}</strong> has been confirmed.</p>
  <p>Please find your <strong>Admit Card attached</strong> to this email as a PDF. Carry it (printed or on your phone) to every test.</p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:20px 0;">
    <h2 style="font-size:15px;margin:0 0 12px;color:#c81240;">Your Exam Centre</h2>
    <p style="margin:4px 0;"><strong>Centre:</strong> ${centreInfo.name}</p>
    <p style="margin:4px 0;"><strong>Address:</strong> ${centreInfo.address}</p>
    <p style="margin:8px 0 0;">
      <a href="${centreInfo.mapsLink}" style="background:#c81240;color:#fff;text-decoration:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:bold;">
        View on Google Maps
      </a>
    </p>
  </div>

  <div style="margin:20px 0;">
    <h2 style="font-size:15px;color:#c81240;margin-bottom:12px;">Test Schedule</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#0f172a;color:#fff;">
          <th style="padding:8px 10px;text-align:left;">Test</th>
          <th style="padding:8px 10px;text-align:left;">Date</th>
          <th style="padding:8px 10px;text-align:left;">Syllabus</th>
          <th style="padding:8px 10px;text-align:center;">Qs</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${r.test}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${r.date}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${r.syllabus}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.questions}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:#64748b;margin-top:8px;">
      * Schedule may be revised after the official RSSB JE 2026 examination date announcement.
    </p>
  </div>

  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:20px 24px;margin:20px 0;">
    <h2 style="font-size:15px;margin:0 0 12px;color:#92400e;">Do's and Don'ts</h2>
    <p style="font-size:13px;font-weight:bold;margin:10px 0 6px;color:#15803d;">DOs:</p>
    <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;">
      <li>Carry this Admit Card (printed or on phone) to every test</li>
      <li>Reach the centre at least <strong>15 minutes before</strong> the test start time</li>
      <li>Bring a valid Govt Photo ID (Aadhar, Voter ID, Driving Licence, Passport)</li>
      <li>Use only a <strong>blue or black ballpoint pen</strong></li>
      <li>Negative Marking: <strong>0.33 marks deducted per wrong answer</strong></li>
      <li>Collect your Detailed Solution Booklet after each test</li>
      ${!isDegreeCourse ? `
      <li style="margin-top:10px;color:#1e40af;"><strong>Hindi Instructions (Diploma):</strong></li>
      <li>9. यदि आप प्रश्न का उत्तर नहीं देना चाहते हैं तो उत्तर-पत्रक में पाँचवें (5) विकल्प को गहरा करें।</li>
      <li>10. प्रश्न-पत्र हल करने के उपरान्त अभ्यर्थी अनिवार्य रूप से ओ.एम.आर. उत्तर-पत्रक जाँच लें।</li>
      <li>11. यदि अभ्यर्थी 10% से अधिक प्रश्नों में कोई विकल्प अंकित नहीं करता है तो उसको अयोग्य माना जायेगा।</li>
      ` : ''}
    </ul>
    <p style="font-size:13px;font-weight:bold;margin:10px 0 6px;color:#dc2626;">DON'Ts:</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;">
      <li>Do NOT bring mobile phones, smartwatches, or electronic devices inside the exam hall</li>
      <li>Do NOT use pencil, gel pens, or whitener on the OMR sheet</li>
      <li>Do NOT arrive late - latecomers may not be allowed entry</li>
      <li>Do NOT carry books, notes, or study material into the exam hall</li>
    </ul>
  </div>

  <p style="font-size:14px;">For any queries, feel free to reach out on WhatsApp or call us directly.</p>
  <p style="font-size:14px;margin-top:20px;">
    Best wishes for your preparation!<br/>
    <strong>Dr. Jaspal Singh</strong><br/>
    <a href="https://jaspalsingh.in" style="color:#c81240;">jaspalsingh.in</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:11px;color:#94a3b8;text-align:center;">This is an automated confirmation email. Please do not reply to this email.</p>
</body>
</html>`;
}

/* ── Schedule rows as plain text for email ───────────────── */


/* ── Send rejection email ─────────────────────────────────── */

async function sendRejectionEmail(toEmail, reason, contactLink) {
  await resendSend({
    from: FROM,
    to:   toEmail,
    subject: 'Enrollment form - action needed | jaspalsingh.in',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#991b1b;">Your form submission could not be processed</p>
      <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.65;">${reason}</p>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
      If you believe this is an error or need help, please contact us immediately on WhatsApp so we can resolve it quickly.
    </p>
    <a href="https://wa.me/919829133317?text=${encodeURIComponent('Hi, I need help with my enrollment form submission for jaspalsingh.in')}"
       style="display:inline-block;background:#25D366;color:#fff;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      WhatsApp Us Now →
    </a>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  }).catch(e => console.error('[rejection email]', e.message));
}

/* ── Require DB for token validation ─────────────────────── */
const { query } = require('../config/db');

/* ── Process and send email (runs async after responding) ── */

/* programType: 'degree' | 'diploma' | null (auto-detect from field) */
async function processSubmission(fields, programType) {
  const { name, govtId, centre: centreRaw, targetExam, phone, email, photoUrl, token } = parseTallyFields(fields);

  if (!email) {
    console.warn('[tally-webhook] No email found in fields');
    return;
  }

  /* ── Token + payment verification ─────────────────────── */
  const normEmail = email.toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token) {
    console.warn('[tally-webhook] No token in submission - rejecting');
    await sendRejectionEmail(email,
      'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email. Please check your email for the "Fill Details Form" button and use that link.'
    );
    return;
  }

  // Look up token - validate it exists and is not already used
  const lookupResult = await query(
    `SELECT id, student_email, student_phone, form_used, form_token FROM enrollments WHERE form_token = $1`,
    [token]
  );

  if (!lookupResult.rows.length) {
    console.warn('[tally-webhook] Invalid token:', token);
    await sendRejectionEmail(email,
      'The enrollment token in your submission is invalid or does not match any paid enrollment. Please use the original link sent in your enrollment email.'
    );
    return;
  }

  if (lookupResult.rows[0].form_used) {
    console.warn('[tally-webhook] Token already used (pre-check), enrollment:', lookupResult.rows[0].id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake in your earlier submission, please contact us on WhatsApp immediately and we will assist you.'
    );
    return;
  }

  const preCheck = lookupResult.rows[0];

  // Verify email matches payment
  const expectedEmail = (preCheck.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    console.warn('[tally-webhook] Email mismatch - submitted:', normEmail, 'expected:', expectedEmail);
    await sendRejectionEmail(email,
      `The email address you entered (${email}) does not match the email used during payment (${preCheck.student_email}). Please re-open the form using the link in your enrollment email and enter the same email address you used at checkout.`
    );
    return;
  }

  // Verify phone matches payment (last 10 digits)
  const expectedPhone = (preCheck.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    console.warn('[tally-webhook] Phone mismatch - submitted:', normPhone, 'expected:', expectedPhone);
    await sendRejectionEmail(email,
      `The mobile number you entered does not match the number used during payment (+91 ${expectedPhone}). Please re-open the form using the link in your enrollment email and enter the same mobile number you used at checkout.`
    );
    return;
  }

  // Atomically mark token as used - WHERE form_used = FALSE ensures only one
  // concurrent request can win even if two webhooks arrive simultaneously.
  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW()
     WHERE form_token = $1 AND form_used = FALSE
     RETURNING id`,
    [token]
  );

  if (!claimResult.rows.length) {
    // Another concurrent request already claimed this token
    console.warn('[tally-webhook] Token race - already claimed, enrollment:', preCheck.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake in your earlier submission, please contact us on WhatsApp immediately and we will assist you.'
    );
    return;
  }

  const enrollment = preCheck;
  console.log('[tally-webhook] Token claimed, processing enrollment:', enrollment.id);

  const centreKey  = getCentreKey(centreRaw);
  const centreInfo = CENTRES[centreKey] || { name: centreRaw || 'TBD', address: 'TBD', mapsLink: '#' };

  const isDegreeCourse = programType === 'degree'
    ? true
    : programType === 'diploma'
      ? false
      : (targetExam || '').toLowerCase().includes('degree');
  const schedule     = isDegreeCourse ? SCHEDULE_DEGREE : SCHEDULE_DIPLOMA;
  const seriesName   = isDegreeCourse
    ? 'RSSB JE 2026 - Degree (Civil) - Offline Test Series'
    : 'RSSB JE 2026 - Diploma (Civil) - Offline Test Series';
  const lastTestDate = isDegreeCourse ? '10 January 2027 (Test-28)' : '29 November 2026 (Test-22)';

  const rollNumber   = generateRollNumber(centreKey || centreRaw, targetExam || '');
  const photoBuffer  = photoUrl ? await fetchImageBuffer(photoUrl) : null;

  const pdfBuffer = await generateAdmitCard({
    name:         name || 'Student',
    govtId:       govtId || 'N/A',
    rollNumber,
    centre:       centreInfo.name,
    targetExam:   targetExam || seriesName,
    phone:        phone || 'N/A',
    email:        email || 'N/A',
    photoBuffer,
    seriesName,
    lastTestDate,
  });

  const htmlBody = buildAdmitCardHtml({ name, seriesName, centreInfo, schedule, isDegreeCourse });

  /* Send email via Resend queue */
  const result = await resendSend({
    from:        FROM,
    to:          email,
    subject:     `Confirmed! Your Admit Card for ${seriesName}`,
    html:        htmlBody,
    attachments: [
      {
        filename:    `AdmitCard_${rollNumber}.pdf`,
        content:     pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      },
    ],
  }, PRIORITY.ADMIT_CARD);

  if (result.error) {
    console.error('[tally-webhook] Resend error:', result.error);
  } else {
    console.log(`[tally-webhook] Email sent to ${email} | Roll: ${rollNumber}`);
  }
}

/* ── POST /api/tally-webhook (legacy combined form) ─────── */

router.post('/', (req, res) => {
  const eventType = req.body.eventType;
  res.status(200).json({ ok: true });
  if (eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processSubmission(fields, null).catch(err => {
    console.error('[tally-webhook] Error processing submission:', err);
  });
});

module.exports = router;
module.exports.processSubmission   = processSubmission;
module.exports.generateAdmitCard   = generateAdmitCard;
module.exports.buildAdmitCardHtml  = buildAdmitCardHtml;
module.exports.fetchImageBuffer    = fetchImageBuffer;
module.exports.getCentreKey        = getCentreKey;
module.exports.CENTRES             = CENTRES;
module.exports.SCHEDULE_DEGREE     = SCHEDULE_DEGREE;
module.exports.SCHEDULE_DIPLOMA    = SCHEDULE_DIPLOMA;

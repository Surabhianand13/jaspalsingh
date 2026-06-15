/* ============================================================
   tally-webhook.js  -  Handles Tally form submissions
   Parses response, generates admit card PDF, sends email
   ============================================================ */

const express      = require('express');
const router       = express.Router();
const nodemailer   = require('nodemailer');
const PDFDocument  = require('pdfkit');

/* ── Centre data ─────────────────────────────────────────── */

const CENTRES = {
  kota: {
    name: 'Kota',
    address: 'Jaspal Sir Classes, Near Kunhadi, Kota, Rajasthan - 324001',
    mapsLink: 'https://maps.app.goo.gl/fW4XGF3S7r5LYGMv5',
  },
  bikaner: {
    name: 'Bikaner',
    address: 'Jaspal Sir Classes, Bikaner, Rajasthan - 334001',
    mapsLink: 'https://maps.app.goo.gl/Qdz84DDnmgokcugC8',
  },
  jaipur: {
    name: 'Jaipur',
    address: 'Jaspal Sir Classes, Jaipur, Rajasthan - 302001',
    mapsLink: 'https://maps.app.goo.gl/MzosW13pcH9pQ2Zn7',
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
- Attempt all 120 questions - there is NO negative marking
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

function parseTallyFields(fields) {
  const result = {};
  for (const field of fields) {
    const label = (field.label || '').toLowerCase().trim();
    const value = Array.isArray(field.value)
      ? field.value.join(', ')
      : String(field.value || '').trim();

    if (label.includes('name') && !label.includes('exam') && !label.includes('centre'))  result.name       = value;
    if (label.includes('govt') || label.includes('id'))                                   result.govtId     = value;
    if (label.includes('centre') || label.includes('center'))                             result.centre     = value;
    if (label.includes('target') || (label.includes('exam') && !label.includes('centre'))) result.targetExam = value;
    if (label.includes('phone') || label.includes('mobile'))                              result.phone      = value;
    if (label.includes('email'))                                                           result.email      = value;
  }
  return result;
}

/* ── Normalise centre name to a key ─────────────────────── */

function getCentreKey(centreValue) {
  const v = (centreValue || '').toLowerCase();
  if (v.includes('kota'))    return 'kota';
  if (v.includes('bikaner')) return 'bikaner';
  if (v.includes('jaipur'))  return 'jaipur';
  return null;
}

/* ── Generate admit card PDF buffer ─────────────────────── */

function generateAdmitCard({ name, govtId, rollNumber, centre, targetExam, phone }) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    const W = doc.page.width;

    /* Header band */
    doc.rect(0, 0, W, 120).fill('#0f172a');
    doc.fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('Dr. Jaspal Singh', 50, 28, { align: 'center' });
    doc.font('Helvetica')
      .fontSize(11)
      .fillColor('#94a3b8')
      .text('RSSB JE Test Series 2026  -  jaspalsingh.in', 50, 58, { align: 'center' });
    doc.fillColor('#f8fafc')
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('ADMIT CARD', 50, 84, { align: 'center' });

    /* Divider */
    doc.rect(50, 138, W - 100, 2).fill('#c81240');

    /* Student details */
    const details = [
      ['Candidate Name',  name],
      ['Roll Number',     rollNumber],
      ['Govt ID',         govtId],
      ['Exam Centre',     centre],
      ['Target Exam',     targetExam],
      ['Mobile',          phone],
    ];

    let y = 158;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a')
      .text('Student Details', 50, y);
    y += 24;

    for (const [label, value] of details) {
      doc.fillColor('#64748b').font('Helvetica').fontSize(10).text(label, 50, y);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(value || 'N/A', 200, y);
      y += 22;
    }

    /* Divider */
    y += 8;
    doc.rect(50, y, W - 100, 1).fill('#e2e8f0');
    y += 16;

    /* Important instructions */
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a')
      .text('Important Instructions', 50, y);
    y += 20;

    const instructions = [
      'Carry this admit card (printed or digital) to every test session.',
      'Reach the centre at least 15 minutes before the test start time.',
      'Bring a valid Govt Photo ID (Aadhar / Voter ID / Passport).',
      'Attempt all 120 questions - there is NO negative marking.',
      'No mobile phones or electronic devices inside the exam hall.',
      'Detailed Solution Booklet will be distributed after each test.',
      'Schedule may be revised after official RSSB JE 2026 exam date announcement.',
    ];

    for (const line of instructions) {
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text('  - ' + line, 50, y, { width: W - 100 });
      y += 18;
    }

    /* Footer */
    doc.rect(0, doc.page.height - 60, W, 60).fill('#f1f5f9');
    doc.fillColor('#64748b').font('Helvetica').fontSize(9)
      .text('This is a computer-generated admit card. No signature required.  |  jaspalsingh.in  |  For queries call: +91-XXXXXXXXXX',
        50, doc.page.height - 42, { align: 'center' });

    doc.end();
  });
}

/* ── Schedule rows as plain text for email ───────────────── */

function formatScheduleText(schedule) {
  return schedule
    .map(r => `  ${r.test.padEnd(8)}  ${r.date.padEnd(20)}  ${r.syllabus}`)
    .join('\n');
}

/* ── Mailer setup ────────────────────────────────────────── */

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });
}

/* ── POST /api/tally-webhook ─────────────────────────────── */

router.post('/', async (req, res) => {
  try {
    /* Tally sends { eventType, data: { fields: [...] } } */
    const eventType = req.body.eventType;
    if (eventType !== 'FORM_RESPONSE') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const fields = req.body.data?.fields || [];
    const { name, govtId, centre: centreRaw, targetExam, phone, email } = parseTallyFields(fields);

    if (!email) {
      console.warn('[tally-webhook] No email in payload', { fields });
      return res.status(200).json({ ok: true, note: 'no email found' });
    }

    const centreKey = getCentreKey(centreRaw);
    const centreInfo = CENTRES[centreKey] || { name: centreRaw || 'TBD', address: 'TBD', mapsLink: '#' };

    const isDegreeCourse = (targetExam || '').toLowerCase().includes('degree');
    const schedule       = isDegreeCourse ? SCHEDULE_DEGREE : SCHEDULE_DIPLOMA;
    const seriesName     = isDegreeCourse
      ? 'RSSB JE 2026 - Degree (Civil) - Offline Test Series'
      : 'RSSB JE 2026 - Diploma (Civil) - Offline Test Series';

    const rollNumber = generateRollNumber(centreKey || centreRaw, targetExam || '');

    /* Generate admit card PDF */
    const pdfBuffer = await generateAdmitCard({
      name:       name || 'Student',
      govtId:     govtId || 'N/A',
      rollNumber,
      centre:     centreInfo.name,
      targetExam: targetExam || seriesName,
      phone:      phone || 'N/A',
    });

    /* Build email */
    const scheduleText = formatScheduleText(schedule);

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;max-width:620px;margin:0 auto;padding:20px;">

  <!-- Header -->
  <div style="background:#0f172a;border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Dr. Jaspal Singh</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">jaspalsingh.in</p>
  </div>

  <p style="font-size:16px;">Dear <strong>${name || 'Student'}</strong>,</p>
  <p>Congratulations! Your registration for the <strong>${seriesName}</strong> has been confirmed.</p>
  <p>Please find your <strong>Admit Card attached</strong> to this email as a PDF. Carry it (printed or on your phone) to every test.</p>

  <!-- Centre Info -->
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

  <!-- Schedule -->
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

  <!-- Dos and Don'ts -->
  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:20px 24px;margin:20px 0;">
    <h2 style="font-size:15px;margin:0 0 12px;color:#92400e;">Do's and Don'ts</h2>
    <p style="font-size:13px;font-weight:bold;margin:10px 0 6px;color:#15803d;">DOs:</p>
    <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;">
      <li>Carry this Admit Card (printed or on phone) to every test</li>
      <li>Reach the centre at least <strong>15 minutes before</strong> the test start time</li>
      <li>Bring a valid Govt Photo ID (Aadhar, Voter ID, Driving Licence, Passport)</li>
      <li>Use only a <strong>blue or black ballpoint pen</strong></li>
      <li>Attempt all 120 questions - there is <strong>NO negative marking</strong></li>
      <li>Collect your Detailed Solution Booklet after each test</li>
    </ul>
    <p style="font-size:13px;font-weight:bold;margin:10px 0 6px;color:#dc2626;">DON'Ts:</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;">
      <li>Do NOT bring mobile phones, smartwatches, or electronic devices inside the exam hall</li>
      <li>Do NOT use pencil, gel pens, or whitener on the OMR sheet</li>
      <li>Do NOT arrive late - latecomers may not be allowed entry</li>
      <li>Do NOT carry books, notes, or study material into the exam hall</li>
    </ul>
  </div>

  <p style="font-size:14px;">
    For any queries, feel free to reach out on WhatsApp or call us directly.
  </p>
  <p style="font-size:14px;margin-top:20px;">
    Best wishes for your preparation!<br/>
    <strong>Dr. Jaspal Singh</strong><br/>
    <a href="https://jaspalsingh.in" style="color:#c81240;">jaspalsingh.in</a>
  </p>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:11px;color:#94a3b8;text-align:center;">
    This is an automated confirmation email. Please do not reply to this email.
  </p>
</body>
</html>`;

    /* Send email */
    const transporter = createTransporter();
    await transporter.sendMail({
      from:        `"Dr. Jaspal Singh" <${process.env.GMAIL_USER}>`,
      to:          email,
      subject:     `Confirmed! Your Admit Card for ${seriesName}`,
      html:        htmlBody,
      attachments: [
        {
          filename:    `AdmitCard_${rollNumber}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`[tally-webhook] Email sent to ${email} | Roll: ${rollNumber}`);
    res.status(200).json({ ok: true, rollNumber });

  } catch (err) {
    console.error('[tally-webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

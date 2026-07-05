#!/usr/bin/env node
/* ============================================================
   send-free-test-admits.js
   One-time batch script: send admit cards for free first test takers.

   Usage:
     node scripts/send-free-test-admits.js <csv-file> [--dry-run]

   CSV columns (with header row):
     name, email, phone, centre, govt_id, photo_url, program_type

   Roll number format: FT-{CTR}-{5DIGIT}
   e.g. FT-KOT-12345 — never overlaps with KOT-DEG-* or KOT-DIP-*

   --dry-run  Parse CSV and print what would be sent, no emails fired.
   ============================================================ */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { Resend } = require('resend');

const {
  generateAdmitCard,
  buildAdmitCardHtml,
  fetchImageBuffer,
  getCentreKey,
  CENTRES,
  SCHEDULE_DEGREE,
  SCHEDULE_DIPLOMA,
} = require('../routes/tally-webhook');

const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = 'Dr. Jaspal Singh <team@jaspalsingh.in>';
const DRY_RUN = process.argv.includes('--dry-run');

/* ── CSV parser (no external dep - handles quoted fields) ── */
function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

  return lines.slice(1).map((line, i) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    row._line = i + 2;
    return row;
  });
}

/* ── Unique roll number ── */
const usedRolls = new Set();
function generateRollNumber(centreKey, programType) {
  const prefix = (centreKey || 'JSP').slice(0, 3).toUpperCase();
  const examCode = programType === 'degree' ? 'DEG' : 'DIP';
  let roll;
  do {
    roll = `FT-${prefix}-${examCode}-${Math.floor(10000 + Math.random() * 90000)}`;
  } while (usedRolls.has(roll));
  usedRolls.add(roll);
  return roll;
}

/* ── Send one admit card ── */
async function sendAdmitCard(row) {
  const {
    name, email, phone, centre: centreRaw,
    govt_id, photo_url, program_type, _line,
  } = row;

  if (!name || !email) {
    console.warn(`[line ${_line}] Skipping - missing name or email`);
    return { status: 'skipped', email };
  }

  const isDegreeCourse = (program_type || '').toLowerCase().includes('degree');
  const centreKey  = getCentreKey(centreRaw);
  const centreInfo = CENTRES[centreKey] || { name: centreRaw || 'TBD', address: 'TBD', mapsLink: '#' };
  const schedule   = isDegreeCourse ? SCHEDULE_DEGREE : SCHEDULE_DIPLOMA;
  const seriesName = isDegreeCourse
    ? 'RSSB JE 2026 - Degree (Civil) - Free Test Series'
    : 'RSSB JE 2026 - Diploma (Civil) - Free Test Series';
  const lastTestDate = isDegreeCourse ? '10 January 2027 (Test-28)' : '29 November 2026 (Test-22)';
  const rollNumber = generateRollNumber(centreKey || centreRaw, isDegreeCourse ? 'degree' : 'diploma');

  if (DRY_RUN) {
    console.log(`[DRY RUN] line ${_line}: ${name} <${email}> | ${centreInfo.name} | ${rollNumber}`);
    return { status: 'dry-run', email, rollNumber };
  }

  const photoBuffer = photo_url ? await fetchImageBuffer(photo_url) : null;

  const pdfBuffer = await generateAdmitCard({
    name:         name || 'Student',
    govtId:       govt_id || 'N/A',
    rollNumber,
    centre:       centreInfo.name,
    targetExam:   seriesName,
    phone:        phone || 'N/A',
    email:        email || 'N/A',
    photoBuffer,
    seriesName,
    lastTestDate,
  });

  const htmlBody = buildAdmitCardHtml({ name, seriesName, centreInfo, schedule, isDegreeCourse });

  const { data, error } = await resend.emails.send({
    from: FROM,
    to:          email,
    subject:     `Your Admit Card for ${seriesName}`,
    html:        htmlBody,
    attachments: [
      {
        filename:    `AdmitCard_${rollNumber}.pdf`,
        content:     pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      },
    ],
  });

  if (error) {
    console.error(`[line ${_line}] FAILED ${email}:`, error.message);
    return { status: 'failed', email, rollNumber, error: error.message };
  }

  console.log(`[line ${_line}] Sent to ${email} | Roll: ${rollNumber}`);
  return { status: 'sent', email, rollNumber };
}

/* ── Main ── */
async function main() {
  const csvPath = process.argv.find(a => a.endsWith('.csv'));
  if (!csvPath) {
    console.error('Usage: node scripts/send-free-test-admits.js <file.csv> [--dry-run]');
    process.exit(1);
  }

  const rows = parseCSV(path.resolve(csvPath));
  console.log(`Loaded ${rows.length} rows from ${csvPath}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const results = [];
  for (const row of rows) {
    const result = await sendAdmitCard(row);
    results.push(result);
    if (!DRY_RUN) await new Promise(r => setTimeout(r, 300)); // 300ms gap - Resend rate limit safety
  }

  const sent    = results.filter(r => r.status === 'sent').length;
  const failed  = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`\n==============================`);
  console.log(`Done: ${sent} sent, ${skipped} skipped, ${failed.length} failed`);
  if (failed.length) {
    console.log(`\nFailed rows:`);
    failed.forEach(f => console.log(`  ${f.email}: ${f.error}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });

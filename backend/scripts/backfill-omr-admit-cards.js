/* ============================================================
   scripts/backfill-omr-admit-cards.js
   One-time script: send Home-Based Admit Card PDFs to OMR
   Degree/Diploma learners who already filled the Tally form,
   using the raw Tally CSV export (columns A-P only).

   Usage (from backend/ folder):
     node scripts/backfill-omr-admit-cards.js <degreeCsv> <diplomaCsv>          (dry run)
     RESEND_API_KEY=re_xxx node scripts/backfill-omr-admit-cards.js <degreeCsv> <diplomaCsv> --send

   Dry run parses both CSVs and generates every PDF in memory
   without calling Resend. Pass --send to actually email.
   Always writes a roll-number/status log CSV to scripts/output/.
   ============================================================ */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { generateAdmitCard, fetchImageBuffer } = require('../routes/tally-webhook');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');

const FROM = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

const LAST_TEST_DATE = {
  degree:  '10 January 2027 (Test-28)',
  diploma: '29 November 2026 (Test-22)',
};

/* ── Minimal RFC4180 CSV parser (handles quoted fields with commas) ── */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const usedRollNumbers = new Set();

function generateOmrRollNumber(isDegreeCourse) {
  const examCode = isDegreeCourse ? 'DEG' : 'DIP';
  let rollNumber;
  do {
    const num = Math.floor(10000 + Math.random() * 90000);
    rollNumber = `OMR-${examCode}-${num}`;
  } while (usedRollNumbers.has(rollNumber));
  usedRollNumbers.add(rollNumber);
  return rollNumber;
}

function buildBackfillEmailHtml(name, seriesName) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <p style="font-size:16px;margin:0 0 16px;">Dear <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
      As a registered learner of the <strong>${seriesName}</strong>, please find your <strong>Admit Card attached</strong> to this email as a PDF.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
      This is a formal record of your enrollment with your Roll Number. The test process itself is unchanged - you will continue to receive the Question Paper and OMR Sheet PDFs on each test morning, to be filled and replied back before 10:00 PM the same day.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">For queries, WhatsApp us at +91 98291 33317.</p>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

async function processFile(filePath, isDegreeCourse, sendReal, results) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(raw).filter(r => r.length > 1 && r.some(c => c.trim() !== ''));
  const header = rows[0];
  const dataRows = rows.slice(1);

  const idx = {
    name:       header.indexOf('Full Name (as on Govt. ID)'),
    whatsapp:   header.indexOf('WhatsApp Number'),
    phone:      header.indexOf('phone'),
    emailId:    header.indexOf('Email ID'),
    email:      header.indexOf('email'),
    govtIdType: header.indexOf('Govt. ID Type'),
    photo:      header.indexOf('Your recent Photograph'),
  };

  const seriesName = isDegreeCourse
    ? 'RSSB JE 2026 - Civil Degree (Home-Based OMR Test Series)'
    : 'RSSB JE 2026 - Civil Diploma (Home-Based OMR Test Series)';
  const lastTestDate = isDegreeCourse ? LAST_TEST_DATE.degree : LAST_TEST_DATE.diploma;
  const label = isDegreeCourse ? 'DEGREE' : 'DIPLOMA';

  for (const cols of dataRows) {
    const name     = (cols[idx.name] || 'Student').trim();
    const email    = (cols[idx.emailId] || cols[idx.email] || '').trim().toLowerCase();
    const phoneRaw = cols[idx.phone] || cols[idx.whatsapp] || '';
    const phone    = phoneRaw.replace(/\D/g, '').slice(-10);
    const govtId   = (cols[idx.govtIdType] || 'N/A').trim();
    const photoUrl = (cols[idx.photo] || '').trim();

    if (!email) { console.warn(`[skip] [${label}] Row with no email:`, name); continue; }

    const rollNumber = generateOmrRollNumber(isDegreeCourse);
    console.log(`[${label}] ${name} <${email}> -> ${rollNumber}`);

    try {
      const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;

      const pdfBuffer = await generateAdmitCard({
        name, govtId, rollNumber,
        centre: 'Online (Home Based)',
        targetExam: seriesName,
        phone: phone || 'N/A',
        email,
        photoBuffer,
        seriesName,
        lastTestDate,
        mode: 'home',
      });

      const record = { name, email, phone, rollNumber, program: isDegreeCourse ? 'degree' : 'diploma', status: sendReal ? 'pending' : 'dry-run' };
      results.push(record);

      if (sendReal) {
        const { error } = await resendSend({
          from: FROM,
          to: email,
          subject: `Your Admit Card - ${seriesName}`,
          html: buildBackfillEmailHtml(name, seriesName),
          attachments: [{
            filename: `AdmitCard_${rollNumber}.pdf`,
            content: pdfBuffer.toString('base64'),
            contentType: 'application/pdf',
          }],
        }, PRIORITY.ADMIT_CARD);

        if (error) {
          console.error(`  -> FAILED: ${error.message || error}`);
          record.status = 'failed: ' + (error.message || error);
        } else {
          console.log('  -> sent');
          record.status = 'sent';
        }
      } else {
        console.log(`  -> (dry run, PDF generated OK, ${pdfBuffer.length} bytes)`);
      }
    } catch (err) {
      console.error(`  -> ERROR: ${err.message}`);
      results.push({ name, email, phone, rollNumber, program: isDegreeCourse ? 'degree' : 'diploma', status: 'error: ' + err.message });
    }
  }
}

async function run() {
  const args = process.argv.slice(2);
  const sendReal = args.includes('--send');
  const filePaths = args.filter(a => !a.startsWith('--'));

  if (filePaths.length < 2) {
    console.error('Usage: node backfill-omr-admit-cards.js <degreeCsv> <diplomaCsv> [--send]');
    process.exit(1);
  }

  if (sendReal && !process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set. Set it in backend/.env or inline: RESEND_API_KEY=xxx node ...');
    process.exit(1);
  }

  const [degreeCsv, diplomaCsv] = filePaths;
  const results = [];

  console.log(sendReal ? '=== LIVE SEND MODE ===' : '=== DRY RUN (pass --send to actually email) ===');

  await processFile(degreeCsv, true, sendReal, results);
  await processFile(diplomaCsv, false, sendReal, results);

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `omr-admit-card-backfill-${Date.now()}.csv`);
  const csvLines = ['name,email,phone,rollNumber,program,status'];
  for (const r of results) {
    csvLines.push([r.name, r.email, r.phone, r.rollNumber, r.program, r.status]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  fs.writeFileSync(outFile, csvLines.join('\n'));

  console.log(`\nDone. Processed ${results.length} learners.`);
  console.log(`Roll number / status log written to: ${outFile}`);
}

run().catch(err => { console.error(err); process.exit(1); });

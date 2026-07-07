/* ============================================================
   routes/tally-ese-shared.js
   Shared logic for the 6 ESE 2027 Prelims Tally webhook flows
   (Paper 1, Paper 2 Civil, Combined - each Offline + Home-Based OMR).
   Mirrors the RSSB JE flow in tally-webhook.js / tally-omr-shared.js,
   reusing its generic PDF/admit-card generators.
   ============================================================ */

const { query }  = require('../config/db');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');
const {
  generateAdmitCard, generateComboAdmitCard, fetchImageBuffer,
} = require('./tally-webhook');
const { ESE_CENTRES, getEseCentreKey, ESE_PROGRAMS } = require('../config/eseTestSeries');

const FROM = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* ── Parse Tally fields (same shape as the RSSB offline form) ── */

function resolveValue(field) {
  const raw = field.value;
  if (!raw && raw !== 0) return '';
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
    if (label.includes('phone') || label.includes('mobile') || label.includes('contact') || label.includes('whatsapp') || label.includes('number')) {
      if (!result.phone) result.phone = value;
    }
    if (label.includes('email')) {
      result.email = value;
    }
    if (label.includes('photo') || label.includes('photograph') || label.includes('picture') || label.includes('image')) {
      const raw = field.value;
      if (Array.isArray(raw) && raw.length && raw[0].url) result.photoUrl = raw[0].url;
      else if (typeof raw === 'object' && raw && raw.url) result.photoUrl = raw.url;
      else if (typeof raw === 'string' && raw.startsWith('http')) result.photoUrl = raw;
    }
    if (label === 'token' || label.includes('form token') || label.includes('enrollment token')) {
      result.token = value;
    }
  }
  return result;
}

/* ── Roll number generator ── */

async function generateEseRollNumber(centreOrMode, examCode) {
  const prefix = (centreOrMode || 'ESE').slice(0, 3).toUpperCase();
  let roll;
  for (let i = 0; i < 10; i++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    roll = `${prefix}-${examCode}-${num}`;
    const exists = await query('SELECT 1 FROM enrollments WHERE roll_number = $1', [roll]);
    if (!exists.rows.length) return roll;
  }
  return roll;
}

/* ── Admit card / confirmation email HTML (single paper) ── */

function buildEseAdmitCardHtml({ name, seriesName, centreInfo, schedule }) {
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
      * Schedule may be revised after the official ESE 2027 examination date announcement.
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

/* ── Admit card / confirmation email HTML (Combined - Paper 1 + 2) ── */

function buildEseComboAdmitCardHtml({ name, centreInfo }) {
  const { SCHEDULE_PAPER1, SCHEDULE_PAPER2 } = require('../config/eseTestSeries');
  const scheduleTable = (rows) => `
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead>
        <tr style="background:#0f172a;color:#fff;">
          <th style="padding:7px 9px;text-align:left;">Test</th>
          <th style="padding:7px 9px;text-align:left;">Date</th>
          <th style="padding:7px 9px;text-align:left;">Syllabus</th>
          <th style="padding:7px 9px;text-align:center;">Qs</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
          <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;">${r.test}</td>
          <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${r.date}</td>
          <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;">${r.syllabus}</td>
          <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.questions}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:#0f172a;border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Dr. Jaspal Singh</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">jaspalsingh.in</p>
  </div>
  <p style="font-size:16px;">Dear <strong>${name || 'Student'}</strong>,</p>
  <p>Congratulations! Your registration for the <strong>ESE 2027 Prelims - Paper 1 + 2 (GS, Eng. Aptitude & Civil) - Offline Test Series</strong> has been confirmed - you are enrolled in <strong>both</strong> Paper 1 and Paper 2.</p>
  <p>Please find your <strong>combined Admit Card attached</strong> to this email as a PDF, with a separate roll number for each paper. Carry it (printed or on your phone) to every test.</p>
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
    <h2 style="font-size:15px;color:#0F766E;margin-bottom:12px;">Paper 1 Test Schedule (22 Tests)</h2>
    ${scheduleTable(SCHEDULE_PAPER1)}
  </div>
  <div style="margin:20px 0;">
    <h2 style="font-size:15px;color:#c81240;margin-bottom:12px;">Paper 2 (Civil) Test Schedule (22 Tests)</h2>
    ${scheduleTable(SCHEDULE_PAPER2)}
  </div>
  <p style="font-size:12px;color:#64748b;">
    * Both schedules run on the same Sundays at the same centre. Schedule may be revised after the official ESE 2027 examination date announcement.
  </p>
  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:20px 24px;margin:20px 0;">
    <h2 style="font-size:15px;margin:0 0 12px;color:#92400e;">Do's and Don'ts</h2>
    <p style="font-size:13px;font-weight:bold;margin:10px 0 6px;color:#15803d;">DOs:</p>
    <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;">
      <li>Carry this Admit Card (printed or on phone) to every test</li>
      <li>Reach the centre at least <strong>15 minutes before</strong> the test start time</li>
      <li>Bring a valid Govt Photo ID (Aadhar, Voter ID, Driving Licence, Passport)</li>
      <li>Use only a <strong>blue or black ballpoint pen</strong></li>
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

/* ── Rejection email ── */

async function sendRejectionEmail(toEmail, reason) {
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
    <a href="https://wa.me/919829133317?text=${encodeURIComponent('Hi, I need help with my ESE enrollment form submission for jaspalsingh.in')}"
       style="display:inline-block;background:#25D366;color:#fff;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      WhatsApp Us Now
    </a>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  }).catch(e => console.error('[ese rejection email]', e.message));
}

/* ── Shared token lookup + verification + atomic claim ──
   Returns the claimed enrollment row, or null if rejected (a rejection
   email has already been sent in that case). */
async function claimEnrollment({ email, phone, token, slug, tag }) {
  const normEmail = (email || '').toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token) {
    console.warn(`[${tag}] No token in submission - rejecting`);
    await sendRejectionEmail(email,
      'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email. Please check your email for the "Fill Details Form" button and use that link.'
    );
    return null;
  }

  const lookupResult = await query(
    `SELECT id, student_email, student_phone, form_used, form_token FROM enrollments WHERE form_token = $1 AND program_slug = $2`,
    [token, slug]
  );

  if (!lookupResult.rows.length) {
    console.warn(`[${tag}] Invalid token:`, token);
    await sendRejectionEmail(email,
      'The enrollment token in your submission is invalid or does not match any paid enrollment. Please use the original link sent in your enrollment email.'
    );
    return null;
  }

  const preCheck = lookupResult.rows[0];

  if (preCheck.form_used) {
    console.warn(`[${tag}] Token already used (pre-check), enrollment:`, preCheck.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake in your earlier submission, please contact us on WhatsApp immediately and we will assist you.'
    );
    return null;
  }

  const expectedEmail = (preCheck.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    console.warn(`[${tag}] Email mismatch - submitted:`, normEmail, 'expected:', expectedEmail);
    await sendRejectionEmail(email,
      `The email address you entered (${email}) does not match the email used during payment (${preCheck.student_email}). Please re-open the form using the link in your enrollment email and enter the same email address you used at checkout.`
    );
    return null;
  }

  const expectedPhone = (preCheck.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    console.warn(`[${tag}] Phone mismatch - submitted:`, normPhone, 'expected:', expectedPhone);
    await sendRejectionEmail(email,
      `The mobile number you entered does not match the number used during payment (+91 ${expectedPhone}). Please re-open the form using the link in your enrollment email and enter the same mobile number you used at checkout.`
    );
    return null;
  }

  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW()
     WHERE id = $1 AND form_used = FALSE
     RETURNING id`,
    [preCheck.id]
  );

  if (!claimResult.rows.length) {
    console.warn(`[${tag}] Race - already claimed, enrollment:`, preCheck.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake in your earlier submission, please contact us on WhatsApp immediately and we will assist you.'
    );
    return null;
  }

  return preCheck;
}

/* ── Main handler: single-paper submission (Paper1 / Paper2, offline or OMR) ── */

async function processEseSubmission(fields, programKey) {
  const cfg = ESE_PROGRAMS[programKey];
  const isOmr = programKey.toLowerCase().includes('omr');
  const { name, govtId, centre: centreRaw, phone, email, photoUrl, token } = parseTallyFields(fields);

  if (!email) {
    console.warn(`[tally-ese-${programKey}] No email found in fields`);
    return;
  }

  const enrollment = await claimEnrollment({ email, phone, token, slug: cfg.slug, tag: `tally-ese-${programKey}` });
  if (!enrollment) return;

  console.log(`[tally-ese-${programKey}] Token claimed, processing enrollment:`, enrollment.id);

  const centreKey  = isOmr ? null : getEseCentreKey(centreRaw);
  const centreInfo = isOmr ? { name: 'Online (Home Based)', address: '', mapsLink: '#' }
    : (ESE_CENTRES[centreKey] || { name: centreRaw || 'TBD', address: 'TBD', mapsLink: '#' });

  try {
    const rollNumber  = await generateEseRollNumber(isOmr ? 'ESE' : (centreKey || centreRaw), cfg.examCode);
    const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;

    const pdfBuffer = await generateAdmitCard({
      name:         name || 'Student',
      govtId:       govtId || 'N/A',
      rollNumber,
      centre:       centreInfo.name,
      targetExam:   cfg.seriesName,
      phone:        phone || 'N/A',
      email:        email || 'N/A',
      photoBuffer,
      seriesName:   cfg.seriesName,
      lastTestDate: cfg.lastTestDate,
      mode:         isOmr ? 'home' : 'offline',
    });

    const htmlBody = buildEseAdmitCardHtml({ name, seriesName: cfg.seriesName, centreInfo, schedule: cfg.schedule });

    const result = await resendSend({
      from:        FROM,
      to:          email,
      subject:     `Confirmed! Your Admit Card for ${cfg.seriesName}`,
      html:        htmlBody,
      attachments: [
        { filename: `AdmitCard_${rollNumber}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' },
      ],
    }, PRIORITY.ADMIT_CARD);

    if (result.error) {
      console.error(`[tally-ese-${programKey}] Resend error:`, result.error);
      await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
      console.log(`[tally-ese-${programKey}] Reset form_used to FALSE so student can resubmit:`, enrollment.id);
    } else {
      console.log(`[tally-ese-${programKey}] Email sent to ${email} | Roll: ${rollNumber}`);
      await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [rollNumber, enrollment.id]);
    }
  } catch (err) {
    console.error(`[tally-ese-${programKey}] Admit card generation failed:`, err.message);
    await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
    console.log(`[tally-ese-${programKey}] Reset form_used to FALSE so student can resubmit:`, enrollment.id);
  }
}

/* ── Main handler: Combined (Paper1 + Paper2) submission, offline or OMR ── */

async function processEseCombinedSubmission(fields, programKey) {
  const cfg = ESE_PROGRAMS[programKey];
  const isOmr = programKey.toLowerCase().includes('omr');
  const { name, govtId, centre: centreRaw, phone, email, photoUrl, token } = parseTallyFields(fields);

  if (!email) {
    console.warn(`[tally-ese-${programKey}] No email found in fields`);
    return;
  }

  const enrollment = await claimEnrollment({ email, phone, token, slug: cfg.slug, tag: `tally-ese-${programKey}` });
  if (!enrollment) return;

  console.log(`[tally-ese-${programKey}] Token claimed, processing enrollment:`, enrollment.id);

  const centreKey  = isOmr ? null : getEseCentreKey(centreRaw);
  const centreInfo = isOmr ? { name: 'Online (Home Based)', address: '', mapsLink: '#' }
    : (ESE_CENTRES[centreKey] || { name: centreRaw || 'TBD', address: 'TBD', mapsLink: '#' });

  try {
    const rollNumberPaper1 = await generateEseRollNumber(isOmr ? 'ESE' : (centreKey || centreRaw), 'P1');
    const rollNumberPaper2 = await generateEseRollNumber(isOmr ? 'ESE' : (centreKey || centreRaw), 'P2');
    const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;

    const pdfBuffer = await generateComboAdmitCard({
      name:  name || 'Student',
      govtId: govtId || 'N/A',
      rollNumberDegree:  rollNumberPaper1,
      rollNumberDiploma: rollNumberPaper2,
      centre: centreInfo.name,
      phone:  phone || 'N/A',
      email:  email || 'N/A',
      photoBuffer,
      mode: isOmr ? 'home' : 'offline',
      seriesName:   cfg.seriesName,
      rollLabel1:   'PAPER 1 ROLL NUMBER',
      rollLabel2:   'PAPER 2 ROLL NUMBER',
      validityText: 'Schedule subject to change after the official ESE 2027 examination date announcement - notified via email & WhatsApp.',
    });

    const htmlBody = buildEseComboAdmitCardHtml({ name, centreInfo });

    const result = await resendSend({
      from:        FROM,
      to:          email,
      subject:     `Confirmed! Your Admit Card for ${cfg.seriesName}`,
      html:        htmlBody,
      attachments: [
        { filename: `AdmitCard_${rollNumberPaper1}_${rollNumberPaper2}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' },
      ],
    }, PRIORITY.ADMIT_CARD);

    if (result.error) {
      console.error(`[tally-ese-${programKey}] Resend error:`, result.error);
      await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
      console.log(`[tally-ese-${programKey}] Reset form_used to FALSE so student can resubmit:`, enrollment.id);
    } else {
      console.log(`[tally-ese-${programKey}] Email sent to ${email} | Paper1 Roll: ${rollNumberPaper1} | Paper2 Roll: ${rollNumberPaper2}`);
      await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [`${rollNumberPaper1}|${rollNumberPaper2}`, enrollment.id]);
    }
  } catch (err) {
    console.error(`[tally-ese-${programKey}] Admit card generation failed:`, err.message);
    await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
    console.log(`[tally-ese-${programKey}] Reset form_used to FALSE so student can resubmit:`, enrollment.id);
  }
}

module.exports = {
  processEseSubmission,
  processEseCombinedSubmission,
  generateEseRollNumber,
  buildEseAdmitCardHtml,
  buildEseComboAdmitCardHtml,
};

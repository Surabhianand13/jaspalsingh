/* ============================================================
   routes/tally-omr-shared.js
   Shared logic for OMR Online Test Series Tally webhooks.
   Validates form token, marks used, sends confirmation email
   with a Home-Based Admit Card PDF attached.
   ============================================================ */

const { query }  = require('../config/db');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');
const { generateAdmitCard, generateComboAdmitCard, fetchImageBuffer } = require('./tally-webhook');

const FROM   = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* ── Parse Tally fields (name, email, phone, token, govt ID, photo) ── */

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
    if (label.includes('name') && !label.includes('exam') && !label.includes('centre')) {
      result.name = value;
    }
    if (label.includes('email')) {
      result.email = value;
    }
    if (label.includes('phone') || label.includes('mobile') || label.includes('whatsapp') || label.includes('number')) {
      if (!result.phone) result.phone = value;
    }
    if (label.includes('govt') || label.includes('id proof') || label.includes('aadhar') || label.includes('voter')) {
      result.govtId = value;
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

/* ── Roll number generator (no physical centre for home-based OMR) ── */

function generateOmrRollNumber(isDegreeCourse) {
  const examCode = isDegreeCourse ? 'DEG' : 'DIP';
  const num = Math.floor(10000 + Math.random() * 90000);
  return `OMR-${examCode}-${num}`;
}

/* ── Test schedules (shared by the webhook flow and the admin resend route) ── */

const OMR_SCHEDULE_DEGREE = [
  ['01','5 Jul 2026','Rajasthan Geography-I + Building Technology & Construction Management'],
  ['02','12 Jul 2026','Rajasthan History I + Fluid Mechanics'],
  ['03','19 Jul 2026','Rajasthan Art & Culture-I + Surveying, Estimating Costing & Field Engineering'],
  ['04','26 Jul 2026','Rajasthan Political & Administrative System-I + Irrigation & Water Resources'],
  ['05','2 Aug 2026','Rajasthan Geography-II + Theory of Structures & Strength of Materials'],
  ['06','9 Aug 2026','Rajasthan History II + Structural Analysis'],
  ['07','16 Aug 2026','Rajasthan Art & Culture-II + Soil Mechanics & Foundation Engineering'],
  ['08','23 Aug 2026','Rajasthan Political & Administrative System-II + Design of RCC & Masonry Structures'],
  ['09','30 Aug 2026','Rajasthan GK Mixed Revision-I + Design of Steel Structures'],
  ['10','6 Sep 2026','Rajasthan GK Mixed Revision-II + Construction Technology'],
  ['11','13 Sep 2026','Rajasthan GK Mixed Revision-III + AutoCAD Civil Engineering Drawing'],
  ['12','20 Sep 2026','Rajasthan GK Mixed Revision-IV + Public Health Engineering'],
  ['13','27 Sep 2026','Rajasthan GK Mixed Revision-V + Highway & Bridges'],
  ['14','4 Oct 2026','Full Length Test - 01'],
  ['15','11 Oct 2026','Full Length Test - 02'],
  ['16','18 Oct 2026','Full Length Test - 03'],
  ['17','25 Oct 2026','Full Length Test - 04'],
  ['18','1 Nov 2026','Full Length Test - 05'],
  ['19','8 Nov 2026','Full Length Test - 06'],
  ['20','15 Nov 2026','Full Length Test - 07'],
  ['21','22 Nov 2026','Full Length Test - 08'],
  ['22','29 Nov 2026','Full Length Test - 09'],
  ['23','6 Dec 2026','Full Length Test - 10'],
  ['24','13 Dec 2026','Full Length Test - 11'],
  ['25','20 Dec 2026','Full Length Test - 12'],
  ['26','27 Dec 2026','Full Length Test - 13'],
  ['27','3 Jan 2027','Full Length Test - 14'],
  ['28','10 Jan 2027','Full Length Test - 15'],
];

const OMR_SCHEDULE_DIPLOMA = [
  ['01','5 Jul 2026','राजस्थान का भूगोल + Building Technology & Construction Management'],
  ['02','12 Jul 2026','राजस्थान का इतिहास + Surveying, Estimating & Costing'],
  ['03','19 Jul 2026','राजस्थान की कला एवं संस्कृति + Strength of Materials'],
  ['04','26 Jul 2026','राजस्थान की राजनीतिक एवं प्रशासनिक व्यवस्था + Reinforced Concrete Design'],
  ['05','2 Aug 2026','Rajasthan GK Mixed Revision-I + Irrigation & Water Resources'],
  ['06','9 Aug 2026','Rajasthan GK Mixed Revision-II + Soil Engineering'],
  ['07','16 Aug 2026','Rajasthan GK Mixed Revision-III + AutoCAD Civil Engineering Drawing'],
  ['08','23 Aug 2026','Full Length Test - 01'],
  ['09','30 Aug 2026','Full Length Test - 02'],
  ['10','6 Sep 2026','Full Length Test - 03'],
  ['11','13 Sep 2026','Full Length Test - 04'],
  ['12','20 Sep 2026','Full Length Test - 05'],
  ['13','27 Sep 2026','Full Length Test - 06'],
  ['14','4 Oct 2026','Full Length Test - 07'],
  ['15','11 Oct 2026','Full Length Test - 08'],
  ['16','18 Oct 2026','Full Length Test - 09'],
  ['17','25 Oct 2026','Full Length Test - 10'],
  ['18','1 Nov 2026','Full Length Test - 11'],
  ['19','8 Nov 2026','Full Length Test - 12'],
  ['20','15 Nov 2026','Full Length Test - 13'],
  ['21','22 Nov 2026','Full Length Test - 14'],
  ['22','29 Nov 2026','Full Length Test - 15'],
];

function getOmrSchedule(isDegreeCourse) {
  return isDegreeCourse ? OMR_SCHEDULE_DEGREE : OMR_SCHEDULE_DIPLOMA;
}

function getOmrLastTestDate(isDegreeCourse) {
  const schedule = getOmrSchedule(isDegreeCourse);
  const lastRow = schedule[schedule.length - 1];
  return `${lastRow[1]} (Test-${lastRow[0]})`;
}

function getOmrSeriesName(isDegreeCourse) {
  return isDegreeCourse
    ? 'RSSB JE 2026 - Civil Degree (Home-Based OMR Test Series)'
    : 'RSSB JE 2026 - Civil Diploma (Home-Based OMR Test Series)';
}

/* ── Build the full "Identity Verified" confirmation email HTML ──
   Shared by the automatic Tally webhook flow and the admin resend route. ── */
function buildOmrConfirmationHtml({ name, isDegreeCourse }) {
  const seriesName = getOmrSeriesName(isDegreeCourse);
  const schedule = getOmrSchedule(isDegreeCourse);
  const scheduleRows = schedule.map(([num, date, syllabus]) =>
    `<tr style="border-bottom:1px solid #e2e8f0;">
       <td style="padding:7px 10px;font-size:12px;font-weight:700;color:#6366F1;white-space:nowrap;">Test ${num}</td>
       <td style="padding:7px 10px;font-size:12px;color:#475569;white-space:nowrap;">${date}</td>
       <td style="padding:7px 10px;font-size:12px;color:#374151;">${syllabus}</td>
     </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <!-- Header -->
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;padding:32px 36px;">

    <!-- Enrolled badge -->
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:50px;padding:8px 20px;">
        <span style="font-size:13px;font-weight:700;color:#4338CA;">Identity Verified - You are Enrolled</span>
      </div>
    </div>

    <h2 style="margin:0 0 6px;font-size:20px;color:#1A1A2E;font-weight:800;">Welcome, ${name || 'Learner'}!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.7;">
      You are now enrolled in <strong style="color:#1A1A2E;">${seriesName}</strong>.
      Your identity has been verified successfully.
    </p>

    <!-- How it works -->
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:800;color:#4338CA;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">How This Works</div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">1.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">On each test day morning, you will receive the <strong>Question Paper PDF</strong> and a <strong>blank OMR Sheet PDF</strong> on this email.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">2.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Download and print both PDFs. Attempt the test on paper.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">3.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Fill your answers on the printed OMR sheet using a <strong>blue or black ballpoint pen</strong>.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">4.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;"><strong>Reply to the test email</strong> with a clear photo or scan of your filled OMR sheet before <strong>10:00 PM on the same day</strong>.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">5.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Results and rankings are announced together with offline test participants.</span>
        </td></tr>
      </table>
    </div>

    <!-- Dos and Don'ts -->
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      <tr>
        <td style="width:50%;padding-right:8px;vertical-align:top;">
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 18px;">
            <div style="font-size:11px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Do's</div>
            <ul style="margin:0;padding-left:16px;font-size:13px;color:#166534;line-height:1.8;">
              <li>Download and print both PDFs before test time</li>
              <li>Use blue/black ballpoint pen only</li>
              <li>Fill one bubble completely per question</li>
              <li>Submit by replying to the test email before 10 PM</li>
              <li>Keep your email inbox active on test days</li>
            </ul>
          </div>
        </td>
        <td style="width:50%;padding-left:8px;vertical-align:top;">
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px 18px;">
            <div style="font-size:11px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Don'ts</div>
            <ul style="margin:0;padding-left:16px;font-size:13px;color:#991b1b;line-height:1.8;">
              <li>Don't share the question paper or OMR with anyone</li>
              <li>Don't submit after 10 PM - no evaluation will be done</li>
              <li>Don't use pencil or tick marks on the OMR</li>
              <li>Don't crop or edit the watermark on the PDF</li>
              <li>Don't submit from a different email address</li>
            </ul>
          </div>
        </td>
      </tr>
    </table>

    <!-- Test Schedule -->
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;font-weight:800;color:#4338CA;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Complete Test Schedule - ${isDegreeCourse ? 'Civil Degree (28 Tests)' : 'Civil Diploma (22 Tests)'}</div>
      <div style="overflow-x:auto;">
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
          <thead>
            <tr style="background:#eef2ff;">
              <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Test</th>
              <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Date</th>
              <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;">Syllabus</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleRows}
          </tbody>
        </table>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Schedule may be revised after the official RSSB JE 2026 exam date is announced.</p>
    </div>

    <!-- Important note -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:6px;">Important - Please Read</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#78350f;line-height:1.8;">
        <li>Both the Question Paper and OMR Sheet are watermarked with your email and phone number. Do not share them - any leak will be traced back to you.</li>
        <li>If you miss the 10 PM submission deadline, evaluation will not be done for that test. You can still access all test PDFs.</li>
        <li>Mark this email (team@jaspalsingh.in) as a trusted sender so test papers never go to spam.</li>
      </ul>
    </div>

    <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;">For queries, WhatsApp us at +91 98291 33317.</p>
    <div style="border-top:1px solid #f0f0f6;padding-top:20px;margin-top:16px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "See you in the classroom. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;&middot;&nbsp; ESE AIR-04 &nbsp;&middot;&nbsp; GATE AIR-06</p>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? WhatsApp us at +91 98291 33317 or email team@jaspalsingh.in</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ── Send rejection email ── */

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
      If you believe this is an error or need help, please contact us immediately on WhatsApp.
    </p>
    <a href="https://wa.me/919829133317?text=${encodeURIComponent('Hi, I need help with my OMR enrollment form submission for jaspalsingh.in')}"
       style="display:inline-block;background:#25D366;color:#fff;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;text-decoration:none;">
      WhatsApp Us Now
    </a>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  }).catch(e => console.error('[omr rejection email]', e.message));
}

/* ── Main handler: validate token and send confirmation ── */

async function processOmrSubmission(fields, type) {
  const { name, email, phone, token, govtId, photoUrl } = parseTallyFields(fields);

  if (!email) {
    console.warn('[tally-omr] No email found in fields');
    return;
  }

  const normEmail = email.toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token) {
    console.warn('[tally-omr] No token in submission - rejecting');
    await sendRejectionEmail(email,
      'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email. Please check your email for the "Fill Details Form" button and use that link.'
    );
    return;
  }

  /* Look up token in enrollments, scoped to OMR program slugs */
  const enrResult = await query(
    `SELECT id, student_email, student_phone, form_used, form_token, program_slug
     FROM enrollments
     WHERE form_token = $1 AND program_slug LIKE '%omr%'`,
    [token]
  );

  if (!enrResult.rows.length) {
    console.warn('[tally-omr] Invalid token or not an OMR enrollment:', token);
    await sendRejectionEmail(email,
      'The enrollment token in your submission is invalid or does not match any paid OMR enrollment. Please use the original link sent in your enrollment email.'
    );
    return;
  }

  const enrollment = enrResult.rows[0];

  if (enrollment.form_used) {
    console.warn('[tally-omr] Token already used, enrollment:', enrollment.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake, please contact us on WhatsApp.'
    );
    return;
  }

  /* Verify email matches */
  const expectedEmail = (enrollment.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    console.warn('[tally-omr] Email mismatch - submitted:', normEmail, 'expected:', expectedEmail);
    await sendRejectionEmail(email,
      `The email address you entered (${email}) does not match the email used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  /* Verify phone */
  const expectedPhone = (enrollment.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    console.warn('[tally-omr] Phone mismatch - submitted:', normPhone, 'expected:', expectedPhone);
    await sendRejectionEmail(email,
      `The mobile number you entered does not match the number used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  /* Atomic claim - WHERE form_used = FALSE ensures only one concurrent
     request can win even if two webhooks arrive simultaneously. */
  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW()
     WHERE form_token = $1 AND form_used = FALSE
     RETURNING id`,
    [token]
  );

  if (!claimResult.rows.length) {
    console.warn('[tally-omr] Token race - already claimed, enrollment:', enrollment.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake, please contact us on WhatsApp.'
    );
    return;
  }

  console.log('[tally-omr] Token validated, enrollment:', enrollment.id, 'type:', type);

  const isDegreeCourse = type === 'omr-degree';
  const seriesName = getOmrSeriesName(isDegreeCourse);

  /* Everything below (photo fetch, PDF generation, email send) is wrapped
     so that any unexpected failure still results in the learner getting a
     confirmation email (without the PDF) instead of silence - the token is
     already marked used above, so this is the only remaining chance to
     reach them without asking them to resubmit the form. */
  try {

  const rollNumber  = generateOmrRollNumber(isDegreeCourse);
  const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;
  const lastTestDate = getOmrLastTestDate(isDegreeCourse);

  const pdfBuffer = await generateAdmitCard({
    name:       name || 'Student',
    govtId:     govtId || 'N/A',
    rollNumber,
    centre:     'Online (Home Based)',
    targetExam: seriesName,
    phone:      phone || 'N/A',
    email:      email || 'N/A',
    photoBuffer,
    seriesName,
    lastTestDate,
    mode: 'home',
  });

  const htmlBody = buildOmrConfirmationHtml({ name, isDegreeCourse });

  const { error } = await resendSend({
    from:    FROM,
    to:      email,
    subject: `Identity Verified - You're enrolled in ${seriesName}`,
    html:    htmlBody,
    attachments: [
      {
        filename:    `AdmitCard_${rollNumber}.pdf`,
        content:     pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      },
    ],
  }, PRIORITY.ACTION_REQUIRED);

  if (error) {
    console.error('[tally-omr] Resend error:', error);
  } else {
    console.log(`[tally-omr] Confirmation email + Admit Card sent to ${email} | type: ${type} | Roll: ${rollNumber}`);
  }

  } catch (err) {
    console.error('[tally-omr] Failed to generate/send Admit Card - sending fallback confirmation without PDF. Enrollment:', enrollment.id, err);
    await resendSend({
      from: FROM,
      to: email,
      subject: `Identity Verified - You're enrolled in ${seriesName}`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <h2 style="margin:0 0 6px;font-size:20px;color:#1A1A2E;font-weight:800;">Welcome, ${name || 'Learner'}!</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.7;">
      You are now enrolled in <strong style="color:#1A1A2E;">${seriesName}</strong>. Your identity has been verified successfully.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      Your Admit Card is being generated and will be emailed to you separately shortly. On each test day morning, you will receive the Question Paper and OMR Sheet PDFs on this email - fill them and reply with a photo before 10:00 PM the same day.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">For queries, WhatsApp us at +91 98291 33317.</p>
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    }, PRIORITY.ACTION_REQUIRED).catch(e => console.error('[tally-omr] Fallback email also failed:', e.message));
  }
}

/* ── Main handler: COMBO (Degree + Diploma) OMR submission ──── */

async function processComboOmrSubmission(fields) {
  const { name, email, phone, token, govtId, photoUrl } = parseTallyFields(fields);

  if (!email) {
    console.warn('[tally-combo-omr] No email found in fields');
    return;
  }

  const normEmail = email.toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token) {
    console.warn('[tally-combo-omr] No token in submission - rejecting');
    await sendRejectionEmail(email,
      'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email. Please check your email for the "Fill Details Form" button and use that link.'
    );
    return;
  }

  const enrResult = await query(
    `SELECT id, student_email, student_phone, form_used, form_token, program_slug
     FROM enrollments
     WHERE form_token = $1 AND program_slug LIKE '%omr%'`,
    [token]
  );

  if (!enrResult.rows.length) {
    console.warn('[tally-combo-omr] Invalid token or not an OMR enrollment:', token);
    await sendRejectionEmail(email,
      'The enrollment token in your submission is invalid or does not match any paid OMR enrollment. Please use the original link sent in your enrollment email.'
    );
    return;
  }

  const enrollment = enrResult.rows[0];

  if (enrollment.form_used) {
    console.warn('[tally-combo-omr] Token already used, enrollment:', enrollment.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake, please contact us on WhatsApp.'
    );
    return;
  }

  const expectedEmail = (enrollment.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    console.warn('[tally-combo-omr] Email mismatch - submitted:', normEmail, 'expected:', expectedEmail);
    await sendRejectionEmail(email,
      `The email address you entered (${email}) does not match the email used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  const expectedPhone = (enrollment.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    console.warn('[tally-combo-omr] Phone mismatch - submitted:', normPhone, 'expected:', expectedPhone);
    await sendRejectionEmail(email,
      `The mobile number you entered does not match the number used during payment. Please re-open the form using the link in your enrollment email.`
    );
    return;
  }

  /* Atomic claim - same idempotency guard as the individual OMR flow. */
  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW()
     WHERE form_token = $1 AND form_used = FALSE
     RETURNING id`,
    [token]
  );

  if (!claimResult.rows.length) {
    console.warn('[tally-combo-omr] Token race - already claimed, enrollment:', enrollment.id);
    await sendRejectionEmail(email,
      'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake, please contact us on WhatsApp.'
    );
    return;
  }

  console.log('[tally-combo-omr] Token validated, enrollment:', enrollment.id);

  const seriesName = 'RSSB JE 2026 - Civil Degree + Diploma Combo (Home-Based OMR Test Series)';
  const degreeRows  = OMR_SCHEDULE_DEGREE.map(([num, date, syllabus]) =>
    `<tr style="border-bottom:1px solid #e2e8f0;">
       <td style="padding:7px 10px;font-size:12px;font-weight:700;color:#6366F1;white-space:nowrap;">Test ${num}</td>
       <td style="padding:7px 10px;font-size:12px;color:#475569;white-space:nowrap;">${date}</td>
       <td style="padding:7px 10px;font-size:12px;color:#374151;">${syllabus}</td>
     </tr>`
  ).join('');
  const diplomaRows = OMR_SCHEDULE_DIPLOMA.map(([num, date, syllabus]) =>
    `<tr style="border-bottom:1px solid #e2e8f0;">
       <td style="padding:7px 10px;font-size:12px;font-weight:700;color:#6366F1;white-space:nowrap;">Test ${num}</td>
       <td style="padding:7px 10px;font-size:12px;color:#475569;white-space:nowrap;">${date}</td>
       <td style="padding:7px 10px;font-size:12px;color:#374151;">${syllabus}</td>
     </tr>`
  ).join('');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>

  <tr><td style="background:#fff;padding:32px 36px;">

    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:50px;padding:8px 20px;">
        <span style="font-size:13px;font-weight:700;color:#4338CA;">Identity Verified - You are Enrolled</span>
      </div>
    </div>

    <h2 style="margin:0 0 6px;font-size:20px;color:#1A1A2E;font-weight:800;">Welcome, ${name || 'Learner'}!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.7;">
      You are now enrolled in <strong style="color:#1A1A2E;">${seriesName}</strong> - both the Degree and Diploma categories.
      Your identity has been verified successfully.
    </p>

    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:800;color:#4338CA;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">How This Works</div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">1.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">On each test day morning, you will receive <strong>both</strong> the Degree and Diploma Question Paper PDFs and blank OMR Sheet PDFs on this email.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">2.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Download and print all PDFs. Attempt each test on paper.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">3.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Fill your answers on each printed OMR sheet using a <strong>blue or black ballpoint pen</strong>.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">4.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;"><strong>Reply to the test email</strong> with clear photos or scans of both filled OMR sheets before <strong>10:00 PM on the same day</strong>.</span>
        </td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;">
          <span style="color:#6366F1;font-weight:800;margin-right:8px;font-size:14px;">5.</span>
          <span style="font-size:14px;color:#374151;line-height:1.7;">Results and rankings for each category are announced together with the respective offline test participants.</span>
        </td></tr>
      </table>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      <tr>
        <td style="width:50%;padding-right:8px;vertical-align:top;">
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 18px;">
            <div style="font-size:11px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Do's</div>
            <ul style="margin:0;padding-left:16px;font-size:13px;color:#166534;line-height:1.8;">
              <li>Download and print all PDFs before test time</li>
              <li>Use blue/black ballpoint pen only</li>
              <li>Fill one bubble completely per question</li>
              <li>Submit both sheets by replying before 10 PM</li>
              <li>Keep your email inbox active on test days</li>
            </ul>
          </div>
        </td>
        <td style="width:50%;padding-left:8px;vertical-align:top;">
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px 18px;">
            <div style="font-size:11px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Don'ts</div>
            <ul style="margin:0;padding-left:16px;font-size:13px;color:#991b1b;line-height:1.8;">
              <li>Don't share the question papers or OMRs with anyone</li>
              <li>Don't submit after 10 PM - no evaluation will be done</li>
              <li>Don't use pencil or tick marks on the OMR</li>
              <li>Don't crop or edit the watermark on the PDFs</li>
              <li>Don't submit from a different email address</li>
            </ul>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin-bottom:24px;">
      <div style="font-size:11px;font-weight:800;color:#0F766E;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Civil Degree Test Schedule (28 Tests)</div>
      <div style="overflow-x:auto;">
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
          <thead><tr style="background:#eef2ff;">
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Test</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Date</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;">Syllabus</th>
          </tr></thead>
          <tbody>${degreeRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:11px;font-weight:800;color:#C81240;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Civil Diploma Test Schedule (22 Tests)</div>
      <div style="overflow-x:auto;">
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
          <thead><tr style="background:#eef2ff;">
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Test</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;white-space:nowrap;">Date</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:800;color:#4338CA;text-align:left;">Syllabus</th>
          </tr></thead>
          <tbody>${diplomaRows}</tbody>
        </table>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Both schedules run on the same Sundays. Subject to revision after the official RSSB JE 2026 exam date is announced.</p>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:6px;">Important - Please Read</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#78350f;line-height:1.8;">
        <li>All Question Papers and OMR Sheets are watermarked with your email and phone number. Do not share them - any leak will be traced back to you.</li>
        <li>If you miss the 10 PM submission deadline for either category, evaluation will not be done for that test. You can still access all test PDFs.</li>
        <li>Mark this email (team@jaspalsingh.in) as a trusted sender so test papers never go to spam.</li>
      </ul>
    </div>

    <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;">For queries, WhatsApp us at +91 98291 33317.</p>
    <div style="border-top:1px solid #f0f0f6;padding-top:20px;margin-top:16px;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;font-style:italic;line-height:1.7;">
        "See you in the classroom. Let's crack this together."
      </p>
      <p style="margin:0;font-size:13px;color:#C81240;font-weight:700;">- Dr. Jaspal Singh &nbsp;&middot;&nbsp; ESE AIR-04 &nbsp;&middot;&nbsp; GATE AIR-06</p>
    </div>

  </td></tr>

  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? WhatsApp us at +91 98291 33317 or email team@jaspalsingh.in</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  /* Everything below (photo fetch, PDF generation, email send) is wrapped so
     that any unexpected failure still results in the learner getting a
     confirmation email (without the PDF) instead of silence - the token is
     already marked used above, so this is the only remaining chance to
     reach them without asking them to resubmit the form. */
  try {
    const rollNumberDegree  = generateOmrRollNumber(true);
    const rollNumberDiploma = generateOmrRollNumber(false);
    const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;

    const pdfBuffer = await generateComboAdmitCard({
      name:        name || 'Student',
      govtId:      govtId || 'N/A',
      rollNumberDegree,
      rollNumberDiploma,
      centre:      'Online (Home Based)',
      phone:       phone || 'N/A',
      email:       email || 'N/A',
      photoBuffer,
      mode:        'home',
    });

    const { error } = await resendSend({
      from:    FROM,
      to:      email,
      subject: `Identity Verified - You're enrolled in ${seriesName}`,
      html:    htmlBody,
      attachments: [
        {
          filename:    `AdmitCard_Combo_${rollNumberDegree}_${rollNumberDiploma}.pdf`,
          content:     pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    }, PRIORITY.ACTION_REQUIRED);

    if (error) {
      console.error('[tally-combo-omr] Resend error:', error);
    } else {
      console.log(`[tally-combo-omr] Confirmation + Admit Card sent to ${email} | Degree Roll: ${rollNumberDegree} | Diploma Roll: ${rollNumberDiploma}`);
    }
  } catch (err) {
    console.error('[tally-combo-omr] Failed to generate/send Admit Card - sending fallback confirmation without PDF. Enrollment:', enrollment.id, err);
    await resendSend({
      from: FROM,
      to: email,
      subject: `Identity Verified - You're enrolled in ${seriesName}`,
      html: htmlBody,
    }, PRIORITY.ACTION_REQUIRED).catch(e => console.error('[tally-combo-omr] Fallback email also failed:', e.message));
  }
}

module.exports = {
  processOmrSubmission,
  processComboOmrSubmission,
  generateOmrRollNumber,
  getOmrSeriesName,
  getOmrSchedule,
  getOmrLastTestDate,
  buildOmrConfirmationHtml,
  OMR_SCHEDULE_DEGREE,
  OMR_SCHEDULE_DIPLOMA,
};

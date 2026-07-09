/* ============================================================
   routes/tally-generic.js  -  Config-driven Tally webhook for
   programs launched entirely from the admin dashboard (Phase 6 of
   the 2026-07-08 admin self-serve platform).

   Mounted at /api/tally-generic/:programSlug. Only activates for a
   program whose `launch_config` column (in the `programs` table) is
   set - the programs launched before 2026-07-08 keep using their own
   hand-written tally-*.js route files untouched. This intentionally
   supports single-category programs only (no Degree+Diploma-style
   combo); a combo still needs a short bespoke route, same as today.
   ============================================================ */

const express = require('express');
const router  = express.Router({ mergeParams: true });
const { query } = require('../config/db');
const {
  parseTallyFields, sendRejectionEmail, generateAdmitCard, fetchImageBuffer,
} = require('./tally-webhook');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');

const FROM = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

/* Roll number format: <PREFIX>-<5 random digits>, unique against enrollments.
   Prefix comes from the program's launch_config (admin-set), unlike the
   bespoke routes which derive DEG/DIP from a hardcoded exam-name check. */
async function generateGenericRollNumber(prefix) {
  const clean = (prefix || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'GEN';
  let roll;
  for (let i = 0; i < 10; i++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    roll = `${clean}-${num}`;
    const exists = await query('SELECT 1 FROM enrollments WHERE roll_number = $1', [roll]);
    if (!exists.rows.length) return roll;
  }
  return roll;
}

/* Hybrid-launched offline programs are almost always a single batch in a
   single city, so launch_config.centre is one object, not a map - the
   admin fills in one name/address/maps link and every offline enrollee
   for this program gets it, regardless of what (if anything) they typed
   into a "centre" field on the Tally form. */
function resolveGenericCentre(centreRaw, launchConfig) {
  if (launchConfig.centre && launchConfig.centre.name) return launchConfig.centre;
  return { name: centreRaw || 'TBD', address: 'To be announced - contact us on WhatsApp for details', mapsLink: 'https://wa.me/919829133317' };
}

async function processGenericSubmission(fields, program) {
  const launchConfig = program.launch_config || {};
  const { name, govtId, centre: centreRaw, targetExam, phone, email, photoUrl, token, orderId } = parseTallyFields(fields);

  if (!email) { console.warn('[tally-generic] No email found in fields'); return; }

  const normEmail = email.toLowerCase().trim();
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);

  if (!token && !orderId) {
    await sendRejectionEmail(email, 'Your submission did not include a valid enrollment token. This form must be opened using the personal link sent to you in your enrollment email.');
    return;
  }

  const lookupResult = token
    ? await query(`SELECT id, student_email, student_phone, form_used, form_token FROM enrollments WHERE form_token = $1`, [token])
    : await query(`SELECT id, student_email, student_phone, form_used, form_token FROM enrollments WHERE order_id = $1 AND status = 'paid'`, [orderId]);

  if (!lookupResult.rows.length) {
    console.warn('[tally-generic] Invalid token/order - token:', token, 'orderId:', orderId);
    await sendRejectionEmail(email, 'The enrollment token in your submission is invalid or does not match any paid enrollment. Please use the original link sent in your enrollment email.');
    return;
  }
  if (lookupResult.rows[0].form_used) {
    await sendRejectionEmail(email, 'This enrollment form has already been submitted. Each enrollment allows only one submission. If you made a mistake in your earlier submission, please contact us on WhatsApp immediately and we will assist you.');
    return;
  }

  const preCheck = lookupResult.rows[0];
  const expectedEmail = (preCheck.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    await sendRejectionEmail(email, `The email address you entered (${email}) does not match the email used during payment. Please re-open the form using the link in your enrollment email and enter the same email address you used at checkout.`);
    return;
  }
  const expectedPhone = (preCheck.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    await sendRejectionEmail(email, `The mobile number you entered does not match the number used during payment (+91 ${expectedPhone}). Please re-open the form using the link in your enrollment email and enter the same mobile number you used at checkout.`);
    return;
  }

  // Atomically claim the token so a concurrent duplicate webhook can't double-process it.
  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW() WHERE id = $1 AND form_used = FALSE RETURNING id`,
    [preCheck.id]
  );
  if (!claimResult.rows.length) {
    console.warn('[tally-generic] Race - already claimed, enrollment:', preCheck.id);
    await sendRejectionEmail(email, 'This enrollment form has already been submitted. Each enrollment allows only one submission.');
    return;
  }

  const enrollment = preCheck;
  const mode       = launchConfig.mode === 'offline' ? 'offline' : 'home';
  const centreInfo = mode === 'offline' ? resolveGenericCentre(centreRaw, launchConfig) : null;
  const seriesName = launchConfig.seriesName || program.title;

  try {
    const rollNumber  = await generateGenericRollNumber(launchConfig.rollPrefix);
    const photoBuffer = photoUrl ? await fetchImageBuffer(photoUrl) : null;

    const pdfBuffer = await generateAdmitCard({
      name:       name || 'Student',
      govtId:     govtId || 'N/A',
      rollNumber,
      centre:     centreInfo ? centreInfo.name : 'Home',
      targetExam: targetExam || seriesName,
      phone:      phone || 'N/A',
      email:      email || 'N/A',
      photoBuffer,
      seriesName,
      lastTestDate: launchConfig.lastTestDate || 'To be announced - notified via email & WhatsApp',
      mode,
    });

    const waLine = launchConfig.waGroupUrl
      ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${launchConfig.waGroupUrl}" style="color:#4338CA;font-weight:700;">Join your WhatsApp group &rarr;</a></p>`
      : '';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:#0F1117;border-radius:14px 14px 0 0;padding:24px 36px;text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#fff;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">jaspalsingh.in</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px;">
    <h2 style="margin:0 0 8px;font-size:20px;color:#1A1A2E;font-weight:800;">You're confirmed for ${seriesName}!</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.7;">Your admit card is attached - roll number <strong>${rollNumber}</strong>.</p>
    ${waLine}
  </td></tr>
  <tr><td style="background:#f4f5f8;border-radius:0 0 14px 14px;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">jaspalsingh.in | +91 98291 33317</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

    const result = await resendSend({
      from: FROM,
      to:   email,
      subject: `Confirmed! Your Admit Card for ${seriesName}`,
      html,
      attachments: [{
        filename:    `AdmitCard_${rollNumber}.pdf`,
        content:     pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      }],
    }, PRIORITY.ADMIT_CARD);

    if (result.error) {
      console.error('[tally-generic] Resend error:', result.error);
      await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
    } else {
      console.log(`[tally-generic] Email sent to ${email} | Roll: ${rollNumber} | Program: ${program.slug}`);
      await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2', [rollNumber, enrollment.id]);
    }
  } catch (err) {
    console.error('[tally-generic] Admit card generation failed:', err.message);
    await query('UPDATE enrollments SET form_used = FALSE, form_used_at = NULL WHERE id = $1', [enrollment.id]);
  }
}

router.post('/', async (req, res) => {
  const programSlug = req.params.programSlug;
  // Ack immediately - same pattern as every other Tally route, since Tally
  // retries on anything other than a fast 2xx.
  res.status(200).json({ ok: true });

  if (req.body.eventType !== 'FORM_RESPONSE') return;

  try {
    const progResult = await query(`SELECT * FROM programs WHERE slug = $1`, [programSlug]);
    const program = progResult.rows[0];
    if (!program || !program.launch_config) {
      console.warn(`[tally-generic] No launch_config for program "${programSlug}" - ignoring submission.`);
      return;
    }
    const fields = req.body.data?.fields || [];
    await processGenericSubmission(fields, program);
  } catch (err) {
    console.error('[tally-generic] Error processing submission:', err);
  }
});

module.exports = router;

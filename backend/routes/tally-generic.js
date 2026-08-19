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
  parseTallyFields, generateAdmitCard, fetchImageBuffer, persistPendingAdmitCard, sendSubmissionReceivedEmail,
} = require('./tally-webhook');

const FROM = 'Dr. Jaspal Singh <team@jaspalsingh.in>';

const { generateRollNumber } = require('../utils/rollNumber');

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
    // No enrollment row identified at all - nothing to mark for review.
    console.warn('[tally-generic] No token or order in submission - dropping');
    return;
  }

  const lookupResult = token
    ? await query(`SELECT id, student_email, student_phone, form_used, form_token, roll_number FROM enrollments WHERE form_token = $1`, [token])
    : await query(`SELECT id, student_email, student_phone, form_used, form_token, roll_number FROM enrollments WHERE order_id = $1 AND status = 'paid'`, [orderId]);

  if (!lookupResult.rows.length) {
    console.warn('[tally-generic] Invalid token/order - token:', token, 'orderId:', orderId);
    return;
  }
  if (lookupResult.rows[0].form_used) {
    // Prior successful run already owns this row's admit_card_status.
    console.warn('[tally-generic] Token already used, enrollment:', lookupResult.rows[0].id);
    return;
  }

  const preCheck = lookupResult.rows[0];
  const expectedEmail = (preCheck.student_email || '').toLowerCase().trim();
  if (normEmail !== expectedEmail) {
    await query(
      `UPDATE enrollments SET admit_card_status = 'rejected', admit_card_rejection_reason = $1, admit_card_submitted_at = NOW() WHERE id = $2 AND admit_card_status != 'approved'`,
      [`Submitted email (${email}) does not match the email used at checkout.`, preCheck.id]
    );
    return;
  }
  const expectedPhone = (preCheck.student_phone || '').replace(/\D/g, '').slice(-10);
  if (normPhone && expectedPhone && normPhone !== expectedPhone) {
    await query(
      `UPDATE enrollments SET admit_card_status = 'rejected', admit_card_rejection_reason = $1, admit_card_submitted_at = NOW() WHERE id = $2 AND admit_card_status != 'approved'`,
      [`Submitted mobile number does not match the number used at checkout (expected +91 ${expectedPhone}).`, preCheck.id]
    );
    return;
  }

  // Atomically claim the token so a concurrent duplicate webhook can't double-process it.
  const claimResult = await query(
    `UPDATE enrollments SET form_used = TRUE, form_used_at = NOW() WHERE id = $1 AND form_used = FALSE RETURNING id`,
    [preCheck.id]
  );
  if (!claimResult.rows.length) {
    // Concurrent duplicate delivery - the winner owns this row's status.
    console.warn('[tally-generic] Race - already claimed, enrollment:', preCheck.id);
    return;
  }

  const enrollment = preCheck;
  const mode       = launchConfig.mode === 'offline' ? 'offline' : 'home';
  const centreInfo = mode === 'offline' ? resolveGenericCentre(centreRaw, launchConfig) : null;
  const seriesName = launchConfig.seriesName || program.title;

  // Fail safe against a blank-looking "approved" card - see the identical
  // check in tally-webhook.js's processSubmission for the reasoning.
  if (!name) {
    console.error('[tally-generic] No name parsed from submission - raw fields:', JSON.stringify(fields));
    await query(
      `UPDATE enrollments SET admit_card_status = 'rejected', admit_card_rejection_reason = $1, admit_card_submitted_at = NOW() WHERE id = $2 AND admit_card_status != 'approved'`,
      [`Your name could not be read from the submitted form. Please message us on WhatsApp so we can fix this manually.`, enrollment.id]
    );
    return;
  }

  try {
    // Reuse a roll number already on the row (e.g. from an admin priority
    // backfill run before this learner got to the form) instead of
    // generating a fresh one - otherwise the number shown in their profile
    // before submission would silently change once they submit.
    const rollNumber  = enrollment.roll_number || await generateRollNumber(launchConfig.rollPrefix);
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

    // Admit card is no longer emailed - persisted to R2 and held pending
    // admin review instead (see routes/admit-card-review.js).
    await persistPendingAdmitCard(enrollment.id, pdfBuffer);
    await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2 AND roll_number IS NULL', [rollNumber, enrollment.id]);
    await sendSubmissionReceivedEmail({ to: email, name, seriesName }).catch(e => console.error('[tally-generic] submission-received email failed:', e.message));
    console.log(`[tally-generic] Admit card generated and pending review | ${email} | Roll: ${rollNumber} | Program: ${program.slug}`);
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

/* ============================================================
   routes/tally-combo-offline.js  -  Degree + Diploma Combo webhook
   Handles Tally form submissions for the offline combo test series.
   Generates one combined admit card (both roll numbers) and sends it.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { processComboSubmission } = require('./tally-webhook');

/* POST /api/tally-combo-offline */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processComboSubmission(fields).catch(err => {
    console.error('[tally-combo-offline] Error:', err);
  });
});

module.exports = router;

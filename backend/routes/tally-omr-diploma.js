/* ============================================================
   routes/tally-omr-diploma.js  -  OMR Diploma form webhook
   Handles Tally form submissions for the OMR Online Diploma series.
   No admit card - just validates token and sends confirmation email.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { processOmrSubmission } = require('./tally-omr-shared');

/* POST /api/tally-omr-diploma */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processOmrSubmission(fields, 'omr-diploma').catch(err => {
    console.error('[tally-omr-diploma]', err);
  });
});

module.exports = router;

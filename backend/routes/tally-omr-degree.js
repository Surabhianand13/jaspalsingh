/* ============================================================
   routes/tally-omr-degree.js  -  OMR Degree form webhook
   Handles Tally form submissions for the OMR Online Degree series.
   No admit card - just validates token and sends confirmation email.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { processOmrSubmission } = require('./tally-omr-shared');

/* POST /api/tally-omr-degree */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processOmrSubmission(fields, 'omr-degree').catch(err => {
    console.error('[tally-omr-degree]', err);
  });
});

module.exports = router;

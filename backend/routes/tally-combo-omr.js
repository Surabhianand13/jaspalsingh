/* ============================================================
   routes/tally-combo-omr.js  -  Degree + Diploma Combo OMR webhook
   Handles Tally form submissions for the Home-Based OMR combo series.
   No admit card PDF - validates token and sends a confirmation email
   covering both the Degree and Diploma schedules.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { processComboOmrSubmission } = require('./tally-omr-shared');

/* POST /api/tally-combo-omr */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processComboOmrSubmission(fields).catch(err => {
    console.error('[tally-combo-omr] Error:', err);
  });
});

module.exports = router;

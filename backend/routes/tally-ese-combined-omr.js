const express = require('express');
const router  = express.Router();
const { processEseCombinedSubmission } = require('./tally-ese-shared');

/* POST /api/tally-ese-combined-omr  -  ESE 2027 Prelims Paper 1 + 2 (Home-Based OMR) form webhook */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processEseCombinedSubmission(fields, 'combinedOmr').catch(err => {
    console.error('[tally-ese-combined-omr] Error:', err);
  });
});

module.exports = router;

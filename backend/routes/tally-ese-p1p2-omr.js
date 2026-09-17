const express = require('express');
const router  = express.Router();
const { processEseCombinedSubmission } = require('./tally-ese-shared');

/* POST /api/tally-ese-p1p2-omr  -  ESE 2027 Prelims Paper 1+2 Civil (Printed OMR) form webhook */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processEseCombinedSubmission(fields, 'p1p2Omr').catch(err => {
    console.error('[tally-ese-p1p2-omr] Error:', err);
  });
});

module.exports = router;

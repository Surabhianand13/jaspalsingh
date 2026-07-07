const express = require('express');
const router  = express.Router();
const { processEseSubmission } = require('./tally-ese-shared');

/* POST /api/tally-ese-paper1-omr  -  ESE 2027 Prelims Paper 1 (Home-Based OMR) form webhook */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processEseSubmission(fields, 'paper1Omr').catch(err => {
    console.error('[tally-ese-paper1-omr] Error:', err);
  });
});

module.exports = router;

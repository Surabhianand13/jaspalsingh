const express = require('express');
const router  = express.Router();
const { processSubmission } = require('./tally-webhook');

/* POST /api/tally-degree  -  Degree (Civil) form webhook */
router.post('/', (req, res) => {
  res.status(200).json({ ok: true });
  if (req.body.eventType !== 'FORM_RESPONSE') return;
  const fields = req.body.data?.fields || [];
  processSubmission(fields, 'degree').catch(err => {
    console.error('[tally-degree] Error:', err);
  });
});

module.exports = router;

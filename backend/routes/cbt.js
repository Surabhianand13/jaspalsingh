/* ============================================================
   routes/cbt.js  -  Offline CBT result sync (pilot)

   PUBLIC (key-protected): POST /api/cbt/sync
     Called by the offline exam app (see /offline-cbt) once a staff
     member connects an exam machine to the hotspot and hits Sync.
     Not behind the normal admin JWT login - that would mean staff
     re-authenticating on every machine, every round. Instead it's
     gated by a shared key (CBT_SYNC_KEY) baked into offline-cbt/data.js
     and checked against an env var here. Rotate CBT_SYNC_KEY (and
     redistribute the updated data.js to the USB copies) if it ever
     leaks - it's a low-value target (can only submit exam results,
     can't read anything), but still shouldn't be left wide open.

   ADMIN: GET /api/cbt/admin/results
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

router.post('/sync', async (req, res, next) => {
  try {
    const key = req.headers['x-cbt-sync-key'];
    if (!process.env.CBT_SYNC_KEY || key !== process.env.CBT_SYNC_KEY) {
      return res.status(401).json({ error: 'Invalid or missing sync key.' });
    }

    const results = Array.isArray(req.body.results) ? req.body.results : [];
    if (!results.length) return res.status(400).json({ error: 'results array is required.' });

    let saved = 0;
    for (const r of results) {
      if (!r.id || !r.mobile || !r.test_id) continue; // skip malformed rows rather than failing the whole batch
      await query(
        `INSERT INTO cbt_results
           (external_id, mobile, name, roll_number, program, test_id, test_title,
            answers, score, total, auto_submitted, started_at, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (external_id) DO NOTHING`,
        [
          r.id, r.mobile, r.name || null, r.roll_number || null, r.program || null,
          r.test_id, r.test_title || null, JSON.stringify(r.answers || {}),
          r.score != null ? r.score : null, r.total != null ? r.total : null,
          !!r.auto_submitted, r.started_at || null, r.submitted_at || null,
        ]
      );
      saved++;
    }

    res.json({ message: `Synced ${saved} result(s).` });
  } catch (err) { next(err); }
});

/* ── ADMIN: list synced results ── */
router.get('/admin/results', protect, async (req, res, next) => {
  try {
    const testId = req.query.test_id;
    const result = await query(
      testId
        ? `SELECT * FROM cbt_results WHERE test_id = $1 ORDER BY submitted_at DESC`
        : `SELECT * FROM cbt_results ORDER BY submitted_at DESC`,
      testId ? [testId] : []
    );
    res.json({ results: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;

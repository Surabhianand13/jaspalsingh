/* ============================================================
   routes/leads.js  -  Lead capture for Coming Soon programs
   Dr. Jaspal Singh Website  -  jaspalsingh.in
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

const COMING_SOON_PROGRAMS = {
  'rssb-jen-crash-course':  'RSSB JEN 2026-27 Offline Crash Course',
  'gate-ese-foundation':    'GATE / ESE 2028 - Offline Foundation Course',
};

const LIVE_PROGRAMS = {
  'rssb-jen-diploma-test-series': 'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline',
  'rssb-jen-degree-test-series':  'RSSB JE 2026 - Jaspal Sir Ki Test Series Offline',
  'rpsc-ae-interview':            'RPSC AE 2024 - Interview Guidance Programme',
};

/* ── POST /api/leads/capture ─────────────────────────────── */
router.post('/capture', async (req, res) => {
  try {
    const { program_slug, name, email, phone } = req.body;

    if (!program_slug || !name || !phone) {
      return res.status(400).json({ error: 'name, phone and program_slug are required.' });
    }

    if (!COMING_SOON_PROGRAMS[program_slug]) {
      return res.status(400).json({ error: 'Invalid program.' });
    }

    await query(
      `INSERT INTO leads (program_slug, program_name, name, email, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [program_slug, COMING_SOON_PROGRAMS[program_slug], name, email || null, phone]
    );

    res.json({ success: true, message: "You're on the list! We'll contact you on WhatsApp when the batch opens." });

  } catch (err) {
    console.error('[leads/capture]', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ── POST /api/leads/checkout-abandon ───────────────────────
   Fires via sendBeacon when a user fills the checkout form
   but leaves without clicking Pay. Deduped by phone+program. */
router.post('/checkout-abandon', async (req, res) => {
  try {
    const { program_slug, name, phone, email } = req.body;

    if (!program_slug || !phone) {
      return res.status(400).json({ error: 'phone and program_slug are required.' });
    }

    const program_name =
      LIVE_PROGRAMS[program_slug] || COMING_SOON_PROGRAMS[program_slug] || program_slug;

    // Insert only if this phone hasn't already been recorded for this program
    await query(
      `INSERT INTO leads (program_slug, program_name, name, email, phone, source)
       VALUES ($1, $2, $3, $4, $5, 'checkout_abandon')
       ON CONFLICT DO NOTHING`,
      [program_slug, program_name, name || null, email || null, phone.replace(/\D/g,'').slice(-10)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[leads/checkout-abandon]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── ADMIN: all leads ────────────────────────────────────── */
const { protect } = require('../middleware/auth');
router.get('/admin/all', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, program_slug, program_name, name, email, phone, source, created_at
       FROM leads ORDER BY created_at DESC`
    );
    res.json({ leads: result.rows, total: result.rowCount });
  } catch (err) { next(err); }
});

module.exports = router;

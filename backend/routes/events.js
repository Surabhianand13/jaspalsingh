/* ============================================================
   routes/events.js  -  Interaction tracking
   Captures every meaningful action: page views, WhatsApp/call/
   enquiry clicks, program views, checkout funnel, etc.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');

const ALLOWED_TYPES = new Set([
  'page_view', 'program_view', 'whatsapp_click', 'call_click',
  'enquiry_click', 'enroll_click', 'checkout_start', 'checkout_exit',
  'payment_success', 'lead_submit', 'signup', 'login', 'login_wall_view',
  'coupon_apply', 'cta_click', 'banner_click',
]);

/* ── POST /api/events/track  (public, fire-and-forget) ───── */
router.post('/track', async (req, res) => {
  try {
    let { type, label, path, session_id, meta } = req.body || {};
    if (!type || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid event type.' });
    }

    // Optional learner from bearer token
    let learner_id = null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const d = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
        if (d && d.id) learner_id = d.id;
      } catch (e) { /* ignore */ }
    }

    await query(
      `INSERT INTO events (type, label, path, session_id, learner_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        type,
        (label || '').slice(0, 200) || null,
        (path || '').slice(0, 300) || null,
        (session_id || '').slice(0, 80) || null,
        learner_id,
        meta ? JSON.stringify(meta).slice(0, 2000) : null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    // Never break the page over analytics
    res.json({ ok: false });
  }
});

/* ── Admin guard ─────────────────────────────────────────── */
const { protect } = require('../middleware/auth');

/* ── IST day boundary helper ─────────────────────────────────
   Returns {start, end} as UTC Date objects for a calendar day in IST.
   offsetDays=0 → today IST, offsetDays=1 → yesterday IST           */
function istDayBounds(offsetDays) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  // Midnight IST for target day
  const midnight = new Date(Date.UTC(
    nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate() - offsetDays
  ));
  const start = new Date(midnight.getTime() - IST_OFFSET_MS); // convert IST midnight → UTC
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/* ── GET /api/events/summary  (admin) ────────────────────────
   Accepts either:
     ?period=today|yesterday   - IST calendar day
     ?days=N                   - rolling N-day window (default 7) */
router.get('/summary', protect, async (req, res, next) => {
  try {
    const period = req.query.period;
    const days   = Math.min(parseInt(req.query.days || '7', 10), 365);

    let params, whereClause, label;

    if (period === 'today') {
      const { start } = istDayBounds(0);
      params      = [start.toISOString()];
      whereClause = `created_at >= $1 AND created_at <= NOW()`;
      label       = 'Today';
    } else if (period === 'yesterday') {
      const { start, end } = istDayBounds(1);
      params      = [start.toISOString(), end.toISOString()];
      whereClause = `created_at >= $1 AND created_at < $2`;
      label       = 'Yesterday';
    } else {
      params      = [days];
      whereClause = `created_at > NOW() - make_interval(days => $1)`;
      label       = `${days}d`;
    }

    const [byType, funnel, active] = await Promise.all([
      query(`SELECT type, COUNT(*)::int AS count FROM events WHERE ${whereClause} GROUP BY type ORDER BY count DESC`, params),
      query(`SELECT
               COUNT(*) FILTER (WHERE type='program_view')::int    AS program_views,
               COUNT(*) FILTER (WHERE type='checkout_start')::int  AS checkout_starts,
               COUNT(*) FILTER (WHERE type='checkout_exit')::int   AS checkout_exits,
               COUNT(*) FILTER (WHERE type='payment_success')::int AS payments
             FROM events WHERE ${whereClause}`, params),
      query(`SELECT COUNT(DISTINCT session_id)::int AS active_sessions
             FROM events WHERE created_at > NOW() - INTERVAL '30 minutes'`),
    ]);

    res.json({
      period: label,
      by_type: byType.rows,
      funnel:  funnel.rows[0],
      active_now: active.rows[0].active_sessions,
    });
  } catch (err) { next(err); }
});

/* ── GET /api/events/recent?limit=100  (admin) ───────────── */
router.get('/recent', protect, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const result = await query(
      `SELECT id, type, label, path, session_id, learner_id, created_at
       FROM events ORDER BY created_at DESC LIMIT $1`, [limit]);
    res.json({ events: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;

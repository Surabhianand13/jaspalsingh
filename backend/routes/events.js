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

/* ── GET /api/events/summary  (admin) ────────────────────────
   Accepts either:
     ?period=today|yesterday   - IST calendar day
     ?days=N                   - rolling N-day window (default 7) */
router.get('/summary', protect, async (req, res, next) => {
  try {
    const period = req.query.period; // 'today' | 'yesterday'
    const days   = Math.min(parseInt(req.query.days || '7', 10), 365);

    // Build WHERE clause for IST calendar boundaries
    let whereClause;
    let label;
    if (period === 'today') {
      // From IST midnight today to now
      whereClause = `created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                     AND created_at < NOW()`;
      label = 'today';
    } else if (period === 'yesterday') {
      // From IST midnight yesterday to IST midnight today
      whereClause = `created_at >= ((CURRENT_DATE - INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                     AND created_at < (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;
      label = 'yesterday';
    } else {
      whereClause = `created_at > NOW() - make_interval(days => ${days})`;
      label = `${days}d`;
    }

    const [byType, funnel, active] = await Promise.all([
      query(`SELECT type, COUNT(*)::int AS count
             FROM events WHERE ${whereClause}
             GROUP BY type ORDER BY count DESC`),
      query(`SELECT
               COUNT(*) FILTER (WHERE type='program_view')::int    AS program_views,
               COUNT(*) FILTER (WHERE type='checkout_start')::int  AS checkout_starts,
               COUNT(*) FILTER (WHERE type='checkout_exit')::int   AS checkout_exits,
               COUNT(*) FILTER (WHERE type='payment_success')::int AS payments
             FROM events WHERE ${whereClause}`),
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

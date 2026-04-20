/* ============================================================
   controllers/analyticsController.js — Analytics API
   Dr. Jaspal Singh Website — jaspalsingh.in

   PUBLIC:
     GET /api/analytics/public       — total resources, downloads, learners

   ADMIN PROTECTED:
     GET /api/analytics/downloads/trend   — downloads per day (last N days)
     GET /api/analytics/learners/trend    — signups per day (last N days)
     GET /api/analytics/subjects          — resources + downloads by subject
     GET /api/analytics/top-resources     — top 10 most downloaded
   ============================================================ */

const { query } = require('../config/db');

/* ── GET /api/analytics/public ─────────────────────────────── */
const publicStats = async (req, res, next) => {
  try {
    const [resResult, dlResult, learnerResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS total FROM resources WHERE is_visible = TRUE'),
      query('SELECT COALESCE(SUM(download_count), 0)::int AS total FROM resources'),
      query('SELECT COUNT(*)::int AS total FROM learners WHERE is_active = TRUE'),
    ]);

    res.json({
      total_resources: resResult.rows[0].total,
      total_downloads: dlResult.rows[0].total,
      total_learners:  learnerResult.rows[0].total,
    });
  } catch (err) { next(err); }
};

/* ── GET /api/analytics/downloads/trend?days=30 ─────────────── */
const downloadsTrend = async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);

    /* Build a date series so days with zero downloads still appear.
       Use make_interval() so days is a typed integer parameter — no string interpolation. */
    const result = await query(
      `SELECT
         gs.day::date AS date,
         COALESCE(COUNT(de.id), 0)::int AS downloads
       FROM generate_series(
         (NOW() - make_interval(days => $1))::date,
         NOW()::date,
         '1 day'::interval
       ) AS gs(day)
       LEFT JOIN download_events de
         ON de.downloaded_at::date = gs.day::date
       GROUP BY gs.day
       ORDER BY gs.day ASC`,
      [days - 1]
    );

    res.json({ trend: result.rows, days });
  } catch (err) { next(err); }
};

/* ── GET /api/analytics/learners/trend?days=30 ──────────────── */
const learnersTrend = async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);

    const result = await query(
      `SELECT
         gs.day::date AS date,
         COALESCE(COUNT(l.id), 0)::int AS signups
       FROM generate_series(
         (NOW() - make_interval(days => $1))::date,
         NOW()::date,
         '1 day'::interval
       ) AS gs(day)
       LEFT JOIN learners l ON l.created_at::date = gs.day::date
       GROUP BY gs.day
       ORDER BY gs.day ASC`,
      [days - 1]
    );

    res.json({ trend: result.rows, days });
  } catch (err) { next(err); }
};

/* ── GET /api/analytics/subjects ────────────────────────────── */
const subjectBreakdown = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         subject,
         COUNT(*)::int                           AS resource_count,
         COALESCE(SUM(download_count), 0)::int   AS total_downloads
       FROM resources
       WHERE is_visible = TRUE
       GROUP BY subject
       ORDER BY total_downloads DESC`
    );
    res.json({ subjects: result.rows });
  } catch (err) { next(err); }
};

/* ── GET /api/analytics/top-resources?limit=10 ──────────────── */
const topResources = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 25);
    const result = await query(
      `SELECT id, title, subject, resource_type, download_count
       FROM resources
       WHERE is_visible = TRUE
       ORDER BY download_count DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ resources: result.rows });
  } catch (err) { next(err); }
};

module.exports = { publicStats, downloadsTrend, learnersTrend, subjectBreakdown, topResources };

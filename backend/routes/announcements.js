/* ============================================================
   routes/announcements.js  -  One-time announcement emails to
   every learner on the platform (registered learners + paid
   enrollments, one per email address, each at most once per
   campaign). Admin > Learners > "Email announcements".

   Campaigns are defined in CAMPAIGNS below (subject + body).
     GET  /api/announcements/admin        - campaigns + recipient counts
     POST /api/announcements/admin/:key   - { mode: 'sample', to } | { mode: 'all' }
   ============================================================ */

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { send: resendSend, PRIORITY } = require('../services/resendQueue');
const { baseHtml, esc, FROM, SITE } = require('../services/paymentEmailService');

const RED = '#C81240';

function btn(href, label, ghost) {
  return `<div style="text-align:center;margin:0 0 16px;">
    <a href="${esc(href)}" style="display:inline-block;${ghost ? `background:#fff;color:${RED};border:2px solid ${RED};` : `background:${RED};color:#fff;`}border-radius:10px;padding:13px 30px;font-size:15px;font-weight:800;text-decoration:none;">${label}</a>
  </div>`;
}

const CAMPAIGNS = {
  'rssb-je-new-posts-2026-11': {
    title: 'RSSB JE 2026: 961 new posts added (official notice, 17 Nov 2026)',
    subject: 'RSSB JE 2026: 961 new posts added - fresh applications open till 17 Dec',
    html(name) {
      const first = esc((name || 'there').split(' ')[0]);
      return baseHtml(`
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:inline-block;background:#fef2f2;border:1px solid #fecaca;border-radius:50px;padding:8px 22px;">
            <span style="font-size:13px;font-weight:800;color:#991b1b;">📢 OFFICIAL UPDATE - RSSB JE 2026</span>
          </div>
        </div>
        <h2 style="margin:0 0 8px;font-size:23px;color:#1A1A2E;font-weight:800;text-align:center;">961 new JE posts added</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#374151;text-align:center;"><strong style="color:${RED};">1,835+ posts</strong> in total (874 earlier + 961 new)</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.7;">Hi ${first}, RSSB has added new posts to the JE Combined Direct Recruitment 2026:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:20px;">
          <tr><td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #f1f5f9;">Urban Development &amp; Housing (UDH)</td><td style="padding:10px 16px;font-size:16px;font-weight:800;color:${RED};text-align:right;border-bottom:1px solid #f1f5f9;">770</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #f1f5f9;">Local Self Govt (Swayatt Shasan)</td><td style="padding:10px 16px;font-size:16px;font-weight:800;color:${RED};text-align:right;border-bottom:1px solid #f1f5f9;">150</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #f1f5f9;">Agricultural Marketing Board</td><td style="padding:10px 16px;font-size:16px;font-weight:800;color:${RED};text-align:right;border-bottom:1px solid #f1f5f9;">41</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#374151;">PWD &amp; PHED</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:${RED};text-align:right;">Posts revised</td></tr>
        </table>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin-bottom:22px;font-size:14px;color:#374151;line-height:1.9;">
          🗓️ <strong>Fresh applications:</strong> 18 Nov - 17 Dec 2026<br>
          ✅ <strong>Already applied?</strong> No need to apply again<br>
          ✏️ <strong>Department preference change (free):</strong> 22 - 31 Dec 2026<br>
          ✏️ <strong>Other corrections:</strong> Rs 300 fee, only till 17 Dec (name, father's name, DOB, photo, signature and thumb impression cannot be changed)
        </div>
        ${btn(`${SITE}/assets/docs/rssb-je-2026-new-posts-notice.pdf`, 'Read the official notice (PDF)')}
        <p style="margin:6px 0 14px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">More seats means a better chance. Prepare with Jaspal Sir's offline test series and the शौर्य Batch.</p>
        ${btn(`${SITE}/programs?exam=rssb-je`, 'Explore RSSB JE programs &rarr;', true)}
      `);
    },
  },
};

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS announcement_sends (
    campaign TEXT NOT NULL,
    email    TEXT NOT NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign, email)
  )`);
}

/* Every registered learner + every paid enrollment (not refunded,
   not an admin preview), one row per email address. */
async function audience() {
  return (await query(
    `SELECT DISTINCT ON (k) k, email, name FROM (
       SELECT LOWER(TRIM(l.email)) AS k, l.email, l.name, 0 AS pref FROM learners l
        WHERE l.email IS NOT NULL AND TRIM(l.email) <> ''
       UNION ALL
       SELECT LOWER(TRIM(e.student_email)), e.student_email, e.student_name, 1 FROM enrollments e
        WHERE e.status = 'paid' AND e.refund_status != 'initiated' AND e.order_id NOT LIKE 'JSP-ADMINPREVIEW-%'
          AND e.student_email IS NOT NULL AND TRIM(e.student_email) <> ''
     ) x WHERE k ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
     ORDER BY k, pref`
  )).rows;
}

async function targets(key) {
  const all = await audience();
  const sent = new Set((await query(`SELECT email FROM announcement_sends WHERE campaign = $1`, [key])).rows.map(r => r.email));
  return { total: all.length, sent: all.filter(r => sent.has(r.k)).length, pending: all.filter(r => !sent.has(r.k)) };
}

router.get('/admin', protect, async (req, res, next) => {
  try {
    const out = [];
    for (const [key, c] of Object.entries(CAMPAIGNS)) {
      const t = await targets(key);
      out.push({ key, title: c.title, subject: c.subject, total: t.total, sent: t.sent, pending: t.pending.length });
    }
    res.json({ campaigns: out });
  } catch (err) { next(err); }
});

const running = new Set();

router.post('/admin/:key', protect, async (req, res, next) => {
  try {
    const key = req.params.key;
    const c = CAMPAIGNS[key];
    if (!c) return res.status(404).json({ error: 'Unknown announcement.' });
    const b = req.body || {};
    if (b.mode === 'sample') {
      const to = String(b.to || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid email address.' });
      await resendSend({ from: FROM, to, subject: `[SAMPLE] ${c.subject}`, html: c.html('Rahul Sharma') }, PRIORITY.DEFAULT);
      return res.json({ ok: true, sent: 1 });
    }
    if (b.mode !== 'all') return res.status(400).json({ error: 'Invalid mode.' });
    if (running.has(key)) return res.status(409).json({ error: 'This announcement is already being sent.' });
    const { pending } = await targets(key);
    running.add(key);
    (async () => {
      let n = 0;
      for (const r of pending) {
        try {
          // Claimed first, so a restart or a second click never sends twice.
          const claim = await query(`INSERT INTO announcement_sends (campaign, email) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`, [key, r.k]);
          if (!claim.rows.length) continue;
          // DEFAULT priority: OTPs / invoices still go out first.
          await resendSend({ from: FROM, to: r.email, subject: c.subject, html: c.html(r.name) }, PRIORITY.DEFAULT);
          n++;
        } catch (err) { console.error(`[announcement ${key}] ${r.email}:`, err.message); }
      }
      console.log(`[announcement ${key}] sent ${n} email(s)`);
    })().finally(() => running.delete(key));
    res.json({ ok: true, queued: pending.length });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.migrate = migrate;

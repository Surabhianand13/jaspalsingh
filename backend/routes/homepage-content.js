/* ============================================================
   routes/homepage-content.js  -  Admin-managed homepage sections
   Covers 3 tables that all share the same shape: carousel slides,
   the scrolling ticker/"latest news" strip, and quick links.
   PUBLIC:  GET /api/homepage-content/:section          (visible only, ordered)
   ADMIN:   GET    /api/homepage-content/:section/admin/all
            POST   /api/homepage-content/:section
            PUT    /api/homepage-content/:section/:id
            PATCH  /api/homepage-content/:section/:id/visibility
            DELETE /api/homepage-content/:section/:id
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

const TABLES = {
  carousel:   { table: 'homepage_carousel',   fields: ['image_url', 'link_url', 'title', 'badge'], required: ['image_url'] },
  ticker:     { table: 'homepage_ticker',     fields: ['text', 'link_url', 'badge'], required: ['text'] },
  quicklinks: { table: 'homepage_quicklinks', fields: ['label', 'link_url', 'badge', 'group_name'], required: ['label', 'link_url'] },
};

function sectionOr404(req, res) {
  const cfg = TABLES[req.params.section];
  if (!cfg) { res.status(404).json({ error: 'Unknown homepage content section.' }); return null; }
  return cfg;
}

/* ── PUBLIC: visible items for a section ── */
router.get('/:section', async (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  try {
    const result = await query(
      `SELECT * FROM ${cfg.table} WHERE is_visible = TRUE ORDER BY sort_order ASC, id ASC`
    );
    res.json({ items: result.rows });
  } catch (err) { next(err); }
});

/* ── ADMIN: all items for a section ── */
router.get('/:section/admin/all', protect, (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  query(`SELECT * FROM ${cfg.table} ORDER BY sort_order ASC, id ASC`)
    .then(result => res.json({ items: result.rows }))
    .catch(next);
});

/* ── ADMIN: create ── */
router.post('/:section', protect, (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  const b = req.body || {};
  for (const f of cfg.required) {
    if (!b[f]) return res.status(400).json({ error: `${f} is required.` });
  }
  const cols = cfg.fields.concat(['sort_order', 'is_visible']);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
  const values = cfg.fields.map(f => b[f] || null).concat([b.sort_order || 0, b.is_visible !== undefined ? !!b.is_visible : true]);
  query(
    `INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
    values
  ).then(result => res.status(201).json({ item: result.rows[0] })).catch(next);
});

/* ── ADMIN: update ── */
router.put('/:section/:id', protect, (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  const b = req.body || {};
  const setClauses = cfg.fields.map((f, i) => `${f} = COALESCE($${i + 1}, ${f})`);
  const values = cfg.fields.map(f => b[f] || null);
  let idx = cfg.fields.length + 1;
  setClauses.push(`sort_order = COALESCE($${idx}, sort_order)`);       values.push(b.sort_order !== undefined ? b.sort_order : null); idx++;
  setClauses.push(`is_visible = COALESCE($${idx}, is_visible)`);       values.push(b.is_visible !== undefined ? !!b.is_visible : null); idx++;
  values.push(req.params.id);
  query(
    `UPDATE ${cfg.table} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  ).then(result => {
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item: result.rows[0] });
  }).catch(next);
});

/* ── ADMIN: toggle visibility ── */
router.patch('/:section/:id/visibility', protect, (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  query(
    `UPDATE ${cfg.table} SET is_visible = $1 WHERE id = $2 RETURNING id, is_visible`,
    [!!req.body.is_visible, req.params.id]
  ).then(result => {
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item: result.rows[0] });
  }).catch(next);
});

/* ── ADMIN: delete ── */
router.delete('/:section/:id', protect, (req, res, next) => {
  const cfg = sectionOr404(req, res);
  if (!cfg) return;
  query(`DELETE FROM ${cfg.table} WHERE id = $1`, [req.params.id])
    .then(() => res.json({ ok: true }))
    .catch(next);
});

module.exports = router;

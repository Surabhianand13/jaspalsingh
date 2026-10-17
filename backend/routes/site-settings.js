/* ============================================================
   routes/site-settings.js  -  Admin-editable site-wide settings
   Stored as one JSONB document per key in site_settings.

   PUBLIC:  GET /api/site-settings/nav-menu   - header exam menu (or null)
   ADMIN:   PUT /api/site-settings/nav-menu   - replace the whole menu

   The nav menu is rendered on every page by frontend/js/main.js. Until
   an admin saves one, GET returns { menu: null } and every page keeps
   its built-in (hardcoded) menu.
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

const COLORS = ['blue', 'orange', 'magenta'];

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/* Only site-relative paths or https links - never javascript:/data: etc. */
function safeUrl(v) {
  const u = str(v, 500);
  if (!u) return '';
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  return null;
}

/* Font Awesome class like "fa-clipboard-list" - nothing else ends up in markup. */
function safeIcon(v, fallback) {
  const s = str(v, 60);
  return /^fa-[a-z0-9-]+$/.test(s) ? s : fallback;
}

function safeColor(v, fallback) {
  const s = str(v, 20);
  return /^#[0-9a-f]{3,8}$/i.test(s) ? s : fallback;
}

/* Validates and normalises the whole menu; throws with a readable message. */
function cleanMenu(input) {
  if (!input || !Array.isArray(input.exams)) throw new Error('Menu must have an "exams" list.');
  if (input.exams.length > 15) throw new Error('At most 15 top-level menus.');
  const usedKeys = new Set();

  const exams = input.exams.map((e, ei) => {
    const label = str(e.label, 40);
    if (!label) throw new Error(`Menu #${ei + 1} needs a name.`);
    let key = str(e.key, 30).toLowerCase().replace(/[^a-z0-9-]/g, '') || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    while (usedKeys.has(key)) key += '-x';
    usedKeys.add(key);

    const columns = (Array.isArray(e.columns) ? e.columns : []).slice(0, 3).map((c, ci) => {
      const items = (Array.isArray(c.items) ? c.items : []).slice(0, 20).map((it, ii) => {
        const itLabel = str(it.label, 80);
        const url = safeUrl(it.url);
        if (!itLabel) throw new Error(`${label} > column ${ci + 1} > link ${ii + 1} needs a name.`);
        if (!url) throw new Error(`"${itLabel}" needs a landing page link starting with / or https://`);
        return {
          label: itLabel,
          url,
          isNew: !!it.isNew,
          visible: it.visible !== false,
          icon: safeIcon(it.icon, 'fa-file-alt'),
          iconColor: safeColor(it.iconColor, '#0284C7'),
          iconBg: safeColor(it.iconBg, '#EFF6FF'),
        };
      });
      return {
        title: str(c.title, 40) || 'Programs',
        color: COLORS.includes(c.color) ? c.color : 'blue',
        icon: safeIcon(c.icon, 'fa-clipboard-list'),
        items,
      };
    });

    let url = '';
    if (!columns.length) {
      url = safeUrl(e.url);
      if (!url) throw new Error(`"${label}" has no dropdown columns, so it needs a link starting with / or https://`);
    }
    return {
      key, label, url,
      visible: e.visible !== false,
      icon: safeIcon(e.icon, 'fa-graduation-cap'),
      iconColor: safeColor(e.iconColor, '#C81240'),
      columns,
    };
  });
  return { exams };
}

/* ── PUBLIC: current nav menu (null until an admin saves one) ── */
router.get('/nav-menu', async (req, res, next) => {
  try {
    const r = await query(`SELECT value, updated_at FROM site_settings WHERE key = 'nav_menu'`);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(r.rows.length ? { menu: r.rows[0].value, updated_at: r.rows[0].updated_at } : { menu: null });
  } catch (err) { next(err); }
});

/* ── ADMIN: replace the nav menu ── */
router.put('/nav-menu', protect, async (req, res, next) => {
  let menu;
  try { menu = cleanMenu(req.body && req.body.menu); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    const r = await query(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('nav_menu', $1, NOW(), $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
       RETURNING value, updated_at`,
      [JSON.stringify(menu), (req.admin && req.admin.email) || null]
    );
    res.json({ menu: r.rows[0].value, updated_at: r.rows[0].updated_at });
  } catch (err) { next(err); }
});

/* ── ADMIN: go back to the built-in menu on every page ── */
router.delete('/nav-menu', protect, async (req, res, next) => {
  try {
    await query(`DELETE FROM site_settings WHERE key = 'nav_menu'`);
    res.json({ menu: null });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.cleanMenu = cleanMenu;

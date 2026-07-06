/* ============================================================
   routes/free-resources.js
   Admin: upload PDFs to R2, manage free resources
   Public: fetch visible resources (auth required on frontend)
   ============================================================ */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');
const { query }      = require('../config/db');
const { protect }    = require('../middleware/auth');
const { protectLearner } = require('../middleware/learnerAuth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ── POST /api/free-resources  (admin upload) ── */
router.post('/', protect, upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const key = `resources/${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;

    await r2.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        req.file.buffer,
      ContentType: 'application/pdf',
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `INSERT INTO free_resources (title, description, pdf_url, r2_key, visible)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
      [title, description || null, publicUrl, key]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources  (learner - requires login) ── */
router.get('/', protectLearner, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, description, pdf_url, created_at
       FROM free_resources WHERE visible = TRUE ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources/admin  (admin list) ── */
router.get('/admin', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM free_resources ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── PATCH /api/free-resources/:id  (toggle visible) ── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const { visible } = req.body;
    const result = await query(
      `UPDATE free_resources SET visible = $1 WHERE id = $2 RETURNING *`,
      [visible, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── DELETE /api/free-resources/:id  (admin delete) ── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM free_resources WHERE id = $1 RETURNING r2_key`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: result.rows[0].r2_key }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;

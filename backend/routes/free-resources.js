/* ============================================================
   routes/free-resources.js
   Admin: upload PDFs to R2, manage free resources
   Public: fetch visible resources (auth required on frontend)
   ============================================================ */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');
const { r2, BUCKET } = require('../config/r2');
const { query }      = require('../config/db');
const { protect }    = require('../middleware/auth');
const { protectLearner } = require('../middleware/learnerAuth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ── POST /api/free-resources  (admin upload) ── */
router.post('/', protect, upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { title, description, gating_type } = req.body;
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
      `INSERT INTO free_resources (title, description, pdf_url, r2_key, visible, gating_type)
       VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING *`,
      [title, description || null, publicUrl, key, gating_type || null]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /api/free-resources/rpsc-verify  (learner - verify RPSC AE application) ── */
router.post('/rpsc-verify', protectLearner, async (req, res, next) => {
  try {
    const learner = req.learner;
    const { application_number, roll_no } = req.body;

    if (!application_number || !roll_no) {
      return res.status(400).json({ error: 'Application number and roll number are required.' });
    }

    const appNum = String(application_number).trim();
    if (!/^2024\d{8}$/.test(appNum)) {
      return res.status(400).json({ error: 'Invalid application number. It must be 12 digits starting with 2024.' });
    }

    const existing = await query(
      `SELECT id FROM rpsc_ae_verifications WHERE learner_id = $1`,
      [learner.id]
    );
    if (existing.rows.length) {
      return res.json({ ok: true });
    }

    const claimed = await query(
      `SELECT learner_id FROM rpsc_ae_verifications WHERE application_number = $1`,
      [appNum]
    );
    if (claimed.rows.length) {
      return res.status(409).json({ error: 'This application number is already linked to another account. Contact support if this is your number.' });
    }

    await query(
      `INSERT INTO rpsc_ae_verifications (learner_id, application_number, roll_no) VALUES ($1, $2, $3)`,
      [learner.id, appNum, String(roll_no).trim()]
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources/rpsc-verify-status  (learner - check if verified) ── */
router.get('/rpsc-verify-status', protectLearner, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id FROM rpsc_ae_verifications WHERE learner_id = $1`,
      [req.learner.id]
    );
    res.json({ verified: result.rows.length > 0 });
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources  (learner - requires login) ── */
router.get('/', protectLearner, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, description, gating_type, created_at
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

/* ── GET /api/free-resources/:id/view  (learner - proxy stream, no URL exposed) ── */
router.get('/:id/view', protectLearner, async (req, res, next) => {
  try {
    const learner = req.learner;
    const result = await query(
      `SELECT r2_key, gating_type FROM free_resources WHERE id = $1 AND visible = TRUE`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Resource not found.' });

    const { r2_key, gating_type } = result.rows[0];

    if (gating_type === 'rpsc_ae') {
      const vResult = await query(
        `SELECT id FROM rpsc_ae_verifications WHERE learner_id = $1`,
        [learner.id]
      );
      if (!vResult.rows.length) {
        return res.status(403).json({ error: 'RPSC_AE_VERIFY_REQUIRED' });
      }
    }

    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: r2_key }));
    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const original = Buffer.concat(chunks);

    let pdfDoc;
    try { pdfDoc = await PDFDocument.load(original); }
    catch (e) { return res.status(422).json({ error: 'This file could not be opened for viewing.' }); }

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const stamp = `${learner.name || learner.email} · ${learner.email} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const fontSize = 11;
    const textWidth = font.widthOfTextAtSize(stamp, fontSize);
    pdfDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      for (let row = 0; row < height + 400; row += 160) {
        for (let col = -textWidth; col < width + textWidth; col += textWidth + 60) {
          page.drawText(stamp, { x: col, y: row, size: fontSize, font, color: rgb(0.55, 0.1, 0.1), opacity: 0.15, rotate: degrees(30) });
        }
      }
    });
    const watermarked = await pdfDoc.save();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resource.pdf"',
      'Cache-Control': 'no-store, private',
      'Content-Length': watermarked.length,
    });
    res.send(Buffer.from(watermarked));
  } catch (err) { next(err); }
});

/* ── PATCH /api/free-resources/:id  (toggle visible / update gating_type) ── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const fields = [];
    const vals = [];
    if (req.body.visible !== undefined) { fields.push(`visible = $${fields.length + 1}`); vals.push(req.body.visible); }
    if (req.body.gating_type !== undefined) { fields.push(`gating_type = $${fields.length + 1}`); vals.push(req.body.gating_type || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
    vals.push(req.params.id);
    const result = await query(
      `UPDATE free_resources SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
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

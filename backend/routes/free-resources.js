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
const { watermarkFromR2 } = require('../utils/pdfWatermark');
const { query }      = require('../config/db');
const { protect }    = require('../middleware/auth');
const { protectLearner } = require('../middleware/learnerAuth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

/* RPSC AE-gated PDFs open for a learner who verified their RPSC AE
   application, or who paid for an interview program (RPSC AE Interview
   Guidance) - those learners already proved candidacy at enrollment.
   Paid-order matching mirrors GET /api/enrollment/my-enrollments. */
async function isRpscVerified(learner) {
  const v = await query(`SELECT 1 FROM rpsc_ae_verifications WHERE learner_id = $1`, [learner.id]);
  if (v.rows.length) return true;
  const lr = await query('SELECT email, phone FROM learners WHERE id = $1', [learner.id]);
  const l = lr.rows[0] || { email: learner.email, phone: null };
  const paid = await query(
    `SELECT 1 FROM enrollments e
     JOIN programs p ON p.slug = e.program_slug
     WHERE p.category = 'interview' AND e.status = 'paid' AND e.refund_status != 'initiated'
       AND (e.learner_id = $1
            OR LOWER(TRIM(e.student_email)) = LOWER(TRIM($2))
            OR RIGHT(REGEXP_REPLACE(e.student_phone, '\\D', '', 'g'), 10) = $3)
     LIMIT 1`,
    [learner.id, l.email, l.phone]
  );
  return paid.rows.length > 0;
}

/* ── POST /api/free-resources  (admin upload) ── */
router.post('/', protect, upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { title, description, gating_type, category } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const safeName = req.file.originalname
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._\-]/g, '_');
    const key = `resources/${Date.now()}-${safeName}`;

    await r2.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        req.file.buffer,
      ContentType: 'application/pdf',
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    const result = await query(
      `INSERT INTO free_resources (title, description, pdf_url, r2_key, visible, gating_type, category)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6) RETURNING *`,
      [title, description || null, publicUrl, key, gating_type || null, category || null]
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
    res.json({ verified: await isRpscVerified(req.learner) });
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources  (learner - requires login) ── */
router.get('/', protectLearner, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, description, gating_type, category, created_at
       FROM free_resources WHERE visible = TRUE ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── GET /api/free-resources/rpsc-verifications  (admin - RPSC AE verified learners) ── */
router.get('/rpsc-verifications', protect, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT v.id, v.application_number, v.roll_no, v.verified_at,
              l.id AS learner_id, l.name, l.email, l.phone
       FROM rpsc_ae_verifications v
       JOIN learners l ON l.id = v.learner_id
       ORDER BY v.verified_at DESC`
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
      if (!(await isRpscVerified(learner))) {
        return res.status(403).json({ error: 'RPSC_AE_VERIFY_REQUIRED' });
      }
    }

    const stamp = `${learner.name || learner.email} · ${learner.email} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const watermarked = await watermarkFromR2(r2_key, stamp);
    if (!watermarked) return res.status(422).json({ error: 'This file could not be opened for viewing.' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resource.pdf"',
      'Cache-Control': 'no-store, private',
      'Content-Length': watermarked.length,
    });
    res.send(watermarked);
  } catch (err) { next(err); }
});

/* ── PATCH /api/free-resources/:id  (toggle visible / update gating_type) ── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const fields = [];
    const vals = [];
    if (req.body.visible !== undefined) { fields.push(`visible = $${fields.length + 1}`); vals.push(req.body.visible); }
    if (req.body.gating_type !== undefined) { fields.push(`gating_type = $${fields.length + 1}`); vals.push(req.body.gating_type || null); }
    if (req.body.category !== undefined) { fields.push(`category = $${fields.length + 1}`); vals.push(req.body.category || null); }
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

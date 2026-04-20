/* ============================================================
   controllers/testimonialsController.js — Student Testimonials
   Dr. Jaspal Singh Website — jaspalsingh.in

   Phase 4: Cloudinary image upload integrated for student photos.
   req.file is set by uploadImage.single('photo') middleware in the route.
   ============================================================ */

const { query }  = require('../config/db');
const cloudinary = require('../config/cloudinary');

/* ── Helper: safely delete a Cloudinary image ───────────────── */
const destroyImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.warn(`⚠️  Could not delete Cloudinary image "${publicId}":`, err.message);
  }
};

/* ── PUBLIC ─────────────────────────────────────────────────── */

/* GET /api/testimonials
   Query: exam_type (ESE | GATE | SSC JE | State AE | State JE | General), featured
*/
const getAll = async (req, res, next) => {
  try {
    const { exam_type, featured } = req.query;

    let conditions = ['is_visible = TRUE'];
    let params     = [];
    let idx        = 1;

    if (exam_type && exam_type !== 'all') {
      conditions.push(`exam_type = $${idx++}`);
      params.push(exam_type);
    }
    if (featured === 'true') {
      conditions.push(`is_featured = TRUE`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(
      `SELECT id, student_name, exam_type, exam_year,
              rank_or_result, quote, photo_url, is_featured, created_at
       FROM testimonials ${where}
       ORDER BY is_featured DESC, created_at DESC`,
      params
    );

    res.json({ total: result.rowCount, testimonials: result.rows });
  } catch (err) {
    next(err);
  }
};

/* ── ADMIN ONLY ─────────────────────────────────────────────── */

/* GET /api/testimonials/admin/all */
const adminGetAll = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM testimonials ORDER BY created_at DESC`
    );
    res.json({ total: result.rowCount, testimonials: result.rows });
  } catch (err) {
    next(err);
  }
};

/* POST /api/testimonials — add testimonial
   Student photo uploaded via uploadImage.single('photo') middleware.
*/
const create = async (req, res, next) => {
  try {
    const {
      student_name, exam_type, exam_year,
      rank_or_result, quote,
      is_visible, is_featured,
    } = req.body;

    if (!student_name || !exam_type || !quote) {
      if (req.file) await destroyImage(req.file.filename);
      return res.status(400).json({
        error: 'student_name, exam_type and quote are required.',
      });
    }

    /* Photo — prefer uploaded file over manual URL */
    let photo_url       = req.body.photo_url       || null;
    let photo_public_id = req.body.photo_public_id || null;

    if (req.file) {
      photo_url       = req.file.path;
      photo_public_id = req.file.filename;
    }

    const result = await query(
      `INSERT INTO testimonials
         (student_name, exam_type, exam_year, rank_or_result,
          quote, photo_url, photo_public_id, is_visible, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        student_name.trim(), exam_type, exam_year || null,
        rank_or_result || null, quote.trim(),
        photo_url, photo_public_id,
        is_visible !== undefined
          ? (is_visible === 'true' || is_visible === true)
          : true,
        is_featured === 'true' || is_featured === true || false,
      ]
    );

    res.status(201).json({ testimonial: result.rows[0] });
  } catch (err) {
    if (req.file) await destroyImage(req.file.filename);
    next(err);
  }
};

/* PUT /api/testimonials/:id
   If new photo uploaded, old one is deleted from Cloudinary.
*/
const update = async (req, res, next) => {
  try {
    const current = await query(
      'SELECT photo_public_id FROM testimonials WHERE id = $1',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      if (req.file) await destroyImage(req.file.filename);
      return res.status(404).json({ error: 'Testimonial not found.' });
    }

    const {
      student_name, exam_type, exam_year, rank_or_result,
      quote, is_visible, is_featured,
    } = req.body;

    let photo_url       = req.body.photo_url       || null;
    let photo_public_id = req.body.photo_public_id || null;

    if (req.file) {
      await destroyImage(current.rows[0].photo_public_id);
      photo_url       = req.file.path;
      photo_public_id = req.file.filename;
    }

    const result = await query(
      `UPDATE testimonials SET
         student_name    = COALESCE($1, student_name),
         exam_type       = COALESCE($2, exam_type),
         exam_year       = COALESCE($3, exam_year),
         rank_or_result  = COALESCE($4, rank_or_result),
         quote           = COALESCE($5, quote),
         photo_url       = COALESCE($6, photo_url),
         photo_public_id = COALESCE($7, photo_public_id),
         is_visible      = COALESCE($8, is_visible),
         is_featured     = COALESCE($9, is_featured)
       WHERE id = $10
       RETURNING *`,
      [
        student_name || null, exam_type || null, exam_year || null,
        rank_or_result || null, quote || null,
        photo_url, photo_public_id,
        is_visible !== undefined
          ? (is_visible === 'true' || is_visible === true)
          : null,
        is_featured !== undefined
          ? (is_featured === 'true' || is_featured === true)
          : null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found.' });
    }
    res.json({ testimonial: result.rows[0] });
  } catch (err) {
    if (req.file) await destroyImage(req.file.filename);
    next(err);
  }
};

/* DELETE /api/testimonials/:id — also removes photo from Cloudinary */
const remove = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM testimonials WHERE id = $1 RETURNING id, student_name, photo_public_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found.' });
    }
    destroyImage(result.rows[0].photo_public_id);
    res.json({
      message: 'Testimonial deleted.',
      testimonial: { id: result.rows[0].id, student_name: result.rows[0].student_name },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, adminGetAll, create, update, remove };

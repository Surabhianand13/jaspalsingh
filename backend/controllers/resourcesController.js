/* ============================================================
   controllers/resourcesController.js — Study Resources
   Dr. Jaspal Singh Website — jaspalsingh.in

   Phase 4: Cloudinary file upload integrated.
   - create: reads file from req.file (multer) OR req.body.file_url
   - update: if new file uploaded, deletes old from Cloudinary first
   - remove: deletes file from Cloudinary before DB removal
   ============================================================ */

const { query }   = require('../config/db');
const cloudinary  = require('../config/cloudinary');

/* ── Helper: safely delete an asset from Cloudinary ─────────── */
const destroyCloudinaryAsset = async (publicId, resourceType = 'raw') => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`⚠️  Could not delete Cloudinary asset "${publicId}":`, err.message);
  }
};

/* ── PUBLIC ─────────────────────────────────────────────────── */

/* GET /api/resources
   Query params: subject, type, exam, search, limit, offset
*/
const getAll = async (req, res, next) => {
  try {
    const { subject, type, exam, search, limit = 50, offset = 0 } = req.query;

    let conditions = ['is_visible = TRUE'];
    let params     = [];
    let idx        = 1;

    if (subject && subject !== 'all') {
      conditions.push(`subject = $${idx++}`);
      params.push(subject);
    }
    if (type && type !== 'all') {
      conditions.push(`resource_type = $${idx++}`);
      params.push(type);
    }
    if (exam && exam !== 'all') {
      conditions.push(`exam_tag = $${idx++}`);
      params.push(exam);
    }
    if (search) {
      /* Clamp search to 200 chars to prevent slow LIKE scans on huge inputs */
      const safeSearch = search.slice(0, 200);
      conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${safeSearch}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM resources ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));
    const result = await query(
      `SELECT id, title, subject, resource_type, exam_tag, description,
              file_url, file_size, download_count, created_at
       FROM resources ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    res.json({ total, resources: result.rows });
  } catch (err) {
    next(err);
  }
};

/* GET /api/resources/:id */
const getOne = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, subject, resource_type, exam_tag, description,
              file_url, file_size, download_count, created_at
       FROM resources WHERE id = $1 AND is_visible = TRUE`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }
    res.json({ resource: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/* POST /api/resources/download/:id
   Increments download counter and returns a short-lived signed Cloudinary URL.
   Signed URLs bypass access restrictions — works for all files regardless of
   when they were uploaded or what access_mode they have.
*/
const download = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE resources
       SET download_count = download_count + 1
       WHERE id = $1 AND is_visible = TRUE
       RETURNING id, title, file_url, file_public_id, download_count`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const resourceId = result.rows[0].id;
    const learnerId  = req.learner ? req.learner.id : null;

    /* Build a signed URL that expires in 15 minutes.
       This bypasses any access_mode restriction on the Cloudinary asset. */
    let file_url = result.rows[0].file_url;
    const publicId = result.rows[0].file_public_id;
    if (publicId) {
      try {
        file_url = cloudinary.url(publicId, {
          resource_type: 'raw',
          sign_url:      true,
          secure:        true,
          expires_at:    Math.floor(Date.now() / 1000) + 900, // 15 min
        });
      } catch (e) {
        console.warn('[resources] Could not generate signed URL, using stored URL:', e.message);
      }
    }

    /* Log to download_events (time-series analytics — fire and forget) */
    query(
      'INSERT INTO download_events (resource_id, learner_id) VALUES ($1, $2)',
      [resourceId, learnerId]
    ).catch(err => console.warn('[resources] download_events log failed:', err.message));

    /* Log to learner_downloads if a learner JWT is attached (personal history) */
    if (learnerId) {
      query(
        `INSERT INTO learner_downloads (learner_id, resource_id)
         VALUES ($1, $2)
         ON CONFLICT (learner_id, resource_id) DO UPDATE SET downloaded_at = NOW()`,
        [learnerId, resourceId]
      ).catch(err => console.warn('[resources] learner download log failed:', err.message));
    }

    res.json({ resource: { ...result.rows[0], file_url } });
  } catch (err) {
    next(err);
  }
};

/* ── ADMIN ONLY ─────────────────────────────────────────────── */

/* GET /api/resources/admin/all — all resources including hidden */
const adminGetAll = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM resources ORDER BY created_at DESC`
    );
    res.json({ total: result.rowCount, resources: result.rows });
  } catch (err) {
    next(err);
  }
};

/* POST /api/resources — create new resource
   Accepts multipart/form-data when a PDF file is uploaded via multer.
   req.file is set by uploadPDF.single('file') middleware in the route.
*/
const create = async (req, res, next) => {
  try {
    const {
      title, subject, resource_type, exam_tag,
      description, is_visible,
    } = req.body;

    if (!title || !subject || !resource_type || !exam_tag) {
      /* If multer already uploaded a file but validation fails, clean it up */
      if (req.file) {
        await destroyCloudinaryAsset(req.file.filename, 'raw');
      }
      return res.status(400).json({
        error: 'title, subject, resource_type and exam_tag are required.',
      });
    }

    /* File URL — prefer uploaded file over manual URL in body */
    let file_url       = req.body.file_url       || null;
    let file_public_id = req.body.file_public_id || null;
    let file_size      = req.body.file_size       || null;

    if (req.file) {
      file_url       = req.file.path;      // Cloudinary secure URL
      file_public_id = req.file.filename;  // Cloudinary public_id (for deletion)
      file_size      = req.file.size;      // bytes
    }

    const result = await query(
      `INSERT INTO resources
         (title, subject, resource_type, exam_tag, description,
          file_url, file_public_id, file_size, is_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        title.trim(), subject, resource_type, exam_tag,
        description || null,
        file_url, file_public_id,
        file_size ? parseInt(file_size, 10) : null,
        is_visible !== undefined ? (is_visible === 'true' || is_visible === true) : true,
      ]
    );

    res.status(201).json({ resource: result.rows[0] });
  } catch (err) {
    /* Clean up uploaded file on any DB error */
    if (req.file) await destroyCloudinaryAsset(req.file.filename, 'raw');
    next(err);
  }
};

/* PUT /api/resources/:id — update resource
   If a new file is uploaded, deletes the old Cloudinary asset first.
*/
const update = async (req, res, next) => {
  try {
    /* Fetch current record to get old public_id */
    const current = await query(
      'SELECT file_public_id FROM resources WHERE id = $1',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      if (req.file) await destroyCloudinaryAsset(req.file.filename, 'raw');
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const {
      title, subject, resource_type, exam_tag,
      description, is_visible,
    } = req.body;

    let file_url       = req.body.file_url       || null;
    let file_public_id = req.body.file_public_id || null;
    let file_size      = req.body.file_size       || null;

    if (req.file) {
      /* Delete old Cloudinary asset before replacing */
      await destroyCloudinaryAsset(current.rows[0].file_public_id, 'raw');
      file_url       = req.file.path;
      file_public_id = req.file.filename;
      file_size      = req.file.size;
    }

    const result = await query(
      `UPDATE resources SET
         title          = COALESCE($1, title),
         subject        = COALESCE($2, subject),
         resource_type  = COALESCE($3, resource_type),
         exam_tag       = COALESCE($4, exam_tag),
         description    = COALESCE($5, description),
         file_url       = COALESCE($6, file_url),
         file_public_id = COALESCE($7, file_public_id),
         file_size      = COALESCE($8, file_size),
         is_visible     = COALESCE($9, is_visible)
       WHERE id = $10
       RETURNING *`,
      [
        title || null, subject || null, resource_type || null,
        exam_tag || null, description || null,
        file_url, file_public_id,
        file_size ? parseInt(file_size, 10) : null,
        is_visible !== undefined
          ? (is_visible === 'true' || is_visible === true)
          : null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }
    res.json({ resource: result.rows[0] });
  } catch (err) {
    if (req.file) await destroyCloudinaryAsset(req.file.filename, 'raw');
    next(err);
  }
};

/* DELETE /api/resources/:id
   Also removes the file from Cloudinary if a public_id is stored.
*/
const remove = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM resources WHERE id = $1 RETURNING id, title, file_public_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    /* Async cleanup — don't wait, don't fail the response */
    destroyCloudinaryAsset(result.rows[0].file_public_id, 'raw');

    res.json({ message: 'Resource deleted.', resource: { id: result.rows[0].id, title: result.rows[0].title } });
  } catch (err) {
    next(err);
  }
};

/* GET /api/resources/admin/analytics — top downloaded resources */
const analytics = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, subject, resource_type, exam_tag,
              download_count, is_visible, created_at
       FROM resources
       ORDER BY download_count DESC
       LIMIT 20`
    );
    const totalDownloads = await query(
      'SELECT SUM(download_count) AS total FROM resources'
    );
    res.json({
      top_resources:   result.rows,
      total_downloads: parseInt(totalDownloads.rows[0].total || 0, 10),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, download, adminGetAll, create, update, remove, analytics };

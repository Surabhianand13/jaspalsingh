/* ============================================================
   controllers/blogController.js — Blog Posts
   Dr. Jaspal Singh Website — jaspalsingh.in

   Phase 4: Cloudinary image upload integrated for cover images.
   req.file is set by uploadImage.single('cover_image') in the route.
   ============================================================ */

const { query }  = require('../config/db');
const slugify    = require('slugify');
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

/* GET /api/blog
   Query: category, search, limit, offset
*/
const getAll = async (req, res, next) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;

    let conditions = ['is_published = TRUE'];
    let params     = [];
    let idx        = 1;

    if (category && category !== 'all') {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(title ILIKE $${idx} OR excerpt ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query(`SELECT COUNT(*) FROM blog_posts ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));

    const result = await query(
      `SELECT id, title, slug, excerpt, category,
              cover_image_url, published_at, created_at
       FROM blog_posts ${where}
       ORDER BY COALESCE(published_at, created_at) DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    res.json({ total, posts: result.rows });
  } catch (err) {
    next(err);
  }
};

/* GET /api/blog/:slug */
const getOne = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, slug, content, excerpt, category,
              cover_image_url, published_at, created_at
       FROM blog_posts
       WHERE slug = $1 AND is_published = TRUE`,
      [req.params.slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    res.json({ post: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/* ── ADMIN ONLY ─────────────────────────────────────────────── */

/* GET /api/blog/admin/all — all posts including drafts */
const adminGetAll = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, slug, category, cover_image_url,
              is_published, published_at, created_at
       FROM blog_posts ORDER BY created_at DESC`
    );
    res.json({ total: result.rowCount, posts: result.rows });
  } catch (err) {
    next(err);
  }
};

/* POST /api/blog — create post
   Cover image uploaded via uploadImage.single('cover_image') middleware.
*/
const create = async (req, res, next) => {
  try {
    const {
      title, content, excerpt, category, is_published,
    } = req.body;

    if (!title || !content || !category) {
      if (req.file) await destroyImage(req.file.filename);
      return res.status(400).json({ error: 'title, content and category are required.' });
    }

    /* Generate unique slug */
    let slug = slugify(title, { lower: true, strict: true });
    const existing = await query('SELECT id FROM blog_posts WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    /* Cover image — prefer uploaded file over manual URL */
    let cover_image_url       = req.body.cover_image_url       || null;
    let cover_image_public_id = req.body.cover_image_public_id || null;

    if (req.file) {
      cover_image_url       = req.file.path;
      cover_image_public_id = req.file.filename;
    }

    const pub = is_published === 'true' || is_published === true;
    const publishedAt = pub ? new Date() : null;

    const result = await query(
      `INSERT INTO blog_posts
         (title, slug, content, excerpt, category,
          cover_image_url, cover_image_public_id, is_published, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        title.trim(), slug, content, excerpt || null, category,
        cover_image_url, cover_image_public_id,
        pub, publishedAt,
      ]
    );

    res.status(201).json({ post: result.rows[0] });
  } catch (err) {
    if (req.file) await destroyImage(req.file.filename);
    next(err);
  }
};

/* PUT /api/blog/:id — update post
   If new cover image uploaded, old one is deleted from Cloudinary.
*/
const update = async (req, res, next) => {
  try {
    const current = await query(
      'SELECT is_published, published_at, cover_image_public_id FROM blog_posts WHERE id = $1',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      if (req.file) await destroyImage(req.file.filename);
      return res.status(404).json({ error: 'Post not found.' });
    }

    const {
      title, content, excerpt, category, is_published,
    } = req.body;

    /* Stamp published_at only when first publishing */
    let publishedAt;
    if (is_published === 'true' || is_published === true) {
      if (!current.rows[0].is_published) {
        publishedAt = new Date();
      }
    }

    let cover_image_url       = req.body.cover_image_url       || null;
    let cover_image_public_id = req.body.cover_image_public_id || null;

    if (req.file) {
      /* Delete old cover before replacing */
      await destroyImage(current.rows[0].cover_image_public_id);
      cover_image_url       = req.file.path;
      cover_image_public_id = req.file.filename;
    }

    const pub = is_published !== undefined
      ? (is_published === 'true' || is_published === true)
      : null;

    const result = await query(
      `UPDATE blog_posts SET
         title                  = COALESCE($1, title),
         content                = COALESCE($2, content),
         excerpt                = COALESCE($3, excerpt),
         category               = COALESCE($4, category),
         cover_image_url        = COALESCE($5, cover_image_url),
         cover_image_public_id  = COALESCE($6, cover_image_public_id),
         is_published           = COALESCE($7, is_published),
         published_at           = COALESCE($8, published_at)
       WHERE id = $9
       RETURNING *`,
      [
        title || null, content || null, excerpt || null,
        category || null,
        cover_image_url, cover_image_public_id,
        pub,
        publishedAt || null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    res.json({ post: result.rows[0] });
  } catch (err) {
    if (req.file) await destroyImage(req.file.filename);
    next(err);
  }
};

/* DELETE /api/blog/:id — also removes cover image from Cloudinary */
const remove = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM blog_posts WHERE id = $1 RETURNING id, title, cover_image_public_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    destroyImage(result.rows[0].cover_image_public_id);
    res.json({ message: 'Post deleted.', post: { id: result.rows[0].id, title: result.rows[0].title } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, adminGetAll, create, update, remove };

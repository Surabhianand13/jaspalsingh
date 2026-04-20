/* ============================================================
   routes/blog.js — Blog Post Routes

   PUBLIC:
     GET  /api/blog            — published posts (with category filter)
     GET  /api/blog/:slug      — single published post

   ADMIN (JWT required):
     GET  /api/blog/admin/all  — all posts including drafts
     POST /api/blog            — create post (with optional cover image upload)
     PUT  /api/blog/:id        — update post (with optional cover image upload)
     DEL  /api/blog/:id        — delete post (removes cover image from Cloudinary)
   ============================================================ */

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/blogController');
const { protect }              = require('../middleware/auth');
const { uploadImage, handleUploadError } = require('../middleware/upload');

/* Public */
router.get('/',                        ctrl.getAll);
router.get('/admin/all',  protect,     ctrl.adminGetAll);  // before /:slug

/* Admin — uploadImage.single('cover_image') handles optional cover photo */
router.post('/',
  protect,
  uploadImage.single('cover_image'),
  handleUploadError,
  ctrl.create
);

router.put('/:id',
  protect,
  uploadImage.single('cover_image'),
  handleUploadError,
  ctrl.update
);

router.delete('/:id', protect, ctrl.remove);

/* Public — must come after /admin/all */
router.get('/:slug', ctrl.getOne);

module.exports = router;

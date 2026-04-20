/* ============================================================
   routes/testimonials.js — Testimonials Routes

   PUBLIC:
     GET  /api/testimonials           — visible testimonials

   ADMIN (JWT required):
     GET  /api/testimonials/admin/all — all testimonials
     POST /api/testimonials           — create (with optional photo upload)
     PUT  /api/testimonials/:id       — update (with optional photo upload)
     DEL  /api/testimonials/:id       — delete (removes photo from Cloudinary)
   ============================================================ */

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/testimonialsController');
const { protect }              = require('../middleware/auth');
const { uploadImage, handleUploadError } = require('../middleware/upload');

router.get('/',                        ctrl.getAll);
router.get('/admin/all',  protect,     ctrl.adminGetAll);

/* Admin — uploadImage.single('photo') handles optional student photo */
router.post('/',
  protect,
  uploadImage.single('photo'),
  handleUploadError,
  ctrl.create
);

router.put('/:id',
  protect,
  uploadImage.single('photo'),
  handleUploadError,
  ctrl.update
);

router.delete('/:id', protect, ctrl.remove);

module.exports = router;

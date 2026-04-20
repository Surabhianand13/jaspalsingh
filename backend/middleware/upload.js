/* ============================================================
   middleware/upload.js — Multer + Cloudinary Storage
   Dr. Jaspal Singh Website — jaspalsingh.in

   Exports three ready-to-use multer instances:
     uploadPDF     — for study resources (PDFs, up to 50 MB)
     uploadImage   — for blog covers / testimonial photos (images, up to 5 MB)
     uploadProfile — for hero/header profile photo (image, up to 5 MB)

   Usage in a route:
     router.post('/api/resources', uploadPDF.single('file'), ctrl.create);
     router.post('/api/blog',      uploadImage.single('cover_image'), ctrl.create);
   ============================================================ */

const multer              = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary          = require('../config/cloudinary');

/* ── Cloudinary storage targets ─────────────────────────────── */

/* PDFs → raw resource type, stored in jaspalsingh/resources/ */
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'jaspalsingh/resources',
    resource_type: 'raw',
    format:        'pdf',
    public_id:     `resource_${Date.now()}`,
  }),
});

/* Images for blog covers / testimonial photos */
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'jaspalsingh/images',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1200, quality: 'auto', fetch_format: 'auto' },
    ],
    public_id: `img_${Date.now()}`,
  }),
});

/* Profile / hero photo */
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'jaspalsingh/profile',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
    ],
    public_id: `jaspal_profile_${Date.now()}`,
  }),
});

/* ── File-type guards ────────────────────────────────────────── */

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF files are allowed.'));
  }
};

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image files (JPG, PNG, WebP) are allowed.'));
  }
};

/* ── Multer instances ────────────────────────────────────────── */

const uploadPDF = multer({
  storage:    pdfStorage,
  limits:     { fileSize: 50 * 1024 * 1024 },  // 50 MB
  fileFilter: pdfFilter,
});

const uploadImage = multer({
  storage:    imageStorage,
  limits:     { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: imageFilter,
});

const uploadProfile = multer({
  storage:    profileStorage,
  limits:     { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: imageFilter,
});

/* ── Multer error handler (attach to route or global) ───────── */
/* Wrap in a route handler to catch multer-specific errors neatly */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message || 'File upload error.' });
  }
  next(err);
};

module.exports = { uploadPDF, uploadImage, uploadProfile, handleUploadError };

/* ============================================================
   routes/upload.js — General File Upload Routes
   Dr. Jaspal Singh Website — jaspalsingh.in

   ADMIN (JWT required):
     POST /api/upload/profile    — upload hero/profile photo
     POST /api/upload/image      — upload a generic image (banner, gallery)
     DELETE /api/upload          — delete any Cloudinary asset by public_id

   The response includes the Cloudinary URL and public_id.
   Store the public_id in your frontend config / .env to use for the
   hero photo at assets/images/jaspal-hero.png path.
   ============================================================ */

const express    = require('express');
const router     = express.Router();
const { protect }              = require('../middleware/auth');
const { uploadProfile, uploadImage, handleUploadError } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

/* POST /api/upload/profile
   Upload the Dr. Jaspal Singh hero / header photo.
   Field name: "photo"
*/
router.post('/profile',
  protect,
  uploadProfile.single('photo'),
  handleUploadError,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    res.json({
      message:   'Profile photo uploaded successfully.',
      url:       req.file.path,       // Cloudinary secure URL
      public_id: req.file.filename,   // For future deletion
    });
  }
);

/* POST /api/upload/image
   Upload any generic image (banner, gallery, etc.)
   Field name: "image"
*/
router.post('/image',
  protect,
  uploadImage.single('image'),
  handleUploadError,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    res.json({
      message:   'Image uploaded successfully.',
      url:       req.file.path,
      public_id: req.file.filename,
    });
  }
);

/* DELETE /api/upload
   Delete any Cloudinary asset by public_id.
   Body: { public_id, resource_type? }
   resource_type defaults to "image"; use "raw" for PDFs.
*/
router.delete('/',
  protect,
  async (req, res, next) => {
    try {
      const { public_id, resource_type = 'image' } = req.body;
      if (!public_id) {
        return res.status(400).json({ error: 'public_id is required.' });
      }
      const result = await cloudinary.uploader.destroy(public_id, { resource_type });
      res.json({ message: 'Asset deleted from Cloudinary.', result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

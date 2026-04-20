/* ============================================================
   routes/resources.js — Study Resources Routes

   PUBLIC:
     GET  /api/resources                   — list with filters
     GET  /api/resources/:id               — single resource
     POST /api/resources/download/:id      — increment counter + get URL

   ADMIN (JWT required):
     GET  /api/resources/admin/all         — all including hidden
     GET  /api/resources/admin/analytics   — top downloads
     POST /api/resources                   — create (with optional PDF upload)
     PUT  /api/resources/:id               — update (with optional PDF upload)
     DEL  /api/resources/:id               — delete (removes Cloudinary asset)
   ============================================================ */

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/resourcesController');
const { protect }           = require('../middleware/auth');
const { uploadPDF, handleUploadError } = require('../middleware/upload');
const { optionalLearner }   = require('../middleware/learnerAuth');

/* Public */
router.get('/',                          ctrl.getAll);
router.get('/admin/all',   protect,      ctrl.adminGetAll);    // must come before /:id
router.get('/admin/analytics', protect,  ctrl.analytics);
router.get('/:id',                       ctrl.getOne);
router.post('/download/:id', optionalLearner, ctrl.download);

/* Admin — uploadPDF.single('file') processes the PDF if one is attached */
router.post('/',
  protect,
  uploadPDF.single('file'),
  handleUploadError,
  ctrl.create
);

router.put('/:id',
  protect,
  uploadPDF.single('file'),
  handleUploadError,
  ctrl.update
);

router.delete('/:id', protect, ctrl.remove);

module.exports = router;

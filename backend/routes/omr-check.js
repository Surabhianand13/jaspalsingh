/* ============================================================
   routes/omr-check.js  -  OMR Test Checker (admin-only)

   All routes require an admin JWT (protect middleware). This is
   entirely separate from the existing /api/enrollment "omr-papers"/
   "omr-analysis" email-distribution routes.

     Templates:
       GET    /api/omr-check/templates
       GET    /api/omr-check/templates/:id
       POST   /api/omr-check/templates
       POST   /api/omr-check/templates/:id/reference-image
       PUT    /api/omr-check/templates/:id/calibration
       POST   /api/omr-check/templates/:id/calibration-preview
       DELETE /api/omr-check/templates/:id

     Tests:
       GET    /api/omr-check/tests
       GET    /api/omr-check/tests/:id
       POST   /api/omr-check/tests
       PUT    /api/omr-check/tests/:id
       PATCH  /api/omr-check/tests/:id/archive

     Submissions:
       POST   /api/omr-check/tests/:testId/submissions
       GET    /api/omr-check/tests/:testId/submissions
       GET    /api/omr-check/submissions/:id
       PUT    /api/omr-check/submissions/:id/review
       POST   /api/omr-check/submissions/:id/rerun-detection
       POST   /api/omr-check/submissions/:id/finalize
       DELETE /api/omr-check/submissions/:id
   ============================================================ */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/omrCheckController');
const { protect } = require('../middleware/auth');
const { uploadOmrPhoto, uploadOmrReference, handleUploadError } = require('../middleware/upload');

router.use(protect);

/* Templates */
router.get('/templates',      ctrl.listTemplates);
router.get('/templates/:id',  ctrl.getTemplate);
router.post('/templates',     ctrl.createTemplate);
router.post('/templates/:id/reference-image', uploadOmrReference.single('image'), handleUploadError, ctrl.uploadReferenceImage);
router.put('/templates/:id/calibration',      ctrl.saveCalibration);
router.post('/templates/:id/calibration-preview', ctrl.calibrationPreview);
router.delete('/templates/:id', ctrl.deleteTemplate);

/* Tests */
router.get('/tests',          ctrl.listTests);
router.get('/tests/:id',      ctrl.getTest);
router.post('/tests',         ctrl.createTest);
router.put('/tests/:id',      ctrl.updateTest);
router.patch('/tests/:id/archive', ctrl.archiveTest);

/* Submissions */
router.post('/tests/:testId/submissions', uploadOmrPhoto.single('photo'), handleUploadError, ctrl.uploadSubmission);
router.get('/tests/:testId/submissions',  ctrl.listSubmissions);
router.get('/submissions/:id',            ctrl.getSubmission);
router.put('/submissions/:id/review',     ctrl.reviewSubmission);
router.post('/submissions/:id/rerun-detection', ctrl.rerunDetection);
router.post('/submissions/:id/finalize',  ctrl.finalizeSubmission);
router.delete('/submissions/:id',         ctrl.deleteSubmission);

module.exports = router;

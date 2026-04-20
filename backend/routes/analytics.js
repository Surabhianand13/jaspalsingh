/* ============================================================
   routes/analytics.js — Analytics Routes
   Dr. Jaspal Singh Website — jaspalsingh.in

   PUBLIC:
     GET /api/analytics/public

   ADMIN PROTECTED:
     GET /api/analytics/downloads/trend
     GET /api/analytics/learners/trend
     GET /api/analytics/subjects
     GET /api/analytics/top-resources
   ============================================================ */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

/* Public */
router.get('/public',            ctrl.publicStats);

/* Admin protected */
router.get('/downloads/trend',   protect, ctrl.downloadsTrend);
router.get('/learners/trend',    protect, ctrl.learnersTrend);
router.get('/subjects',          protect, ctrl.subjectBreakdown);
router.get('/top-resources',     protect, ctrl.topResources);

module.exports = router;

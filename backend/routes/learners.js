/* ============================================================
   routes/learners.js  -  Learner Auth & Profile Routes

   PUBLIC:
     POST /api/learners/register
     POST /api/learners/login

   LEARNER PROTECTED:
     GET  /api/learners/me
     PUT  /api/learners/me
     GET  /api/learners/downloads

   ADMIN PROTECTED:
     GET   /api/learners/stats
     GET   /api/learners
     PATCH /api/learners/:id/email
   ============================================================ */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/learnersController');
const { protect }         = require('../middleware/auth');
const { protectLearner }  = require('../middleware/learnerAuth');
const rateLimit = require('express-rate-limit');

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many OTP requests. Please wait an hour before trying again.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

/* Public */
router.post('/send-otp',        otpLimiter,      ctrl.sendOtp);
router.post('/register',        registerLimiter, ctrl.register);
router.post('/login',           loginLimiter,    ctrl.login);
router.post('/forgot-password', loginLimiter,    ctrl.forgotPassword);
router.post('/reset-password',                   ctrl.resetPassword);

/* Learner protected */
router.get('/me',        protectLearner, ctrl.getMe);
router.put('/me',        protectLearner, ctrl.updateMe);
router.get('/downloads', protectLearner, ctrl.getMyDownloads);

/* Admin protected */
router.get('/stats',        protect, ctrl.adminStats);
router.get('/',             protect, ctrl.adminGetAll);
router.patch('/:id/email',  protect, ctrl.adminUpdateEmail);

module.exports = router;

/* ============================================================
   routes/auth.js — Authentication Routes
   POST /api/auth/login
   GET  /api/auth/me   (protected)
   ============================================================ */

const express = require('express');
const router  = express.Router();
const { login, getMe } = require('../controllers/authController');
const { protect }      = require('../middleware/auth');

router.post('/login', login);
router.get('/me',     protect, getMe);

module.exports = router;

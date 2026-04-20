/* ============================================================
   routes/contact.js — Contact Form Routes

   PUBLIC:
     POST /api/contact              — submit message

   ADMIN (JWT required):
     GET  /api/contact              — all messages
     PUT  /api/contact/:id/read     — mark as read
     DEL  /api/contact/:id          — delete message
   ============================================================ */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/contactController');
const { protect } = require('../middleware/auth');

router.post('/',              ctrl.submit);
router.get('/',     protect,  ctrl.getAll);
router.put('/:id/read', protect, ctrl.markRead);
router.delete('/:id', protect,   ctrl.remove);

module.exports = router;

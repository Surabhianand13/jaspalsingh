/* ============================================================
   routes/contact.js  -  Contact Form Routes

   PUBLIC:
     POST /api/contact               -  submit message

   ADMIN (JWT required):
     GET  /api/contact               -  all messages
     PUT  /api/contact/:id/read      -  mark as read
     DEL  /api/contact/:id           -  delete message
   ============================================================ */

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl      = require('../controllers/contactController');
const { protect } = require('../middleware/auth');

// Dedicated limiter - tighter than the blanket 500/15min apiLimiter,
// since this is a public form bots can hit directly without a UI.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many messages sent. Please try again later.' },
});

router.post('/',              submitLimiter, ctrl.submit);
router.get('/',     protect,  ctrl.getAll);
router.put('/:id/read', protect, ctrl.markRead);
router.delete('/:id', protect,   ctrl.remove);

module.exports = router;

/* ============================================================
   middleware/auth.js — JWT Authentication Middleware
   Protects admin-only routes.
   Usage: router.post('/route', protect, controller)
   ============================================================ */

const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  // Expect: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    /* Reject learner tokens from admin routes */
    if (decoded.learner) {
      return res.status(403).json({ error: 'Access denied. Admin token required.' });
    }
    req.admin = decoded; // { id, email, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = { protect };

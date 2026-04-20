/* ============================================================
   middleware/learnerAuth.js — Learner JWT Authentication
   Protects learner-only routes (profile, downloads).
   Sets req.learner = { id, email, name }
   ============================================================ */

const jwt = require('jsonwebtoken');

const protectLearner = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.learner) {
      return res.status(403).json({ error: 'Invalid token type.' });
    }
    req.learner = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/* Optional learner auth — attaches req.learner if token is valid, never blocks */
const optionalLearner = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.learner) req.learner = decoded;
  } catch (e) { /* ignore invalid tokens */ }
  next();
};

module.exports = { protectLearner, optionalLearner };

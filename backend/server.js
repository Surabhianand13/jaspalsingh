/* ============================================================
   server.js — Main Express Application
   Dr. Jaspal Singh Website — jaspalsingh.in
   ============================================================ */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const app = express();

/* ── Security Middleware ─────────────────────────────────── */

// Set secure HTTP headers
app.use(helmet());

// CORS — allow requests from the frontend origin(s)
// FRONTEND_URL can be a single origin or comma-separated list
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5500')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    callback(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ── Rate Limiting ───────────────────────────────────────── */

// General API limiter — 500 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for login — 20 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

/* ── Body Parsing ────────────────────────────────────────── */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── API Routes ──────────────────────────────────────────── */

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/resources',    require('./routes/resources'));
app.use('/api/blog',         require('./routes/blog'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/contact',      require('./routes/contact'));
app.use('/api/learners',     require('./routes/learners'));
app.use('/api/analytics',    require('./routes/analytics')); // Phase 7: Analytics
app.use('/api/upload',       require('./routes/upload'));    // Phase 4: Cloudinary uploads

/* ── Health Check ────────────────────────────────────────── */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'jaspalsingh.in API is running',
    timestamp: new Date().toISOString(),
  });
});

/* ── 404 Handler ─────────────────────────────────────────── */

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

/* ── Global Error Handler ────────────────────────────────── */

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : err.message;
  res.status(status).json({ error: message });
});

/* ── Async safety net ────────────────────────────────────── */

/* Catch any Promise rejection not handled by a route's .catch() / next(err).
   Logs and keeps the process alive in production rather than silently crashing. */
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  /* In production a process manager (PM2 / Railway) will restart.
     Exit so we don't run in an undefined state. */
  process.exit(1);
});

/* ── Start Server ────────────────────────────────────────── */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n✅ jaspalsingh.in API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;

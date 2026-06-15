/* ============================================================
   server.js  -  Main Express Application
   Dr. Jaspal Singh Website  -  jaspalsingh.in
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

// CORS  -  allow requests from the frontend origin(s)
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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ── Rate Limiting ───────────────────────────────────────── */

// General API limiter  -  500 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for login  -  20 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

/* ── Body Parsing ────────────────────────────────────────── */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Static Files ────────────────────────────────────────── */

// Serve banner/gallery images from the project-root images/ folder
app.use('/images', express.static(path.join(__dirname, '..', 'frontend', 'images')));

/* ── API Routes ──────────────────────────────────────────── */

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/resources',    require('./routes/resources'));
app.use('/api/blog',         require('./routes/blog'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/contact',      require('./routes/contact'));
app.use('/api/learners',     require('./routes/learners'));
app.use('/api/analytics',    require('./routes/analytics'));
app.use('/api/upload',       require('./routes/upload'));
app.use('/api/payment',      require('./routes/payment'));
app.use('/api/leads',        require('./routes/leads'));
app.use('/api/enrollment',   require('./routes/enrollment-account'));
app.use('/api/events',       require('./routes/events'));
app.use('/api/programs',      require('./routes/programs'));
app.use('/api/banners',       require('./routes/banners'));
app.use('/api/tally-webhook', require('./routes/tally-webhook'));
app.use('/api/tally-diploma', require('./routes/tally-diploma'));
app.use('/api/tally-degree',  require('./routes/tally-degree'));

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

/* ── Run DB migrations then start server ─────────────────── */

const { query } = require('./config/db');
const PORT = process.env.PORT || 5000;

async function migrate() {
  await query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(1000)`);

  await query(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id              SERIAL PRIMARY KEY,
      order_id        VARCHAR(100) UNIQUE NOT NULL,
      program_slug    VARCHAR(100) NOT NULL,
      program_name    VARCHAR(300) NOT NULL,
      amount          INTEGER NOT NULL,
      student_name    VARCHAR(255) NOT NULL,
      student_email   VARCHAR(255),
      student_phone   VARCHAR(20) NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      cf_payment_id   VARCHAR(100),
      coupon_code     VARCHAR(50),
      paid_at         TIMESTAMP WITH TIME ZONE,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS learner_id INTEGER`);
  await query(`ALTER TABLE learners ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await query(`ALTER TABLE learners ADD COLUMN IF NOT EXISTS photo_url VARCHAR(1000)`);

  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id            SERIAL PRIMARY KEY,
      program_slug  VARCHAR(100) NOT NULL,
      program_name  VARCHAR(300) NOT NULL,
      name          VARCHAR(255),
      email         VARCHAR(255),
      phone         VARCHAR(20) NOT NULL,
      source        VARCHAR(50) DEFAULT 'interest_form',
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'interest_form'`);
  /* unique index to dedup checkout abandons by phone+program */
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_program_uidx
    ON leads (phone, program_slug)
  `);

  /* ── Event tracking (captures every interaction) ── */
  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id          SERIAL PRIMARY KEY,
      type        VARCHAR(60)  NOT NULL,   -- page_view, whatsapp_click, call_click, enquiry_click, program_view, checkout_start, checkout_exit, payment_success, signup, etc.
      label       VARCHAR(200),            -- e.g. program slug, button location
      path        VARCHAR(300),            -- page path
      session_id  VARCHAR(80),             -- anonymous browser session
      learner_id  INTEGER,                 -- if logged in
      meta        JSONB,                   -- any extra payload
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`);

  /* ── Programs (DB-driven so admin can toggle live/coming-soon) ── */
  await query(`
    CREATE TABLE IF NOT EXISTS programs (
      id            SERIAL PRIMARY KEY,
      slug          VARCHAR(120) UNIQUE NOT NULL,
      title         VARCHAR(300) NOT NULL,
      category      VARCHAR(60)  NOT NULL DEFAULT 'test-series',  -- test-series | interview | course
      exam          VARCHAR(120),
      level         VARCHAR(120),
      status        VARCHAR(30)  NOT NULL DEFAULT 'enrolling',    -- enrolling | coming_soon | closed
      price         INTEGER,
      mrp           INTEGER,
      thumbnail_url VARCHAR(1000),
      accent        VARCHAR(40),                                  -- gradient/colour key
      tags          JSONB        DEFAULT '[]'::jsonb,
      short_desc    TEXT,
      detail_url    VARCHAR(300),
      is_visible    BOOLEAN      NOT NULL DEFAULT TRUE,
      sort_order    INTEGER      NOT NULL DEFAULT 0,
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_programs_visible ON programs(is_visible)`);

  /* ── Banners / promotional images ── */
  await query(`
    CREATE TABLE IF NOT EXISTS banners (
      id            SERIAL PRIMARY KEY,
      title         VARCHAR(200),
      image_url     VARCHAR(1000) NOT NULL,
      link_url      VARCHAR(300),
      placement     VARCHAR(40) NOT NULL DEFAULT 'home_carousel', -- home_carousel | promo_strip | programs_banner
      is_visible    BOOLEAN     NOT NULL DEFAULT TRUE,
      sort_order    INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  /* ── Rename crash course to remove dash before Offline (fixes ticker label) ── */
  await query(`
    UPDATE programs SET title = 'RSSB JEN 2026-27 Offline Crash Course'
    WHERE slug = 'rssb-jen-crash-course' AND title = 'RSSB JEN 2026-27 - Offline Crash Course'
  `);

  /* ── Seed programs once (only if table is empty) ── */
  const pCount = await query(`SELECT COUNT(*)::int AS n FROM programs`);
  if (pCount.rows[0].n === 0) {
    const seed = [
      ['rssb-jen-diploma-test-series','RSSB JE 2026 - Jaspal Sir Ki Test Series Offline','test-series','RSSB JE 2026','Diploma (Civil)','enrolling',3999,7999,'blue',1],
      ['rssb-jen-degree-test-series','RSSB JE 2026 - Jaspal Sir Ki Test Series Offline','test-series','RSSB JE 2026','Degree (Civil)','enrolling',3999,7999,'teal',2],
      ['rpsc-ae-interview','RPSC AE 2024 - Interview Guidance Programme','interview','RPSC AE 2024','Interview / Viva','enrolling',4999,8999,'purple',3],
      ['rssb-jen-crash-course','RSSB JEN 2026-27 Offline Crash Course','course','RSSB JEN 2026-27','Crash Course','coming_soon',null,null,'orange',4],
      ['gate-ese-foundation','GATE / ESE 2028 - Offline Foundation Course','course','GATE / ESE 2028','Degree (Civil)','coming_soon',null,null,'green',5],
    ];
    for (const p of seed) {
      await query(
        `INSERT INTO programs (slug,title,category,exam,level,status,price,mrp,accent,sort_order,detail_url,is_visible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE) ON CONFLICT (slug) DO NOTHING`,
        [p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],p[9],'/programs/'+p[0]+'/']
      );
    }
    console.log('✅ Seeded 5 programs');
  }

  await query(`ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);

  // Rename both test series programs to unified name and update pricing
  await query(`UPDATE programs SET title='RSSB JE 2026 - Jaspal Sir Ki Test Series Offline', exam='RSSB JE 2026', price=3999, mrp=7999 WHERE slug IN ('rssb-jen-diploma-test-series','rssb-jen-degree-test-series')`);

  console.log('✅ Migration: enrollments, leads, events, programs, banners ensured');
}

migrate()
  .catch(err => console.warn('⚠️  Migration warning:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n✅ jaspalsingh.in API running on port ${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
    });
  });

module.exports = app;

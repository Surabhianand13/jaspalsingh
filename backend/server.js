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
const { protect } = require('./middleware/auth');

const app = express();

// Render (and most cloud hosts) sit behind a proxy - trust the first hop
app.set('trust proxy', 1);

/* ── Security Middleware ─────────────────────────────────── */

// Set secure HTTP headers
app.use(helmet());

// CORS  -  allow requests from the frontend origin(s)
// FRONTEND_URL can be a single origin or comma-separated list
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5500')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no Origin header - these are server-to-server calls
    // (Tally webhooks, Cashfree webhooks, etc.) which never send an Origin.
    // Webhook endpoints have their own validation (form_token, HMAC signature).
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

/* ── Razorpay Webhook - must be registered BEFORE express.json() ────
   express.json() consumes the raw body, making HMAC signature
   verification impossible. The route itself uses express.raw() to
   capture the raw bytes Razorpay signs. ── */
app.use('/api/payment/webhook', require('express').raw({ type: 'application/json' }),
  require('./routes/payment-webhook'));

/* ── Tally Webhooks - must also be registered BEFORE express.json() ──
   Same reasoning as Razorpay above: verifyTallySignature needs the raw
   bytes to compute the HMAC, then re-parses req.body as JSON itself. ── */
const { verifyTallySignature } = require('./middleware/tallyAuth');
const tallyRaw = require('express').raw({ type: 'application/json', limit: '10mb' });
// These routes sit before apiLimiter is app.use()'d on '/api' below, so
// apply it explicitly here to keep the same protection they had before.
app.use('/api/tally-webhook',      apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-webhook'));
app.use('/api/tally-diploma',      apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-diploma'));
app.use('/api/tally-degree',       apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-degree'));
app.use('/api/tally-omr-degree',   apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-omr-degree'));
app.use('/api/tally-omr-diploma',  apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-omr-diploma'));
app.use('/api/tally-combo-offline', apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-combo-offline'));
app.use('/api/tally-combo-omr',     apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-combo-omr'));
app.use('/api/tally-ese-paper1',        apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-paper1'));
app.use('/api/tally-ese-paper2',        apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-paper2'));
app.use('/api/tally-ese-combined',      apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-combined'));
app.use('/api/tally-ese-paper1-omr',    apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-paper1-omr'));
app.use('/api/tally-ese-paper2-omr',    apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-paper2-omr'));
app.use('/api/tally-ese-combined-omr',  apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-ese-combined-omr'));
// Generic webhook for programs launched entirely from admin (Phase 6 - hybrid
// launch). Existing 13 programs keep using their bespoke routes above; this
// only activates for a program whose `launch_config` column is set.
app.use('/api/tally-generic/:programSlug', apiLimiter, tallyRaw, verifyTallySignature, require('./routes/tally-generic'));

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
app.use('/api/admit-cards',  require('./routes/admit-card-review'));
app.use('/api/events',       require('./routes/events'));
app.use('/api/programs',      require('./routes/programs'));
app.use('/api/banners',       require('./routes/banners'));
app.use('/api/cbt',           require('./routes/cbt'));
/* Tally webhook routes are registered above (before express.json()) so
   verifyTallySignature can see the raw body - do not re-register here. */
app.use('/api/omr-check',        require('./routes/omr-check'));
app.use('/api/schedule',         require('./routes/learner-schedule'));
app.use('/api/free-resources',   require('./routes/free-resources'));
app.use('/api/coupons',          require('./routes/coupons'));
app.use('/api/homepage-content', require('./routes/homepage-content'));

/* ── Health Check ────────────────────────────────────────── */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'jaspalsingh.in API is running',
    timestamp: new Date().toISOString(),
  });
});

/* ── Gmail test endpoint (admin only) ────────────────────────
   GET /api/test-gmail  -  Authorization: Bearer <admin JWT>
   Sends one test email and returns success or exact error.     */
app.get('/api/test-gmail', protect, async (req, res) => {
  const { transporter, isConfigured } = require('./config/mailer');
  if (!isConfigured) return res.json({ configured: false, GMAIL_USER: !!process.env.GMAIL_USER, GMAIL_APP_PASSWORD: !!process.env.GMAIL_APP_PASSWORD });
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'jaspalsingh.pec@gmail.com',
      subject: 'Gmail test from jaspalsingh.in',
      text: 'If you see this, Gmail SMTP is working correctly.',
    });
    res.json({ success: true, from: process.env.GMAIL_USER });
  } catch (err) {
    res.json({ success: false, error: err.message, code: err.code });
  }
});

/* ── One-time backfill: admin payment notifications (admin only) ──
   GET /api/backfill-notifications  -  Authorization: Bearer <admin JWT>
   Remove this route once no longer needed.                        */
app.get('/api/backfill-notifications', protect, async (req, res) => {
  const { transporter, isConfigured } = require('./config/mailer');
  if (!isConfigured) {
    return res.status(500).json({ error: 'Gmail not configured - set GMAIL_USER and GMAIL_APP_PASSWORD in Render env vars' });
  }
  try {
    const { query } = require('./config/db');
    const result = await query(`SELECT * FROM enrollments WHERE status = 'paid' ORDER BY paid_at ASC`);
    const enrollments = result.rows;

    // Respond immediately so the request doesn't time out
    res.json({ message: 'Backfill started', total: enrollments.length });

    // Process in background
    let sent = 0, failed = 0;
    for (const enrollment of enrollments) {
      try {
        const paid = new Date(enrollment.paid_at || enrollment.created_at || Date.now())
          .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const slug = enrollment.program_slug || '';
        const tier = slug.includes('degree') ? 'Degree' : slug.includes('diploma') ? 'Diploma' : '';
        const programLabel = tier ? `${enrollment.program_name} [${tier}]` : enrollment.program_name;
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to:   'jaspalsingh.pec@gmail.com',
          subject: `[Past payment] ${enrollment.student_name} - Rs ${enrollment.amount} | ${programLabel}`,
          text: [
            `Past payment (backfill) from jaspalsingh.in`,
            ``,
            `Name:    ${enrollment.student_name}`,
            `Email:   ${enrollment.student_email}`,
            `Phone:   ${enrollment.student_phone || '-'}`,
            `Program: ${programLabel}`,
            `Amount:  Rs ${enrollment.amount}`,
            `Order:   ${enrollment.order_id}`,
            `Paid at: ${paid} IST`,
            enrollment.coupon_code ? `Coupon:  ${enrollment.coupon_code}` : '',
          ].filter(Boolean).join('\n'),
        });
        sent++;
        console.log(`[backfill] Sent ${sent}/${enrollments.length} - ${enrollment.student_name}`);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        failed++;
        console.error(`[backfill] Failed for ${enrollment.order_id}:`, e.message);
      }
    }
    console.log(`[backfill] Done. Sent: ${sent}, Failed: ${failed}`);
  } catch (err) {
    console.error('[backfill] Error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
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
const { generateRollNumber } = require('./utils/rollNumber');
const { resolveRollNumberPrefix } = require('./utils/rollNumberPrefix');
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
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS form_token TEXT`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS form_used BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS form_used_at TIMESTAMPTZ`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cf_payment_id TEXT`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS welcome_sent BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE learners ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await query(`ALTER TABLE learners ADD COLUMN IF NOT EXISTS photo_url VARCHAR(1000)`);

  /* ── Referral program ── */
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS referred_by VARCHAR(20)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS referral_email_sent BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS referral_email_sent_at TIMESTAMPTZ`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS enrollments_referral_code_uidx ON enrollments (referral_code) WHERE referral_code IS NOT NULL`);

  /* ── Refund tracking (internal flag only - does not call any payment gateway) ── */
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) NOT NULL DEFAULT 'none'`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS refund_reason TEXT`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS refund_amount INTEGER`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS refunded_by VARCHAR(255)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS roll_number VARCHAR(30)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS enrollments_roll_number_uidx ON enrollments (roll_number) WHERE roll_number IS NOT NULL`);

  /* ── Admit-card approval queue (2026-08-16): the Tally webhook flows
     used to generate the admit-card PDF and email it immediately, with
     no human review. Now they persist it to R2 as 'pending' instead -
     an admin reviews the actual PDF (photo/name/govt ID) and approves
     or rejects it before the learner can download it from their own
     profile. 'none' is the default so every enrollment that already
     had a card emailed before this shipped keeps showing today's plain
     display - never a "pending review" nag for someone who was already
     sent their card months ago. ── */
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_status VARCHAR(20) NOT NULL DEFAULT 'none'`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_pdf_url VARCHAR(1000)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_pdf_key VARCHAR(500)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_submitted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_reviewed_by VARCHAR(255)`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS admit_card_rejection_reason TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_enrollments_admit_card_pending ON enrollments(admit_card_status) WHERE admit_card_status = 'pending'`);
  await query(`CREATE TABLE IF NOT EXISTS free_resources (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    pdf_url     TEXT NOT NULL,
    r2_key      TEXT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  /* ── One-time cleanup: close out stale 'pending' rows left behind by
     retried checkouts where a sibling order for the same learner+program
     already succeeded. These were showing up as duplicate leads in the
     admin enrollments list and getting sales calls after the sale closed. ── */
  await query(`
    UPDATE enrollments p
    SET status = 'cancelled'
    WHERE p.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM enrollments paid
        WHERE paid.student_phone = p.student_phone
          AND paid.program_slug = p.program_slug
          AND paid.status = 'paid'
          AND paid.order_id != p.order_id
      )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS referral_credits (
      id                 SERIAL PRIMARY KEY,
      referrer_order_id  VARCHAR(100) NOT NULL REFERENCES enrollments(order_id) ON DELETE CASCADE,
      referred_order_id  VARCHAR(100) NOT NULL UNIQUE REFERENCES enrollments(order_id) ON DELETE CASCADE,
      amount             INTEGER NOT NULL DEFAULT 100,
      status             VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      paid_at            TIMESTAMP WITH TIME ZONE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_referral_credits_status ON referral_credits(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_referral_credits_referrer ON referral_credits(referrer_order_id)`);

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

  /* ── Point old RSSB test series slugs to new canonical program pages ── */
  await query(`
    UPDATE programs SET detail_url = '/programs/rssb-jen-2026-jaspalsirki-testseries-diploma-civil/'
    WHERE slug = 'rssb-jen-diploma-test-series'
      AND (detail_url IS NULL OR detail_url = '/programs/rssb-jen-diploma-test-series/')
  `);
  await query(`
    UPDATE programs SET detail_url = '/programs/rssb-je-jaspalsirki-testseries-degree-civil/'
    WHERE slug = 'rssb-jen-degree-test-series'
      AND (detail_url IS NULL OR detail_url = '/programs/rssb-jen-degree-test-series/')
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

  await query(`
    CREATE TABLE IF NOT EXISTS email_otps (
      email      VARCHAR(255) PRIMARY KEY,
      otp        VARCHAR(6)   NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Rename both test series programs to unified name and update pricing
  await query(`UPDATE programs SET title='RSSB JE 2026 - Jaspal Sir Ki Test Series Offline', exam='RSSB JE 2026', price=3999, mrp=7999 WHERE slug IN ('rssb-jen-diploma-test-series','rssb-jen-degree-test-series')`);

  // Seed OMR offline programs (upsert - safe to run every startup)
  await query(`
    INSERT INTO programs (slug,title,category,exam,level,status,price,mrp,accent,sort_order,detail_url,is_visible)
    VALUES
      ('rssb-je-omr-degree-test-series',
       'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree (Printed OMR Offline Test Series)',
       'test-series','RSSB JE 2026','Degree (Civil)','enrolling',1999,2999,'purple',6,
       '/programs/rssb-je-jaspalsirki-testseries-degree-civil-omr/',TRUE),
      ('rssb-jen-omr-diploma-test-series',
       'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Diploma (Printed OMR Offline Test Series)',
       'test-series','RSSB JE 2026','Diploma (Civil)','enrolling',1999,2999,'purple',7,
       '/programs/rssb-jen-2026-jaspalsirki-testseries-diploma-civil-omr/',TRUE)
    ON CONFLICT (slug) DO NOTHING
  `);

  /* ── OMR Test Checker (admin-only bubble-sheet grading tool) ── */
  await query(`
    CREATE TABLE IF NOT EXISTS omr_templates (
      id                  SERIAL PRIMARY KEY,
      name                VARCHAR(200) NOT NULL,
      reference_image_url VARCHAR(1000) NOT NULL,
      canonical_width     INTEGER NOT NULL,
      canonical_height    INTEGER NOT NULL,
      corner_points       JSONB NOT NULL,
      question_blocks     JSONB NOT NULL,
      roll_number_grid    JSONB,
      option_count        SMALLINT NOT NULL DEFAULT 5,
      is_active           BOOLEAN NOT NULL DEFAULT TRUE,
      created_by          VARCHAR(255),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS omr_tests (
      id                 SERIAL PRIMARY KEY,
      template_id        INTEGER NOT NULL REFERENCES omr_templates(id) ON DELETE RESTRICT,
      name               VARCHAR(200) NOT NULL,
      program_slug       VARCHAR(120),
      total_questions    SMALLINT NOT NULL,
      marks_per_correct  NUMERIC(5,2) NOT NULL DEFAULT 1,
      negative_marking   NUMERIC(5,2) NOT NULL DEFAULT 0,
      answer_key         JSONB NOT NULL,
      google_sheet_id    VARCHAR(200),
      google_sheet_tab   VARCHAR(200),
      status             VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by         VARCHAR(255),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_omr_tests_template ON omr_tests(template_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS omr_submissions (
      id                   SERIAL PRIMARY KEY,
      test_id              INTEGER NOT NULL REFERENCES omr_tests(id) ON DELETE CASCADE,
      student_name         VARCHAR(255) NOT NULL,
      student_email        VARCHAR(255),
      student_phone        VARCHAR(20),
      roll_number          VARCHAR(50),
      photo_url            VARCHAR(1000) NOT NULL,
      rectified_image_url  VARCHAR(1000),
      detected_answers     JSONB,
      corrected_answers    JSONB,
      status               VARCHAR(20) NOT NULL DEFAULT 'uploaded',
      detector_error       TEXT,
      score                NUMERIC(7,2),
      correct_count        SMALLINT,
      wrong_count          SMALLINT,
      blank_count          SMALLINT,
      sheet_row_number     INTEGER,
      finalized_at         TIMESTAMPTZ,
      finalized_by         VARCHAR(255),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_omr_submissions_test ON omr_submissions(test_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_omr_submissions_status ON omr_submissions(status)`);

  /* Learner self-serve OMR submissions need to be tied back to the
     enrollment that unlocked them (admin uploads never set this). */
  await query(`ALTER TABLE omr_submissions ADD COLUMN IF NOT EXISTS enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE omr_submissions ADD COLUMN IF NOT EXISTS submitted_by_learner BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_omr_submissions_enrollment ON omr_submissions(enrollment_id)`);

  /* Workbook is a program-level resource (same file across every test
     in that program), not per-test. */
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS workbook_url VARCHAR(1000)`);
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS workbook_key VARCHAR(500)`);

  /* ═══════════════════════════════════════════════════════════
     Admin self-serve platform (2026-07-08): coupons, generic OMR
     sending, programs-as-pricing-source-of-truth, and homepage
     content management. See CLAUDE.md-adjacent PR description for
     the full rationale - this block is additive and every new
     column defaults to NULL/FALSE so existing rows are unaffected.
     ═══════════════════════════════════════════════════════════ */

  /* ── Coupons (admin self-serve, replaces the hardcoded COUPONS
     object that used to live in routes/payment.js) ── */
  await query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id              SERIAL PRIMARY KEY,
      code            VARCHAR(50) UNIQUE NOT NULL,
      type            VARCHAR(20) NOT NULL DEFAULT 'fixed_discount', -- fixed_discount | flat_price | program_price_map
      discount_amount INTEGER,        -- rupees off (fixed_discount) or the flat final price (flat_price)
      program_prices  JSONB,          -- program_price_map only: { slug: finalPrice }
      program_slugs   JSONB,          -- fixed_discount/flat_price scope; null/empty = all programs
      max_uses        INTEGER,        -- null = unlimited; 1 = one-time-use; N = limited
      exclusive       BOOLEAN NOT NULL DEFAULT FALSE, -- blocks stacking with a referral code
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      label           VARCHAR(200),
      expires_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active)`);

  /* Seed the previously-hardcoded coupons once, so existing links/emails
     with these codes keep working exactly as before. */
  const couponCount = await query(`SELECT COUNT(*)::int AS n FROM coupons`);
  if (couponCount.rows[0].n === 0) {
    const couponSeed = [
      // code, type, discount_amount, program_prices, program_slugs, max_uses, exclusive, label
      ['FIRST',       'flat_price',        1,    null, null, null, false, 'First-time offer'],
      ['JASPALSIR',   'fixed_discount',    1000, null, null, null, false, 'Get Rs 1,000 off'],
      ['JASPAL200',   'fixed_discount',    1200, null, null, null, true,  'Special Rs 1,200 off'],
      ['DOST', 'program_price_map', null, {
        'rssb-jen-diploma-test-series':     2699,
        'rssb-jen-degree-test-series':      2899,
        'rssb-je-omr-degree-test-series':   899,
        'rssb-jen-omr-diploma-test-series': 899,
      }, null, null, true, 'DOST Partner offer'],
      ['DIP2000E0B4', 'program_price_map', null, { 'rssb-jen-diploma-test-series': 2000 }, null, 1, true, 'Special offer - Rs 2,000'],
      ['DIP20001506', 'program_price_map', null, { 'rssb-jen-diploma-test-series': 2000, 'rssb-jen-degree-test-series': 2000 }, null, 1, true, 'Special offer - Rs 2,000'],
      ['DIP2499X9F3', 'program_price_map', null, { 'rssb-jen-diploma-test-series': 2499, 'rssb-jen-degree-test-series': 2499 }, null, 1, true, 'Special offer - Rs 2,499'],
      ['DIP1000E62A', 'program_price_map', null, { 'rssb-jen-diploma-test-series': 1000 }, null, 1, true, 'Special offer - Rs 1,000'],
    ];
    for (const c of couponSeed) {
      await query(
        `INSERT INTO coupons (code, type, discount_amount, program_prices, program_slugs, max_uses, exclusive, label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO NOTHING`,
        [c[0], c[1], c[2], c[3] ? JSON.stringify(c[3]) : null, c[4] ? JSON.stringify(c[4]) : null, c[5], c[6], c[7]]
      );
    }
    console.log('✅ Seeded 8 coupons from legacy hardcoded catalogue');
  }

  /* ── Programs: new columns for pricing-source-of-truth, generic OMR
     sending, and preset tag badges ── */
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS short_name VARCHAR(300)`);
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS icon_class VARCHAR(60)`);
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS omr_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS total_tests INTEGER`);
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS omr_categories JSONB`); // e.g. ["degree","diploma"] for combo programs
  // Hybrid program launch (Phase 6) - lets admin wire a brand-new program's
  // Tally intake + admit card without a code deploy. NULL launch_config means
  // "this program uses one of the bespoke, hand-written Tally routes" (all
  // 13 programs live today) - the generic webhook only activates when set.
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS launch_config JSONB`);

  /* Backfill the 8 programs that were launched via one-off code changes and
     never got a row in this table, plus fix metadata on rows already here so
     checkout can safely start reading price/mrp/branding from the DB. Uses
     COALESCE so any value an admin may already have edited wins over the seed. */
  const programBackfill = [
    // slug, title, category, exam, level, status, price, mrp, accent, icon_class, thumb, short_name, sort_order, omr_enabled, total_tests, omr_categories
    ['ese-2027-prelims-jaspalsirki-testseries-paper1', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 (GS & Engineering Aptitude)', 'test-series', 'ESE 2027 Prelims', 'Paper 1', 'enrolling', 2999, 4999, 'purple', 'fa-book-reader', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 1', 10, false, 22, null],
    ['ese-2027-prelims-jaspalsirki-testseries-paper2-civil', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 2 (Civil)', 'test-series', 'ESE 2027 Prelims', 'Paper 2 (Civil)', 'enrolling', 2999, 4999, 'purple', 'fa-drafting-compass', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 2 (Civil)', 11, false, 22, null],
    ['ese-2027-prelims-jaspalsirki-testseries-combined', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 + 2 (GS, Eng. Aptitude & Civil)', 'test-series', 'ESE 2027 Prelims', 'Paper 1+2', 'enrolling', 4499, 9999, 'purple', 'fa-layer-group', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 1+2', 12, false, 22, JSON.stringify(['paper1', 'paper2'])],
    ['ese-2027-prelims-jaspalsirki-testseries-paper1-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 (Printed OMR Offline Test Series)', 'test-series', 'ESE 2027 Prelims', 'Paper 1', 'enrolling', 2499, 3999, 'indigo', 'fa-book-reader', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 1 OMR', 13, true, 22, null],
    ['ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 2 Civil (Printed OMR Offline Test Series)', 'test-series', 'ESE 2027 Prelims', 'Paper 2 (Civil)', 'enrolling', 2499, 3999, 'indigo', 'fa-drafting-compass', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 2 OMR', 14, true, 22, null],
    ['ese-2027-prelims-jaspalsirki-testseries-combined-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 + 2 Civil (Printed OMR Offline Test Series)', 'test-series', 'ESE 2027 Prelims', 'Paper 1+2', 'enrolling', 2999, 7999, 'indigo', 'fa-layer-group', '/assets/images/thumb-ese-2027-prelims.jpg', 'ESE 2027 Prelims Paper 1+2 OMR', 15, true, 22, JSON.stringify(['paper1', 'paper2'])],
    ['rssb-je-jaspalsirki-testseries-degree-diploma-combo-omr', 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree + Diploma Combo (Printed OMR Offline Test Series)', 'test-series', 'RSSB JE 2026', 'Degree + Diploma', 'enrolling', 2499, 4999, 'indigo', 'fa-layer-group', '/assets/images/thumb-rssb-je-test-series.jpg?v=2', 'RSSB JE Degree + Diploma Combo OMR', 16, true, 28, JSON.stringify(['degree', 'diploma'])],
    ['rssb-je-jaspalsirki-testseries-degree-diploma-combo', 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree + Diploma Combo Offline', 'test-series', 'RSSB JE 2026', 'Degree + Diploma', 'enrolling', 5499, 9999, 'teal', 'fa-layer-group', '/assets/images/thumb-rssb-je-test-series.jpg?v=2', 'RSSB JE Degree + Diploma Combo', 17, false, 28, JSON.stringify(['degree', 'diploma'])],
  ];
  for (const p of programBackfill) {
    await query(
      `INSERT INTO programs (slug, title, category, exam, level, status, price, mrp, accent, icon_class, thumbnail_url, short_name, sort_order, omr_enabled, total_tests, omr_categories, is_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         icon_class     = COALESCE(programs.icon_class, EXCLUDED.icon_class),
         thumbnail_url  = COALESCE(programs.thumbnail_url, EXCLUDED.thumbnail_url),
         short_name     = COALESCE(programs.short_name, EXCLUDED.short_name),
         omr_enabled    = programs.omr_enabled OR EXCLUDED.omr_enabled,
         total_tests    = COALESCE(programs.total_tests, EXCLUDED.total_tests),
         omr_categories = COALESCE(programs.omr_categories, EXCLUDED.omr_categories)`,
      [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15]]
    );
  }

  // Fix metadata on the 3 pre-existing programs that predate these columns
  // (short_name/icon_class/thumb were never set for them; the 2 OMR rows also
  // had the wrong accent - "purple" instead of the "indigo" checkout actually
  // uses for every *-omr program).
  await query(`UPDATE programs SET short_name = COALESCE(short_name, 'RSSB JE 2026 Test Series'), icon_class = COALESCE(icon_class, 'fa-clipboard-list'), thumbnail_url = COALESCE(thumbnail_url, '/assets/images/thumb-rssb-je-test-series.jpg?v=2') WHERE slug = 'rssb-jen-diploma-test-series'`);
  await query(`UPDATE programs SET short_name = COALESCE(short_name, 'RSSB JE 2026 Test Series'), icon_class = COALESCE(icon_class, 'fa-clipboard-check'), thumbnail_url = COALESCE(thumbnail_url, '/assets/images/thumb-rssb-je-test-series.jpg?v=2') WHERE slug = 'rssb-jen-degree-test-series'`);
  await query(`UPDATE programs SET short_name = COALESCE(short_name, 'RPSC AE Interview Guidance'), icon_class = COALESCE(icon_class, 'fa-user-tie'), thumbnail_url = COALESCE(thumbnail_url, '/assets/images/thumb-rpsc-ae-interview.jpg') WHERE slug = 'rpsc-ae-interview'`);
  await query(`UPDATE programs SET accent = 'indigo', short_name = COALESCE(short_name, 'RSSB JE 2026 OMR Degree Test Series'), icon_class = COALESCE(icon_class, 'fa-clipboard-check'), thumbnail_url = COALESCE(thumbnail_url, '/assets/images/thumb-rssb-je-test-series.jpg?v=2'), omr_enabled = TRUE, total_tests = COALESCE(total_tests, 28) WHERE slug = 'rssb-je-omr-degree-test-series'`);
  await query(`UPDATE programs SET accent = 'indigo', short_name = COALESCE(short_name, 'RSSB JE 2026 OMR Diploma Test Series'), icon_class = COALESCE(icon_class, 'fa-clipboard-list'), thumbnail_url = COALESCE(thumbnail_url, '/assets/images/thumb-rssb-je-test-series.jpg?v=2'), omr_enabled = TRUE, total_tests = COALESCE(total_tests, 22) WHERE slug = 'rssb-jen-omr-diploma-test-series'`);

  /* ── Homepage content sections (carousel, ticker, quick links) ── */
  await query(`
    CREATE TABLE IF NOT EXISTS homepage_carousel (
      id          SERIAL PRIMARY KEY,
      image_url   VARCHAR(1000) NOT NULL,
      link_url    VARCHAR(300),
      title       VARCHAR(200),
      badge       VARCHAR(40),         -- e.g. "New", "Bestseller" - rendered via the same preset badge colours as program tags
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS homepage_ticker (
      id          SERIAL PRIMARY KEY,
      text        VARCHAR(300) NOT NULL,
      link_url    VARCHAR(300),
      badge       VARCHAR(40),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS homepage_quicklinks (
      id          SERIAL PRIMARY KEY,
      label       VARCHAR(200) NOT NULL,
      link_url    VARCHAR(300) NOT NULL,
      badge       VARCHAR(40),
      group_name  VARCHAR(60) NOT NULL DEFAULT 'default', -- lets multiple quick-link menus share one table
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* No seed data here on purpose: frontend/index.html's carousel, ticker,
     and nav quick-links are still hand-coded and stay exactly as they are.
     These 3 tables are additive - the homepage fetches them and appends any
     new admin-added item alongside the existing static content (deduped by
     URL so nothing can double up), rather than replacing what's already
     there. Seeding them with the current static content would just render
     as visible duplicates. */

  /* ── Program test schedule (admin-uploaded, shown on the generic
     /programs/view/ detail page) - the 13 hand-built program pages keep
     their own hardcoded schedule tables; this is only for programs
     launched entirely from the admin dashboard. ── */
  await query(`
    CREATE TABLE IF NOT EXISTS program_schedule (
      id            SERIAL PRIMARY KEY,
      program_slug  VARCHAR(120) NOT NULL,
      test_number   INTEGER NOT NULL,
      test_date     VARCHAR(60),
      syllabus      TEXT,
      questions     INTEGER,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_program_schedule_slug ON program_schedule(program_slug)`);

  /* ── Self-serve test schedule assets (2026-07-18): learner-facing
     paper/solution/answer-sheet download+upload, replacing manual email
     distribution. Reuses this existing program_schedule table (already
     the public pre-purchase display of test dates) rather than a new
     parallel table, so admin only enters a test's date/number once.
     No unique constraint on (program_slug, test_number): existing
     production rows aren't guaranteed clean, and a failed CREATE UNIQUE
     INDEX at boot would crash migrate() for everyone. The bulk-schedule
     endpoint instead upserts by matching in application code (SELECT
     existing id, then UPDATE or INSERT), so re-pasting a schedule
     doesn't wipe uploaded assets off rows that already have a matching
     test_number.

     omr_test_id and answer_key were an earlier design that ran the
     learner's uploaded sheet through the existing bubble-detection
     pipeline (omr_tests/omr_submissions) for auto-scoring. Per explicit
     product direction (2026-07-18) there is no answer mapping at all -
     learners just upload a photo/PDF of their filled sheet by the
     deadline, and ranks are computed manually and posted on WhatsApp.
     These two columns are kept (harmless, unused) rather than dropped
     to avoid unnecessary schema churn; the actual upload now goes to
     the schedule_uploads table below instead of omr_submissions. ── */
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS question_paper_url VARCHAR(1000)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS question_paper_key VARCHAR(500)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS blank_omr_url VARCHAR(1000)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS blank_omr_key VARCHAR(500)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS solution_url VARCHAR(1000)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS solution_key VARCHAR(500)`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS paper_release_at TIMESTAMPTZ`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS omr_upload_deadline TIMESTAMPTZ`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS requires_omr_upload BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS marks INTEGER`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS omr_test_id INTEGER REFERENCES omr_tests(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS answer_key JSONB`);

  /* ONE-TIME (2026-07-18): the admin gating panel sent datetime-local values
     with no timezone offset, so Postgres's UTC session default silently
     stored every IST time the admin typed as if it were UTC - shifting
     every already-saved paper_release_at/omr_upload_deadline 5.5 hours
     later than intended (India is UTC+5:30). The frontend now sends an
     explicit +05:30 offset (see admin.js istInputToIso), but rows saved
     before that fix need correcting once. Guarded by a marker table so
     server restarts never re-apply the shift. */
  await query(`CREATE TABLE IF NOT EXISTS _migrations_applied (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const tzFixApplied = await query(`SELECT 1 FROM _migrations_applied WHERE name = 'schedule_gating_ist_offset_fix_20260718'`);
  if (!tzFixApplied.rows.length) {
    await query(`UPDATE program_schedule SET paper_release_at = paper_release_at - INTERVAL '5 hours 30 minutes' WHERE paper_release_at IS NOT NULL`);
    await query(`UPDATE program_schedule SET omr_upload_deadline = omr_upload_deadline - INTERVAL '5 hours 30 minutes' WHERE omr_upload_deadline IS NOT NULL`);
    await query(`INSERT INTO _migrations_applied (name) VALUES ('schedule_gating_ist_offset_fix_20260718')`);
    console.log('[migration] Corrected IST offset shift on existing schedule gating dates.');
  }

  /* Simple, ungraded answer-sheet upload - one per learner per test.
     Re-uploading before the deadline replaces the previous file (the
     route handles deleting the old R2 object); no scoring, no detection,
     admin reviews these manually. */
  await query(`
    CREATE TABLE IF NOT EXISTS schedule_uploads (
      id             SERIAL PRIMARY KEY,
      schedule_id    INTEGER NOT NULL REFERENCES program_schedule(id) ON DELETE CASCADE,
      enrollment_id  INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
      learner_name   VARCHAR(255),
      learner_email  VARCHAR(255),
      learner_phone  VARCHAR(20),
      file_url       VARCHAR(1000) NOT NULL,
      file_key       VARCHAR(500) NOT NULL,
      uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_schedule_uploads_schedule ON schedule_uploads(schedule_id)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS schedule_uploads_schedule_enrollment_uidx ON schedule_uploads(schedule_id, enrollment_id) WHERE enrollment_id IS NOT NULL`);

  /* Manual per-test results (2026-08-16): replaces the fully-manual
     WhatsApp-only ranking process. Deliberately simpler than the
     dormant omr_submissions bubble-detection tables (see comment on
     omr_test_id/answer_key above) - there's no machine pass here to
     reconcile against, admin just enters the final numbers. published_at
     (nullable) gives a natural draft-then-publish step, same pattern as
     paper_release_at already gates visibility elsewhere in this file. */
  await query(`
    CREATE TABLE IF NOT EXISTS test_results (
      id                  SERIAL PRIMARY KEY,
      schedule_id         INTEGER NOT NULL REFERENCES program_schedule(id) ON DELETE CASCADE,
      enrollment_id       INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      roll_number         VARCHAR(30),
      total_marks         NUMERIC(7,2),
      correct_count       SMALLINT,
      wrong_count         SMALLINT,
      blank_count         SMALLINT,
      rank_position       INTEGER,
      question_breakdown  JSONB,
      published_at        TIMESTAMPTZ,
      entered_by          VARCHAR(255),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS test_results_schedule_enrollment_uidx ON test_results(schedule_id, enrollment_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_test_results_schedule ON test_results(schedule_id)`);

  /* शौर्य Batch DPPs / formula sheets (2026-08-17): no recorded content is
     provided for the offline classroom program, only subject PDFs to
     support self-study between classes. Deliberately NOT scoped to a
     single program_slug - all 6 शौर्य Batch options pull from the same 3
     shared pools by `track` (technical-degree / technical-diploma /
     non-technical), since e.g. the Complete Degree and Technical+TS
     Degree options both unlock the same Technical-Degree materials. The
     learner-facing endpoint (routes/learner-schedule.js) filters by
     whichever track(s) programs.launch_config.batch.materialTracks lists
     for their specific purchase. */
  await query(`
    CREATE TABLE IF NOT EXISTS batch_materials (
      id          SERIAL PRIMARY KEY,
      track       VARCHAR(30) NOT NULL,
      kind        VARCHAR(20) NOT NULL DEFAULT 'dpp',
      subject     VARCHAR(150),
      title       VARCHAR(300) NOT NULL,
      file_url    VARCHAR(1000),
      file_key    VARCHAR(500),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_batch_materials_track ON batch_materials(track)`);

  /* Offline CBT pilot (2026-08-09) - results synced in from air-gapped
     exam machines (see /offline-cbt) once a staff member connects that
     machine to a hotspot and hits Sync. external_id is the id the exam
     app generates client-side (mobile + test_id + submit timestamp), so
     re-syncing the same machine twice (e.g. after a dropped connection)
     never creates a duplicate row. Auto-scored client-side since it's
     all MCQ - score is stored here for admin review, never shown to the
     learner on the exam machine itself. */
  await query(`
    CREATE TABLE IF NOT EXISTS cbt_results (
      id             SERIAL PRIMARY KEY,
      external_id    VARCHAR(255) UNIQUE NOT NULL,
      mobile         VARCHAR(20) NOT NULL,
      name           VARCHAR(255),
      roll_number    VARCHAR(100),
      program        VARCHAR(255),
      test_id        VARCHAR(100) NOT NULL,
      test_title     VARCHAR(255),
      answers        JSONB,
      score          INTEGER,
      total          INTEGER,
      auto_submitted BOOLEAN NOT NULL DEFAULT FALSE,
      started_at     TIMESTAMPTZ,
      submitted_at   TIMESTAMPTZ,
      synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_cbt_results_test ON cbt_results(test_id)`);

  /* ── Schedule track/category (2026-07-18) ── Combo programs (RSSB JE
     Degree+Diploma, ESE Combined Paper1+Paper2) bundle two independent
     test tracks under one program_slug, each numbered 1..N - without a
     category column, both tracks' "Test 1" would collide on the same
     upsert key. Learner picks a track ("Degree"/"Diploma" or "Civil"/
     "General Studies") before seeing that track's schedule; admin picks
     the same track before pasting/adding rows for it. NULL category =
     ordinary single-track program, unaffected. */
  await query(`ALTER TABLE program_schedule ADD COLUMN IF NOT EXISTS category VARCHAR(50)`);
  await query(`
    UPDATE programs SET omr_categories = '["general-studies","civil"]'
    WHERE slug IN ('ese-2027-prelims-jaspalsirki-testseries-combined', 'ese-2027-prelims-jaspalsirki-testseries-combined-omr')
      AND omr_categories IS NULL
  `);

  /* ── Program page content: "Who Is This For" bullets + FAQ ──
     Admin-editable free text for the generic /programs/view/ detail page,
     matching the equivalent hand-written sections on the 13 bespoke pages. */
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS who_for JSONB`);   // string[]
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS faqs JSONB`);      // { question, answer }[]

  /* ── Retire the site-wide JASPALSIR coupon, baking its Rs 1,000
     discount straight into each program's base price so the price shown
     everywhere is the real checkout price with no code needed. Coupons
     stay available for genuinely special cases (FIRST, JASPAL200, DOST/
     partner codes) - just not as a de-facto mandatory blanket code. ── */
  await query(`UPDATE coupons SET is_active = FALSE WHERE code = 'JASPALSIR'`);
  const directPrices = [
    ['rssb-jen-degree-test-series', 2999],
    ['rssb-jen-diploma-test-series', 2799],
    ['rssb-je-jaspalsirki-testseries-degree-diploma-combo', 3499],
    ['rssb-je-jaspalsirki-testseries-degree-diploma-combo-omr', 1499],
    ['rssb-je-omr-degree-test-series', 999],
    ['rssb-jen-omr-diploma-test-series', 999],
    ['ese-2027-prelims-jaspalsirki-testseries-paper1', 1999],
    ['ese-2027-prelims-jaspalsirki-testseries-paper2-civil', 1999],
    ['ese-2027-prelims-jaspalsirki-testseries-combined', 3499],
    ['ese-2027-prelims-jaspalsirki-testseries-paper1-omr', 1499],
    ['ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr', 1499],
    ['ese-2027-prelims-jaspalsirki-testseries-combined-omr', 1999],
    ['rssb-je-2026-jaspasir-ki-testseries-degree-jaipur-main-batch-26-july', 1599],
    ['rssb-je-2026-jaspasir-ki-testseries-diploma-jaipur-main-batch-26-july', 1199],
  ];
  for (const [slug, price] of directPrices) {
    await query(`UPDATE programs SET price = $1, updated_at = NOW() WHERE slug = $2`, [price, slug]);
  }

  /* ── Rename BPSC Sanitary Officer slug from 2025 to 2026 (corrected
     exam year, 2026-08-10) - renames the existing rows in place rather
     than leaving orphaned 2025-slug rows behind after the newProgramLaunches
     upsert below starts inserting under the new slug. Safe to run every
     boot: no-ops once the rename has already happened. ── */
  await query(`UPDATE programs SET slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-offline', detail_url = '/programs/bpsc-sanitary-officer-2026-jaspalsirki-testseries-offline/' WHERE slug = 'bpsc-sanitary-officer-2025-jaspalsirki-testseries-offline'`);
  await query(`UPDATE programs SET slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr', detail_url = '/programs/bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr/' WHERE slug = 'bpsc-sanitary-officer-2025-jaspalsirki-testseries-omr'`);

  /* ── New program launches (2026-08-09): RVUNL JE 2026 (Electrical/
     Mechanical/Civil), BPSC Assistant Public Sanitary & Waste Management
     Officer 2026 (Bihar, Offline + Printed OMR), UP Polytechnic
     Lecturer - Civil (Printed OMR Offline). Same upsert-every-boot pattern as
     programBackfill above so re-deploys stay idempotent and any
     admin edit already made in the DB always wins via COALESCE. ── */
  const newProgramLaunches = [
    {
      slug: 'rvunl-je-2026-jaspalsirki-testseries-electrical',
      title: 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Electrical',
      category: 'test-series', exam: 'RVUNL JE 2026', level: 'Electrical', status: 'enrolling',
      price: 2999, mrp: 5999, accent: 'blue', icon_class: 'fa-bolt',
      thumbnail_url: '/assets/images/thumb-rvunl-je-2026.jpg',
      short_name: 'RVUNL JE 2026 Electrical Test Series', sort_order: 18,
      omr_enabled: false, total_tests: 10, omr_categories: null,
      tags: ['New', 'Bestseller'],
      short_desc: '10 Full-Length CBT Mock Tests for RVUNL JE-I Electrical (RVUN/RVPN/JVVN/AVVN/JdVVN), offline centers in Jaipur, Bikaner & Kota.',
      who_for: [
        'Engineering graduates targeting JE-I (Electrical) across RVUN, RVPN, JVVN, AVVN & JdVVN',
        'Candidates who want real CBT-interface practice before exam day',
        'Aspirants who prefer offline test centers in Jaipur, Bikaner & Kota',
        'Anyone who wants full-syllabus, exam-pattern-aligned mock coverage',
      ],
      faqs: [
        { question: 'Is this test series for the RVUNL Common Recruitment Exercise 2026?', answer: 'Yes. This series is built for the Junior Engineer-I (Electrical) post under the RVUNL/RVPN/JVVN/AVVN/JdVVN Common Recruitment Exercise, Advertisement No. RVUN/Rectt.-2026-27/02.' },
        { question: 'Where are the offline CBT test centers?', answer: 'Centers are available across major cities in Rajasthan plus Delhi. Exact center allotment is shared before each test.' },
        { question: 'How many tests are included and what format do they follow?', answer: '10 Full Length Tests (FLT) on a CBT-style interface, covering the complete JE-I Electrical syllabus.' },
      ],
    },
    {
      slug: 'rvunl-je-2026-jaspalsirki-testseries-mechanical',
      title: 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Mechanical',
      category: 'test-series', exam: 'RVUNL JE 2026', level: 'Mechanical', status: 'enrolling',
      price: 2999, mrp: 5999, accent: 'orange', icon_class: 'fa-cogs',
      thumbnail_url: '/assets/images/thumb-rvunl-je-2026.jpg',
      short_name: 'RVUNL JE 2026 Mechanical Test Series', sort_order: 19,
      omr_enabled: false, total_tests: 10, omr_categories: null,
      tags: ['New', 'Bestseller'],
      short_desc: '10 Full-Length CBT Mock Tests for RVUNL JE-I Mechanical (RVUN/RVPN/JVVN/AVVN/JdVVN), offline centers in Jaipur, Bikaner & Kota.',
      who_for: [
        'Engineering graduates targeting JE-I (Mechanical) across RVUN, RVPN, JVVN, AVVN & JdVVN',
        'Candidates who want real CBT-interface practice before exam day',
        'Aspirants who prefer offline test centers in Jaipur, Bikaner & Kota',
        'Anyone who wants full-syllabus, exam-pattern-aligned mock coverage',
      ],
      faqs: [
        { question: 'Is this test series for the RVUNL Common Recruitment Exercise 2026?', answer: 'Yes. This series is built for the Junior Engineer-I (Mechanical) post under the RVUNL/RVPN/JVVN/AVVN/JdVVN Common Recruitment Exercise, Advertisement No. RVUN/Rectt.-2026-27/02.' },
        { question: 'Where are the offline CBT test centers?', answer: 'Centers are available across major cities in Rajasthan plus Delhi. Exact center allotment is shared before each test.' },
        { question: 'How many tests are included and what format do they follow?', answer: '10 Full Length Tests (FLT) on a CBT-style interface, covering the complete JE-I Mechanical syllabus.' },
      ],
    },
    {
      slug: 'rvunl-je-2026-jaspalsirki-testseries-civil',
      title: 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Civil',
      category: 'test-series', exam: 'RVUNL JE 2026', level: 'Civil', status: 'enrolling',
      price: 2999, mrp: 5999, accent: 'teal', icon_class: 'fa-drafting-compass',
      thumbnail_url: '/assets/images/thumb-rvunl-je-2026.jpg',
      short_name: 'RVUNL JE 2026 Civil Test Series', sort_order: 20,
      omr_enabled: false, total_tests: 10, omr_categories: null,
      tags: ['New'],
      short_desc: '10 Full-Length CBT Mock Tests for RVUNL JE-I Civil (RVUN/RVPN/JVVN/AVVN/JdVVN), offline centers in Jaipur, Bikaner & Kota.',
      who_for: [
        'Engineering graduates targeting JE-I (Civil) across RVUN, RVPN, JVVN, AVVN & JdVVN',
        'Candidates who want real CBT-interface practice before exam day',
        'Aspirants who prefer offline test centers in Jaipur, Bikaner & Kota',
        'Anyone who wants full-syllabus, exam-pattern-aligned mock coverage',
      ],
      faqs: [
        { question: 'Is this test series for the RVUNL Common Recruitment Exercise 2026?', answer: 'Yes. This series is built for the Junior Engineer-I (Civil) post under the RVUNL/RVPN/JVVN/AVVN/JdVVN Common Recruitment Exercise, Advertisement No. RVUN/Rectt.-2026-27/02.' },
        { question: 'Where are the offline CBT test centers?', answer: 'Centers are available across major cities in Rajasthan plus Delhi. Exact center allotment is shared before each test.' },
        { question: 'How many tests are included and what format do they follow?', answer: '10 Full Length Tests (FLT) on a CBT-style interface, covering the complete JE-I Civil syllabus.' },
      ],
    },
    {
      slug: 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-offline',
      title: 'BPSC Bihar Assistant Public Sanitary & Waste Management Officer 2026 - Jaspal Sir Ki Test Series (Offline)',
      category: 'test-series', exam: 'BPSC Bihar Sanitary Officer 2026', level: 'Offline', status: 'enrolling',
      price: 2499, mrp: 5999, accent: 'green', icon_class: 'fa-recycle',
      thumbnail_url: '/assets/images/thumb-bpsc-sanitary-officer-2026.jpg',
      short_name: 'BPSC Bihar Sanitary Officer 2026 Test Series (Offline)', sort_order: 21,
      omr_enabled: false, total_tests: 20, omr_categories: null,
      tags: ['New'],
      short_desc: '20 offline tests covering General Studies + Solid & Liquid Waste Management for BPSC Advt. 108/2025, centers in Patna & Delhi.',
      who_for: [
        'Graduates in Chemistry/Environmental Science/Civil/Environmental/Public Health Engg./Bio Technology/Planning/Architecture applying under BPSC Advt. 108/2025',
        'Candidates who want dedicated Solid & Liquid Waste Management practice, not just General Studies',
        'Aspirants who prefer offline test centers in Patna or Delhi',
        'Anyone who wants a structured subject-wise + full-length test progression',
      ],
      faqs: [
        { question: 'Which post is this test series for?', answer: 'Assistant Public Sanitary & Waste Management Officer under BPSC Advertisement No. 108/2025, Nagar Vikas evam Awas Vibhag, Bihar.' },
        { question: 'What is the paper pattern?', answer: 'Two compulsory objective papers held on the same day: Paper I General Studies (125 questions / 100 marks / 2 hours) and Paper II Solid & Liquid Waste Management (125 questions / 100 marks / 2 hours).' },
        { question: 'When does this batch start?', answer: 'Tentatively September 2026. Exact dates are shared with enrolled learners in advance.' },
        { question: 'Is there a printed OMR offline option if I cannot travel to Patna or Delhi?', answer: 'Yes, the same test series is also available as a Printed OMR Offline test series - see the OMR variant on this page.' },
      ],
    },
    {
      slug: 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr',
      title: 'BPSC Bihar Assistant Public Sanitary & Waste Management Officer 2026 - Jaspal Sir Ki Test Series (Printed OMR Offline)',
      category: 'test-series', exam: 'BPSC Bihar Sanitary Officer 2026', level: 'Printed OMR Offline', status: 'enrolling',
      price: 1499, mrp: 3999, accent: 'indigo', icon_class: 'fa-recycle',
      thumbnail_url: '/assets/images/thumb-bpsc-sanitary-officer-2026.jpg',
      short_name: 'BPSC Bihar Sanitary Officer 2026 Test Series (OMR)', sort_order: 22,
      omr_enabled: true, total_tests: 20, omr_categories: null,
      tags: ['New'],
      short_desc: '20 printed OMR offline tests covering General Studies + Solid & Liquid Waste Management for BPSC Advt. 108/2025 - attempt from anywhere.',
      who_for: [
        'Graduates in Chemistry/Environmental Science/Civil/Environmental/Public Health Engg./Bio Technology/Planning/Architecture applying under BPSC Advt. 108/2025',
        'Candidates outside Patna/Delhi who still want a proctored-style OMR practice routine',
        'Aspirants who want to build OMR-sheet speed and accuracy at home',
        'Anyone who wants a structured subject-wise + full-length test progression',
      ],
      faqs: [
        { question: 'How does the printed OMR offline test series work?', answer: 'You receive the question paper and a blank OMR sheet on each test date, attempt it at home within the time limit, and upload your filled sheet before the deadline.' },
        { question: 'What is the paper pattern?', answer: 'Two compulsory objective papers held on the same day: Paper I General Studies (125 questions / 100 marks / 2 hours) and Paper II Solid & Liquid Waste Management (125 questions / 100 marks / 2 hours).' },
        { question: 'When does this batch start?', answer: 'Tentatively September 2026. Exact dates are shared with enrolled learners in advance.' },
      ],
    },
    {
      slug: 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr',
      title: 'UP Polytechnic Lecturer - Jaspal Sir Ki Test Series - Civil (Printed OMR Offline)',
      category: 'test-series', exam: 'UP Polytechnic Lecturer', level: 'Civil (Printed OMR Offline)', status: 'enrolling',
      price: 599, mrp: 1499, accent: 'purple', icon_class: 'fa-chalkboard-teacher',
      thumbnail_url: '/assets/images/thumb-up-polytechnic-lecturer.jpg',
      short_name: 'UP Polytechnic Lecturer Civil OMR Test Series', sort_order: 23,
      omr_enabled: true, total_tests: 12, omr_categories: null,
      tags: ['New'],
      short_desc: '12 printed OMR offline tests (Hindi + Civil Paper I, GS + Civil Paper II) for the UP Technical Education (Teaching) Service Exam - Civil branch.',
      who_for: [
        'Candidates applying for Lecturer (Civil Engineering), Govt. Polytechnics under UPPSC Advt. A-11/E-1/2025',
        'Aspirants who want the exact UPPSC two-paper pattern practiced at home',
        'Anyone who wants a fixed, date-wise test calendar to plan around',
        'Candidates who want both Hindi/GS and core Civil subject practice in one series',
      ],
      faqs: [
        { question: 'Which exam is this for?', answer: 'The UP Technical Education (Teaching) Service Examination-2025 (UPPSC Advt. No. A-11/E-1/2025), Lecturer post, Civil Engineering branch.' },
        { question: 'What is the test schedule?', answer: '12 tests across 6 dates - 16 Aug, 20 Aug, 23 Aug, 27 Aug, 30 Aug & 3 Sep 2026 - two tests (Paper I and Paper II) on each date.' },
        { question: 'What is the paper pattern?', answer: 'Paper I: Hindi (25 questions / 75 marks) + Civil-I (100 questions / 300 marks), 2.5 hours. Paper II: General Studies (25 questions / 75 marks) + Civil-II (100 questions / 300 marks), 2.5 hours.' },
        { question: 'Is this a printed OMR offline test series?', answer: 'Yes. You get the question paper and blank OMR sheet on each test date and upload your filled sheet before the deadline - no need to travel to a center.' },
      ],
    },
  ];
  for (const p of newProgramLaunches) {
    await query(
      `INSERT INTO programs (slug, title, category, exam, level, status, price, mrp, accent, icon_class, thumbnail_url, short_name, sort_order, omr_enabled, total_tests, omr_categories, tags, short_desc, who_for, faqs, detail_url, is_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         icon_class     = COALESCE(programs.icon_class, EXCLUDED.icon_class),
         thumbnail_url  = COALESCE(programs.thumbnail_url, EXCLUDED.thumbnail_url),
         short_name     = COALESCE(programs.short_name, EXCLUDED.short_name),
         omr_enabled    = programs.omr_enabled OR EXCLUDED.omr_enabled,
         total_tests    = COALESCE(programs.total_tests, EXCLUDED.total_tests),
         omr_categories = COALESCE(programs.omr_categories, EXCLUDED.omr_categories),
         tags           = CASE WHEN programs.tags = '[]'::jsonb OR programs.tags IS NULL THEN EXCLUDED.tags ELSE programs.tags END,
         short_desc     = COALESCE(programs.short_desc, EXCLUDED.short_desc),
         who_for        = COALESCE(programs.who_for, EXCLUDED.who_for),
         faqs           = COALESCE(programs.faqs, EXCLUDED.faqs)`,
      [p.slug, p.title, p.category, p.exam, p.level, p.status, p.price, p.mrp, p.accent, p.icon_class,
       p.thumbnail_url, p.short_name, p.sort_order, p.omr_enabled, p.total_tests,
       p.omr_categories ? JSON.stringify(p.omr_categories) : null,
       JSON.stringify(p.tags), p.short_desc, JSON.stringify(p.who_for), JSON.stringify(p.faqs),
       '/programs/' + p.slug + '/']
    );
  }
  console.log('✅ Seeded/updated 6 new program launches: RVUNL JE 2026 (Electrical/Mechanical/Civil), BPSC Bihar Sanitary Officer 2026 (Offline/OMR), UP Polytechnic Lecturer Civil OMR');

  /* ── "Home-Based OMR" -> "Printed OMR Offline" rebrand (2026-08-26): the
     owner does not want "Home Based" or "Online" used anywhere on the site
     for these take-home/postal OMR test series. title/level/short_desc/faqs
     are all only-set-once columns (VALUES on first INSERT, either
     "ON CONFLICT DO NOTHING" above or an UPDATE SET clause that never
     touches these specific columns) - every seed block above already has
     the corrected copy, but that does nothing for the rows that were
     already live before this change. Explicit unconditional corrections,
     once, for every affected slug. faqs is fully overwritten (not edited
     in place) to avoid risky JSONB array surgery inside migrate() - see
     the शौर्य Batch faqs correction earlier in this function for why. ── */
  const omrRebrandTitles = [
    ['rssb-je-omr-degree-test-series', 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree (Printed OMR Offline Test Series)'],
    ['rssb-jen-omr-diploma-test-series', 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Diploma (Printed OMR Offline Test Series)'],
    ['ese-2027-prelims-jaspalsirki-testseries-paper1-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 (Printed OMR Offline Test Series)'],
    ['ese-2027-prelims-jaspalsirki-testseries-paper2-civil-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 2 Civil (Printed OMR Offline Test Series)'],
    ['ese-2027-prelims-jaspalsirki-testseries-combined-omr', 'ESE 2027 Prelims - Jaspal Sir Ki Test Series - Paper 1 + 2 Civil (Printed OMR Offline Test Series)'],
    ['rssb-je-jaspalsirki-testseries-degree-diploma-combo-omr', 'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree + Diploma Combo (Printed OMR Offline Test Series)'],
    ['bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr', 'BPSC Bihar Assistant Public Sanitary & Waste Management Officer 2026 - Jaspal Sir Ki Test Series (Printed OMR Offline)'],
    ['up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr', 'UP Polytechnic Lecturer - Jaspal Sir Ki Test Series - Civil (Printed OMR Offline)'],
  ];
  for (const [slug, title] of omrRebrandTitles) {
    await query(`UPDATE programs SET title = $1 WHERE slug = $2`, [title, slug]);
  }
  await query(`UPDATE programs SET level = 'Printed OMR Offline' WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr'`);
  await query(`UPDATE programs SET level = 'Civil (Printed OMR Offline)' WHERE slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr'`);
  await query(
    `UPDATE programs SET short_desc = $1 WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr'`,
    ['20 printed OMR offline tests covering General Studies + Solid & Liquid Waste Management for BPSC Advt. 108/2025 - attempt from anywhere.']
  );
  await query(
    `UPDATE programs SET short_desc = $1 WHERE slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr'`,
    ['12 printed OMR offline tests (Hindi + Civil Paper I, GS + Civil Paper II) for the UP Technical Education (Teaching) Service Exam - Civil branch.']
  );
  await query(
    `UPDATE programs SET faqs = $1 WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-offline'`,
    [JSON.stringify([
      { question: 'Which post is this test series for?', answer: 'Assistant Public Sanitary & Waste Management Officer under BPSC Advertisement No. 108/2025, Nagar Vikas evam Awas Vibhag, Bihar.' },
      { question: 'What is the paper pattern?', answer: 'Two compulsory objective papers held on the same day: Paper I General Studies (125 questions / 100 marks / 2 hours) and Paper II Solid & Liquid Waste Management (125 questions / 100 marks / 2 hours).' },
      { question: 'When does this batch start?', answer: 'Tentatively September 2026. Exact dates are shared with enrolled learners in advance.' },
      { question: 'Is there a printed OMR offline option if I cannot travel to Patna or Delhi?', answer: 'Yes, the same test series is also available as a Printed OMR Offline test series - see the OMR variant on this page.' },
    ])]
  );
  await query(
    `UPDATE programs SET faqs = $1 WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr'`,
    [JSON.stringify([
      { question: 'How does the printed OMR offline test series work?', answer: 'You receive the question paper and a blank OMR sheet on each test date, attempt it at home within the time limit, and upload your filled sheet before the deadline.' },
      { question: 'What is the paper pattern?', answer: 'Two compulsory objective papers held on the same day: Paper I General Studies (125 questions / 100 marks / 2 hours) and Paper II Solid & Liquid Waste Management (125 questions / 100 marks / 2 hours).' },
      { question: 'When does this batch start?', answer: 'Tentatively September 2026. Exact dates are shared with enrolled learners in advance.' },
    ])]
  );
  await query(
    `UPDATE programs SET faqs = $1 WHERE slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr'`,
    [JSON.stringify([
      { question: 'Which exam is this for?', answer: 'The UP Technical Education (Teaching) Service Examination-2025 (UPPSC Advt. No. A-11/E-1/2025), Lecturer post, Civil Engineering branch.' },
      { question: 'What is the test schedule?', answer: '12 tests across 6 dates - 16 Aug, 20 Aug, 23 Aug, 27 Aug, 30 Aug & 3 Sep 2026 - two tests (Paper I and Paper II) on each date.' },
      { question: 'What is the paper pattern?', answer: 'Paper I: Hindi (25 questions / 75 marks) + Civil-I (100 questions / 300 marks), 2.5 hours. Paper II: General Studies (25 questions / 75 marks) + Civil-II (100 questions / 300 marks), 2.5 hours.' },
      { question: 'Is this a printed OMR offline test series?', answer: 'Yes. You get the question paper and blank OMR sheet on each test date and upload your filled sheet before the deadline - no need to travel to a center.' },
    ])]
  );
  console.log('✅ Corrected "Home-Based OMR" -> "Printed OMR Offline" wording on 8 already-live program rows');

  /* ── UP Polytechnic Lecturer (Civil, Printed OMR Offline): real Tally form
     wired 2026-08-10 - only sets launch_config the first time so any
     later admin-panel edit (rollPrefix, waGroupUrl, etc.) always wins. ── */
  await query(
    `UPDATE programs SET launch_config = $1
     WHERE slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr' AND launch_config IS NULL`,
    [JSON.stringify({
      seriesName: 'UP Polytechnic Lecturer - Civil (Printed OMR Offline)',
      tallyFormUrl: 'https://tally.so/r/gDVyVl',
      mode: 'home',
      rollPrefix: 'UPPOLY',
      waGroupUrl: null,
      lastTestDate: 'Tests run 16, 20, 23, 27, 30 Aug & 3 Sep 2026 - see full schedule on the program page',
      centre: null,
    })]
  );
  await query(
    `UPDATE programs SET launch_config = jsonb_set(launch_config, '{seriesName}', '"UP Polytechnic Lecturer - Civil (Printed OMR Offline)"')
     WHERE slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr' AND launch_config->>'seriesName' LIKE '%Home%'`
  );

  /* ── शौर्य Batch - RSSB JE 2026 (2026-08-17): first offline CLASSROOM
     program on the platform, not just a test series - 500hrs Technical +
     100hrs Non-Technical live teaching at the Jaipur centre, taught by
     Dr. Jaspal Singh, Praveen Sir and Deven Sir, capped at 200 seats.
     Uses the 'course' category (already defined in CAT_LABEL/CAT_ICON on
     the frontend, previously unused - rssb-jen-crash-course and
     gate-ese-foundation were seeded with it as coming_soon placeholders).

     6 separate purchasable options, each its own program row/slug/price
     so every combination gets its own SEO-indexable URL - see
     frontend/programs/shaurya-batch-rssb-je-2026/ for the comparison page
     that lists all 6 side by side.

     All 6 options originally bundled into the EXISTING RSSB Degree/
     Diploma Test Series product instead of having their own schedule
     (launch_config.batch.bundledTestSeriesSlug, auto-linking a paid
     enrollment in that program at purchase time). Reverted 2026-08-19:
     the owner confirmed शौर्य Batch's own tests are NOT the same test
     series as that product - there is no real connection - so every
     option now gets its own standalone rollPrefix ('SHAURYA') and needs
     its own real Tally form (tallyFormUrl, still pending - see
     NO_FULFILLMENT_SLUGS in paymentEmailService.js for the manual-
     follow-up email that covers the gap until one exists), same as any
     other program launch - the bundling fields have been removed from
     the seed data below entirely (see the correction block after the
     seed loop, which also retroactively fixes already-live rows). ── */
  const shauryaCentre = {
    name: 'Jaipur',
    address: '33, White House, Opp. Zone Tech, Tonk Road, Madhuvan Colony, Mansingh Pura, Jaipur, Rajasthan 302015',
    mapsLink: 'https://maps.app.goo.gl/UiYpXv447AWrfyMX8',
  };
  const shauryaEducators = [
    { name: 'Dr. Jaspal Singh', credentials: 'Ex-IES Officer (AIR-04), PhD, GATE AIR-06, 15+ years teaching experience' },
    { name: 'Praveen Sir', credentials: '8+ years teaching experience' },
    { name: 'Deven Sir', credentials: '8+ years teaching experience' },
  ];
  // Degree and Diploma technical teaching hours differ (2026-08-17 correction) -
  // Diploma is 350hrs Technical (not 500hrs like Degree), Non-Technical is the
  // same 100hrs either way.
  const shauryaContentHoursDegree  = { technical: 500, nonTechnical: 100 };
  const shauryaContentHoursDiploma = { technical: 350, nonTechnical: 100 };
  const shauryaSyllabusUrl = '/assets/docs/rssb-je-2026-shaurya-batch-syllabus.pdf';
  const shauryaLaunches = [
    {
      slug: 'rssb-je-2026-shaurya-batch-complete-degree',
      title: 'RSSB JE 2026 - शौर्य Batch - Complete Course (Degree)',
      level: 'Complete Course - Degree', price: 19999, mrp: 44999, sort_order: 24,
      short_name: 'शौर्य Batch - Complete Degree',
      short_desc: 'Technical + Non-Technical live classroom teaching (600 hrs) at our Jaipur centre, plus the full RSSB JE Degree Test Series - everything in one batch.',
      who_for: [
        'Degree (Civil) candidates who want live classroom teaching, not just self-study test series',
        'Aspirants in or near Jaipur who can attend offline classes',
        'Candidates who want Dr. Jaspal Singh, Praveen Sir and Deven Sir teaching Technical + Non-Technical live',
        'Anyone who wants one single program covering syllabus + practice + testing',
      ],
      materialTracks: ['technical-degree', 'non-technical'],
    },
    {
      slug: 'rssb-je-2026-shaurya-batch-complete-diploma',
      title: 'RSSB JE 2026 - शौर्य Batch - Complete Course (Diploma)',
      level: 'Complete Course - Diploma', price: 17999, mrp: 39999, sort_order: 25,
      short_name: 'शौर्य Batch - Complete Diploma',
      short_desc: 'Technical + Non-Technical live classroom teaching (450 hrs) at our Jaipur centre, plus the full RSSB JE Diploma Test Series - everything in one batch.',
      who_for: [
        'Diploma (Civil) candidates who want live classroom teaching, not just self-study test series',
        'Aspirants in or near Jaipur who can attend offline classes',
        'Candidates who want Dr. Jaspal Singh, Praveen Sir and Deven Sir teaching Technical + Non-Technical live',
        'Anyone who wants one single program covering syllabus + practice + testing',
      ],
      materialTracks: ['technical-diploma', 'non-technical'],
    },
    {
      slug: 'rssb-je-2026-shaurya-batch-non-technical-test-series',
      title: 'RSSB JE 2026 - शौर्य Batch - Non-Technical + Test Series',
      level: 'Non-Technical + Test Series', price: 5999, mrp: 14999, sort_order: 26,
      short_name: 'शौर्य Batch - Non-Technical + Test Series',
      short_desc: '100 hrs of live Non-Technical (Rajasthan GK, History, Art & Culture, Political & Administrative System) classroom teaching, plus the RSSB JE Test Series - GK content is identical for Degree and Diploma.',
      who_for: [
        'Candidates who are confident in their core Technical subjects but want structured Non-Technical/GK teaching',
        'Aspirants who want live classes for the shared GK portion plus test practice',
        'Anyone combining self-study for Technical with classroom support for Non-Technical',
      ],
      materialTracks: ['non-technical'],
    },
    {
      slug: 'rssb-je-2026-shaurya-batch-non-technical-only',
      title: 'RSSB JE 2026 - शौर्य Batch - Non-Technical Course',
      level: 'Non-Technical Only', price: 4999, mrp: 9999, sort_order: 27,
      short_name: 'शौर्य Batch - Non-Technical Only',
      short_desc: '100 hrs of live Non-Technical (Rajasthan GK, History, Art & Culture, Political & Administrative System) classroom teaching at our Jaipur centre.',
      who_for: [
        'Candidates who only need structured Non-Technical/GK classroom teaching',
        'Aspirants already enrolled in a Technical-only track or test series elsewhere',
        'Anyone who wants live GK teaching without committing to the full batch',
      ],
      materialTracks: ['non-technical'],
    },
    {
      slug: 'rssb-je-2026-shaurya-batch-technical-test-series-degree',
      title: 'RSSB JE 2026 - शौर्य Batch - Technical + Test Series (Degree)',
      level: 'Technical + Test Series - Degree', price: 14999, mrp: 34999, sort_order: 28,
      short_name: 'शौर्य Batch - Technical + Test Series (Degree)',
      short_desc: '500 hrs of live Degree-level Technical classroom teaching at our Jaipur centre, plus the full RSSB JE Degree Test Series.',
      who_for: [
        'Degree (Civil) candidates who want live Technical teaching plus test practice',
        'Aspirants confident in Non-Technical/GK who want to focus classroom time on core Civil Engineering',
        'Candidates who want Dr. Jaspal Singh, Praveen Sir and Deven Sir teaching Technical subjects live',
      ],
      materialTracks: ['technical-degree'],
    },
    {
      slug: 'rssb-je-2026-shaurya-batch-technical-test-series-diploma',
      title: 'RSSB JE 2026 - शौर्य Batch - Technical + Test Series (Diploma)',
      level: 'Technical + Test Series - Diploma', price: 12999, mrp: 29999, sort_order: 29,
      short_name: 'शौर्य Batch - Technical + Test Series (Diploma)',
      short_desc: '350 hrs of live Diploma-level Technical classroom teaching at our Jaipur centre, plus the full RSSB JE Diploma Test Series.',
      who_for: [
        'Diploma (Civil) candidates who want live Technical teaching plus test practice',
        'Aspirants confident in Non-Technical/GK who want to focus classroom time on core Civil Engineering',
        'Candidates who want Dr. Jaspal Singh, Praveen Sir and Deven Sir teaching Technical subjects live',
      ],
      materialTracks: ['technical-diploma'],
    },
  ];
  const shauryaFaqs = [
    { question: 'Where are the classes held?', answer: 'At our offline centre in Jaipur - 33, White House, Opp. Zone Tech, Tonk Road, Madhuvan Colony, Mansingh Pura, Jaipur, Rajasthan 302015. This is currently the only city for शौर्य Batch.' },
    { question: 'When does the batch start?', answer: 'Tentatively September 2026. Class timings will be announced to enrolled learners in advance.' },
    { question: 'Is there a seat limit?', answer: 'Yes - शौर्य Batch is capped at 200 seats to keep classroom sizes manageable. Enrollment closes once the batch is full.' },
    { question: 'Is recorded content provided?', answer: 'No, शौर्य Batch is a live offline classroom program - there are no recorded lectures. Subject-wise DPPs and formula sheets are shared as downloadable PDFs to support your offline preparation.' },
    { question: 'Do I get an admit card / ID?', answer: 'Yes - you\'ll get a roll number and admit card for शौर्य Batch itself once your details form is reviewed and approved, which also serves as your classroom attendance ID.' },
  ];
  for (const p of shauryaLaunches) {
    await query(
      `INSERT INTO programs (slug, title, category, exam, level, status, price, mrp, accent, icon_class, thumbnail_url, short_name, sort_order, omr_enabled, total_tests, omr_categories, tags, short_desc, who_for, faqs, detail_url, is_visible)
       VALUES ($1,$2,'course','RSSB JE 2026',$3,'enrolling',$4,$5,'orange','fa-chalkboard-teacher',NULL,$6,$7,FALSE,NULL,NULL,$8,$9,$10,$11,$12,TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         short_name = COALESCE(programs.short_name, EXCLUDED.short_name),
         tags       = CASE WHEN programs.tags = '[]'::jsonb OR programs.tags IS NULL THEN EXCLUDED.tags ELSE programs.tags END,
         short_desc = COALESCE(programs.short_desc, EXCLUDED.short_desc),
         who_for    = COALESCE(programs.who_for, EXCLUDED.who_for),
         faqs       = COALESCE(programs.faqs, EXCLUDED.faqs)`,
      [p.slug, p.title, p.level, p.price, p.mrp, p.short_name, p.sort_order,
       JSON.stringify(['New']), p.short_desc, JSON.stringify(p.who_for), JSON.stringify(shauryaFaqs),
       '/programs/' + p.slug + '/']
    );
    await query(
      `UPDATE programs SET launch_config = $1 WHERE slug = $2 AND launch_config IS NULL`,
      [JSON.stringify({
        seriesName: p.title,
        tallyFormUrl: null, // pending - needs a real Tally form, same as every other program launch
        mode: 'offline',
        rollPrefix: 'SHAURYA',
        waGroupUrl: null,
        lastTestDate: 'To be announced - notified via email & WhatsApp',
        centre: shauryaCentre,
        batch: {
          startDate: 'September 2026',
          timings: 'To be announced',
          seatCap: 200,
          educators: shauryaEducators,
          contentHours: p.materialTracks.includes('technical-degree') ? shauryaContentHoursDegree : shauryaContentHoursDiploma,
          materialTracks: p.materialTracks,
          syllabusUrl: shauryaSyllabusUrl,
        },
      }), p.slug]
    );
  }
  console.log('✅ Seeded/updated 6 शौर्य Batch - RSSB JE 2026 options');

  /* ── शौर्य Batch bundling revert (2026-08-19): the seed loop above only
     writes launch_config the FIRST time (WHERE launch_config IS NULL), so
     removing bundledTestSeriesSlug from the seed data above did nothing
     for the 6 rows already live since 2026-08-17 - they still carry the
     old bundled config. Explicit unconditional correction, once: strip
     the bundle field and restore the standalone lastTestDate wording on
     every शौर्य Batch row that still has one. jsonb `-` (minus) removes a
     key outright rather than leaving it set to null. ── */
  await query(
    `UPDATE programs
     SET launch_config = jsonb_set(launch_config, '{batch}', (launch_config->'batch') - 'bundledTestSeriesSlug')
     WHERE slug LIKE 'rssb-je-2026-shaurya-batch-%' AND launch_config->'batch' ? 'bundledTestSeriesSlug'`
  );
  await query(
    `UPDATE programs
     SET launch_config = jsonb_set(launch_config, '{lastTestDate}', '"To be announced - notified via email & WhatsApp"')
     WHERE slug LIKE 'rssb-je-2026-shaurya-batch-%' AND launch_config->>'lastTestDate' LIKE 'See the bundled Test Series%'`
  );

  /* ── Cancel any bundle-linked enrollment rows the old (removed)
     linkBundledTestSeries() already created (payment.js) - those are
     phantom amount-0 enrollments in rssb-jen-degree/diploma-test-series
     with a deterministic "<original order id>-bundle" order_id, standing
     in for a connection that turned out not to exist. Only cancel ones
     nobody has actually used yet (form never submitted, no admit-card
     activity) - if a learner already went through that Tally form and
     has a real (or pending) admit card on this row, leave it completely
     alone; cancelling it would destroy data a real person is depending
     on, which is worse than the phantom row itself. ── */
  const cancelledBundles = await query(
    `UPDATE enrollments SET status = 'cancelled'
     WHERE order_id LIKE '%-bundle' AND amount = 0 AND status = 'paid'
       AND program_slug IN ('rssb-jen-degree-test-series', 'rssb-jen-diploma-test-series')
       AND form_used = FALSE AND admit_card_status = 'none'
     RETURNING id`
  );
  if (cancelledBundles.rows.length) {
    console.log(`✅ Cancelled ${cancelledBundles.rows.length} unused शौर्य Batch bundle-linked enrollment(s)`);
  }

  /* ── Same revert, for the FAQ text: "Do I get an admit card / ID?" used
     to promise the (now-removed) bundled Test Series admit card doubling
     as the classroom ID - faqs only ever gets set once (COALESCE guard in
     the seed loop above), so this corrects the already-live wrong answer
     on all 6 rows, once, by overwriting the whole array with the current
     shauryaFaqs (already has the corrected wording above). Simple full
     overwrite rather than editing one element in place - much lower risk
     of a bad migrate() at boot than in-place JSONB array surgery. ── */
  await query(
    `UPDATE programs SET faqs = $1
     WHERE slug LIKE 'rssb-je-2026-shaurya-batch-%'
       AND faqs::text LIKE '%doubles as your classroom attendance ID, so you only need to carry one%'`,
    [JSON.stringify(shauryaFaqs)]
  );

  /* ── शौर्य Batch Diploma hours correction (2026-08-17): Diploma technical
     teaching is 350hrs, not 500hrs like Degree (450hrs total for Complete
     Diploma, not 600hrs) - the seed loop above only writes short_desc/
     launch_config the FIRST time (COALESCE / IS NULL guards, so admin
     edits always win over a re-seed), which means it can't fix a value
     that's already live from before this correction. This explicitly
     overwrites the two Diploma-track rows unconditionally, once. ── */
  await query(
    `UPDATE programs SET short_desc = $1 WHERE slug = 'rssb-je-2026-shaurya-batch-complete-diploma'`,
    ['Technical + Non-Technical live classroom teaching (450 hrs) at our Jaipur centre, plus the full RSSB JE Diploma Test Series - everything in one batch.']
  );
  await query(
    `UPDATE programs SET short_desc = $1 WHERE slug = 'rssb-je-2026-shaurya-batch-technical-test-series-diploma'`,
    ['350 hrs of live Diploma-level Technical classroom teaching at our Jaipur centre, plus the full RSSB JE Diploma Test Series.']
  );
  for (const slug of ['rssb-je-2026-shaurya-batch-complete-diploma', 'rssb-je-2026-shaurya-batch-technical-test-series-diploma']) {
    await query(
      `UPDATE programs SET launch_config = jsonb_set(launch_config, '{batch,contentHours}', $1::jsonb)
       WHERE slug = $2 AND launch_config IS NOT NULL`,
      [JSON.stringify({ technical: 350, nonTechnical: 100 }), slug]
    );
  }

  /* ── शौर्य Batch "Non-Technical + Test Series" - drop the Diploma-specific
     wording (2026-08-17, predates the 2026-08-19 bundling revert above):
     Non-Technical/GK content and marks weightage are identical for Degree
     and Diploma, so copy calling out "Diploma Test Series" specifically
     was misleading a Degree candidate into thinking this option didn't
     apply to them - only the customer-facing wording changes here, track-
     neutrally. Explicit unconditional UPDATE since short_desc is already
     live from before this correction. ── */
  await query(
    `UPDATE programs SET short_desc = $1 WHERE slug = 'rssb-je-2026-shaurya-batch-non-technical-test-series'`,
    ['100 hrs of live Non-Technical (Rajasthan GK, History, Art & Culture, Political & Administrative System) classroom teaching, plus the RSSB JE Test Series - GK content is identical for Degree and Diploma.']
  );

  /* ── शौर्य Offline Test Series - RSSB JE 2026 (2026-08-26): a new,
     separate offline test series - NOT the same product as the existing
     rssb-jen-degree-test-series/rssb-jen-diploma-test-series (different
     name, different start date 30 Sep 2026, different complete schedule).
     Both stay live in parallel - existing enrollees are mid-schedule on
     the old one.

     Location-tiered pricing (Jaipur/Delhi cheaper than other Rajasthan
     centres) was originally modelled as 4 separate program rows (2
     tracks x 2 price tiers) to avoid touching payment.js's pricing logic
     at all. Reverted 2026-08-27 per explicit product direction: only 2
     pages/programs total, and the learner picks their centre on the
     checkout page itself (not before it, on the program page). This
     needs genuine server-side tiered pricing - see `programs.
     pricing_tiers` below and create-order's resolveTierPrice() in
     payment.js, which always computes the real charge from the DB, never
     trusts a client-supplied amount, exactly like every other program's
     single fixed price. The 2 "-other-centres" rows created under the
     old 4-row design are retired (is_visible = FALSE, not deleted - they
     were already live for about a day, so any enrollment that happened
     to reference one keeps working). ── */
  await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS pricing_tiers JSONB`);
  await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS centre_tier VARCHAR(30)`);

  const shauryaOfflineLaunches = [
    {
      slug: 'shaurya-offline-rssb-je-2026-degree',
      title: 'शौर्य Offline Test Series - RSSB JE 2026 (Degree)',
      level: 'Degree (Civil)', price: 1600, mrp: 3200, sort_order: 30,
      short_name: 'शौर्य Offline Test Series - Degree',
      tags: ['Subject-wise Mock Tests', 'Full-length Mock Papers', 'Post-test Expert Review', 'Score Tracking & Analysis'],
      tiers: {
        jaipur: { label: 'Jaipur',                    price: 1600, mrp: 3200 },
        delhi:  { label: 'Delhi',                      price: 1600, mrp: 3200 },
        other:  { label: 'Other Rajasthan Centre',     price: 1999, mrp: 3998 },
      },
    },
    {
      slug: 'shaurya-offline-rssb-je-2026-diploma',
      title: 'शौर्य Offline Test Series - RSSB JE 2026 (Diploma)',
      level: 'Diploma (Civil)', price: 1400, mrp: 2800, sort_order: 31,
      short_name: 'शौर्य Offline Test Series - Diploma',
      tags: ['Subject-wise Mock Tests', 'Full-length Mock Papers', 'Post-test Expert Review', 'Score Tracking & Analysis'],
      tiers: {
        jaipur: { label: 'Jaipur',                    price: 1400, mrp: 2800 },
        delhi:  { label: 'Delhi',                      price: 1400, mrp: 2800 },
        other:  { label: 'Other Rajasthan Centre',     price: 1999, mrp: 3998 },
      },
    },
  ];
  for (const p of shauryaOfflineLaunches) {
    const isDegree = p.slug.includes('degree');
    await query(
      `INSERT INTO programs (slug, title, category, exam, level, status, price, mrp, pricing_tiers, accent, icon_class, thumbnail_url, short_name, sort_order, omr_enabled, total_tests, tags, is_visible, detail_url)
       VALUES ($1,$2,'test-series','RSSB JE 2026',$3,'enrolling',$4,$5,$6,'teal',$7,'/assets/images/thumb-rssb-je-test-series.jpg?v=2',$8,$9,FALSE,$10,$11,TRUE,$12)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.title, p.level, p.price, p.mrp, JSON.stringify(p.tiers), isDegree ? 'fa-clipboard-check' : 'fa-clipboard-list',
       p.short_name, p.sort_order, isDegree ? 24 : 22, JSON.stringify(p.tags), '/programs/' + p.slug + '/']
    );
    // Explicit unconditional correction - this program already went live
    // (pre-2026-08-27) without pricing_tiers/tags, and with an earlier,
    // longer title ("... - Jaipur/Delhi"), so the IS NULL-guarded/
    // ON CONFLICT DO NOTHING INSERT above alone won't retroactively fix
    // any of that on the existing row.
    await query(`UPDATE programs SET pricing_tiers = $1, tags = $2, title = $3 WHERE slug = $4`, [JSON.stringify(p.tiers), JSON.stringify(p.tags), p.title, p.slug]);
    await query(
      `UPDATE programs SET launch_config = $1 WHERE slug = $2 AND launch_config IS NULL`,
      [JSON.stringify({
        seriesName: isDegree ? 'शौर्य Offline Test Series - RSSB JE 2026 (Degree)' : 'शौर्य Offline Test Series - RSSB JE 2026 (Diploma)',
        tallyFormUrl: null, // pending - one real Tally form per track (Degree/Diploma)
        mode: 'offline',
        rollPrefix: isDegree ? 'SHDEG' : 'SHDIP',
        waGroupUrl: null,
        lastTestDate: isDegree ? '7 February 2027 (Test-24)' : '24 January 2027 (Test-22)',
        centre: null, // varies per learner - collected via the Tally form's centre field, same as the existing offline RSSB product
      }), p.slug]
    );
  }
  console.log('✅ Seeded/updated 2 शौर्य Offline Test Series - RSSB JE 2026 rows (Degree/Diploma), tiered pricing by centre');

  // Retire the 2 "-other-centres" rows from the old 4-row design - hidden,
  // not deleted, since they were live for about a day before this revert.
  await query(
    `UPDATE programs SET is_visible = FALSE
     WHERE slug IN ('shaurya-offline-rssb-je-2026-degree-other-centres', 'shaurya-offline-rssb-je-2026-diploma-other-centres')`
  );

  /* ── शौर्य Offline Test Series real Tally forms wired 2026-08-27 - one
     form per track, covering every centre/price tier a learner might
     pick at checkout (the form itself asks which centre they attended).
     Explicit unconditional jsonb_set, not an IS NULL guard, since
     launch_config is already set (from the seed above) - only
     tallyFormUrl itself needs correcting, once. ── */
  await query(
    `UPDATE programs SET launch_config = jsonb_set(launch_config, '{tallyFormUrl}', '"https://tally.so/r/PdJ20x"')
     WHERE slug = 'shaurya-offline-rssb-je-2026-degree'`
  );
  await query(
    `UPDATE programs SET launch_config = jsonb_set(launch_config, '{tallyFormUrl}', '"https://tally.so/r/44V1j5"')
     WHERE slug = 'shaurya-offline-rssb-je-2026-diploma'`
  );
  console.log('✅ Wired real Tally forms for शौर्य Offline Test Series (Degree + Diploma)');

  /* ── RVUNL JE 2026 (Electrical/Mechanical/Civil): real Tally forms wired
     2026-08-10 - single fixed centre (Jaipur) per program, per explicit
     product decision (not learner-selectable across Jaipur/Bikaner/Kota -
     the generic webhook only supports one centre per program; the "which
     of the 3 active cities" question was deliberately deferred, not an
     oversight). Only sets launch_config the first time so a later
     admin-panel edit always wins. ── */
  const rvunlCentre = {
    name: 'Jaipur',
    address: 'Exact venue shared via WhatsApp before your first test date',
    mapsLink: 'https://wa.me/919829133317',
  };
  const rvunlLaunches = [
    ['rvunl-je-2026-jaspalsirki-testseries-electrical', 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Electrical', 'https://tally.so/r/5B0brE', 'RVNLEE'],
    ['rvunl-je-2026-jaspalsirki-testseries-mechanical', 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Mechanical', 'https://tally.so/r/yPAMrB', 'RVNLME'],
    ['rvunl-je-2026-jaspalsirki-testseries-civil', 'RVUNL JE 2026 - Jaspal Sir Ki Test Series - Civil', 'https://tally.so/r/dWGEoq', 'RVNLCE'],
  ];
  for (const [slug, seriesName, tallyFormUrl, rollPrefix] of rvunlLaunches) {
    await query(
      `UPDATE programs SET launch_config = $1 WHERE slug = $2 AND launch_config IS NULL`,
      [JSON.stringify({
        seriesName,
        tallyFormUrl,
        mode: 'offline',
        rollPrefix,
        waGroupUrl: null,
        lastTestDate: 'Released weekly - see full schedule on the program page',
        centre: rvunlCentre,
      }), slug]
    );
  }

  /* ── BPSC Bihar Sanitary Officer 2026 (Offline + Printed OMR): real
     Tally forms wired 2026-08-11. Offline uses a single fixed centre
     (Patna) per the same "single centre" decision as RVUNL - Patna is
     the exam's home state, so it's the default primary city; the OMR
     variant is printed OMR offline and needs no centre at all. Only sets
     launch_config the first time so a later admin-panel edit wins. ── */
  await query(
    `UPDATE programs SET launch_config = $1
     WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-offline' AND launch_config IS NULL`,
    [JSON.stringify({
      seriesName: 'BPSC Bihar Sanitary Officer 2026 (Offline)',
      tallyFormUrl: 'https://tally.so/r/7R0qy9',
      mode: 'offline',
      rollPrefix: 'BPSCOF',
      waGroupUrl: null,
      lastTestDate: 'Tentative start September 2026 - see full schedule on the program page',
      centre: {
        name: 'Patna',
        address: 'Exact venue shared via WhatsApp before your first test date',
        mapsLink: 'https://wa.me/919829133317',
      },
    })]
  );
  await query(
    `UPDATE programs SET launch_config = $1
     WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr' AND launch_config IS NULL`,
    [JSON.stringify({
      seriesName: 'BPSC Bihar Sanitary Officer 2026 (Printed OMR Offline)',
      tallyFormUrl: 'https://tally.so/r/RGexql',
      mode: 'home',
      rollPrefix: 'BPSCOM',
      waGroupUrl: null,
      lastTestDate: 'Tentative start September 2026 - see full schedule on the program page',
      centre: null,
    })]
  );
  await query(
    `UPDATE programs SET launch_config = jsonb_set(launch_config, '{seriesName}', '"BPSC Bihar Sanitary Officer 2026 (Printed OMR Offline)"')
     WHERE slug = 'bpsc-sanitary-officer-2026-jaspalsirki-testseries-omr' AND launch_config->>'seriesName' LIKE '%Home%'`
  );

  /* ── RPSC AE 2024 Interview Guidance: relaunched 2026-08-11 - was
     is_visible = FALSE in production (hidden from the public /api/programs
     listing, which meant the homepage/listing sync script was actively
     deleting its hardcoded card on every page load even though the static
     HTML said "Enrolling Now"). Checkout/pricing were already correct -
     only visibility was wrong. ── */
  await query(`UPDATE programs SET is_visible = TRUE WHERE slug = 'rpsc-ae-interview'`);

  /* ── UP Polytechnic roll-number backfill (2026-08-15): learners who
     paid before/without submitting the post-payment Tally details form
     have no roll_number yet and nothing to show in "My Programs" -
     admin wants every paid learner to have one now, on priority,
     rather than waiting on each person's own form submission. Scoped
     to this one program (not a global backfill) because the live Tally
     webhook (routes/tally-generic.js) now reuses roll_number if one is
     already set instead of overwriting it - see the change there - so
     a number assigned here stays stable even after the learner later
     fills the form. Runs on every boot but only touches rows still
     missing one, so it's a no-op once everyone has caught up. Format
     matches the shared generateRollNumber() in utils/rollNumber.js;
     the DB's partial unique index on roll_number (see ALTER TABLE
     above) is the actual overlap guarantee. ── */
  const rollBackfillRows = await query(
    `SELECT id FROM enrollments
     WHERE status = 'paid' AND refund_status != 'initiated' AND roll_number IS NULL
       AND program_slug = 'up-polytechnic-lecturer-jaspalsirki-testseries-civil-omr'`
  );
  for (const row of rollBackfillRows.rows) {
    let rollNumber = null;
    for (let i = 0; i < 10; i++) {
      const candidate = `UPPOLY-${Math.floor(10000 + Math.random() * 90000)}`;
      const exists = await query('SELECT 1 FROM enrollments WHERE roll_number = $1', [candidate]);
      if (!exists.rows.length) { rollNumber = candidate; break; }
    }
    if (!rollNumber) continue;
    await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2 AND roll_number IS NULL', [rollNumber, row.id]);
  }

  /* ── General roll-number backfill, all programs (2026-08-16): roll
     numbers are now assigned instantly at purchase (onEnrollmentPaid in
     routes/payment.js), for every program, not just UP Polytechnic - the
     block above is now a harmless subset of this one and left in place
     rather than removed. This covers every already-paid enrollment that
     predates that change, across RSSB/ESE/generic alike.

     KNOWN_ROLL_NUMBERS lets the site owner supply the *real* already-
     issued number for specific enrollments the system itself could never
     recover - most notably the RSSB printed OMR offline flow, which used to
     generate and email a roll number without ever saving it (fixed in
     routes/tally-omr-shared.js, but that fix can't retroactively recall
     what a past email already said). Keyed by order_id so it survives
     even if a row's other identifying fields change. Anything not listed
     here gets a fresh auto-generated number - which is fine for RSSB
     offline/ESE/generic enrollments, since those flows' roll numbers were
     always persisted, so any that are still NULL genuinely never had one
     issued at all. ── */
  const KNOWN_ROLL_NUMBERS = {
    // 'order_xxxxxxxxxxxx': 'OMR-DEG-12345',
  };
  for (const [orderId, knownRoll] of Object.entries(KNOWN_ROLL_NUMBERS)) {
    await query(
      `UPDATE enrollments SET roll_number = $1 WHERE order_id = $2 AND roll_number IS NULL`,
      [knownRoll, orderId]
    );
  }

  // The actual per-row backfill loop runs AFTER the server starts listening
  // (see backfillMissingRollNumbers, called near app.listen below) instead
  // of here - a large legacy backlog would otherwise serially query the DB
  // once per row before migrate() resolves, and app.listen() is gated on
  // migrate() finishing, delaying the whole site coming back up after
  // every deploy for no reason a paying learner would ever notice.

  /* ── Independence Day Freedom Sale (2026-08-15 only): FREEDOM15 gives a
     genuine 15%-off-anything coupon, which needed a new coupon `type`
     ('percent_discount') since the existing types are all fixed-rupee or
     per-program price maps - see applyCoupon() in routes/payment.js.
     program_slugs = NULL means no scope restriction (every program).
     expires_at is 23:59:59 IST on 2026-08-15 (= 18:29:59 UTC same day) -
     applyCoupon() already rejects any coupon past its expires_at, so this
     switches itself off with no follow-up action needed tomorrow. The
     "no other coupon, no referral, today" half of the rule lives in
     payment.js (isFreedomSaleDay() gate), not here - this row only
     defines what FREEDOM15 itself does. DO UPDATE (not DO NOTHING) since
     this needs to stay correct across any redeploy today. ── */
  await query(
    `INSERT INTO coupons (code, type, discount_amount, program_prices, program_slugs, max_uses, exclusive, is_active, label, expires_at)
     VALUES ('FREEDOM15', 'percent_discount', 15, NULL, NULL, NULL, TRUE, TRUE, 'Independence Day Sale - Flat 15% Off', '2026-08-15T18:29:59Z')
     ON CONFLICT (code) DO UPDATE SET
       type = EXCLUDED.type, discount_amount = EXCLUDED.discount_amount, program_prices = EXCLUDED.program_prices,
       program_slugs = EXCLUDED.program_slugs, max_uses = EXCLUDED.max_uses, exclusive = EXCLUDED.exclusive,
       is_active = TRUE, label = EXCLUDED.label, expires_at = EXCLUDED.expires_at, updated_at = NOW()`
  );

  /* ── Seed second admin user from env var (never hardcode passwords) ── */
  {
    const bcrypt = require('bcryptjs');
    const secondAdminEmail    = process.env.SECOND_ADMIN_EMAIL;
    const secondAdminPassword = process.env.SECOND_ADMIN_PASSWORD;
    if (secondAdminEmail && secondAdminPassword) {
      const existing = await query('SELECT id FROM admin_users WHERE email = $1', [secondAdminEmail]);
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(secondAdminPassword, 12);
        await query(
          'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
          [secondAdminEmail, hash]
        );
        console.log('✅ Seeded second admin: ' + secondAdminEmail);
      }
    }
  }

  console.log('✅ Migration: enrollments, leads, events, programs, banners ensured');
}

/* ── Daily referral payout digest (6 PM IST, ahead of the 10 PM payout cutoff) ── */
let referralDigestSentDate = null;

async function checkReferralDigest() {
  try {
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC -> IST
    const todayIST = istNow.toISOString().slice(0, 10);
    if (istNow.getUTCHours() !== 18 || referralDigestSentDate === todayIST) return;

    const result = await query(
      `SELECT rc.amount, rc.created_at, ref.student_name AS referrer_name, ref.student_phone AS referrer_phone, red.student_name AS referred_name
       FROM referral_credits rc
       JOIN enrollments ref ON ref.order_id = rc.referrer_order_id
       JOIN enrollments red ON red.order_id = rc.referred_order_id
       WHERE rc.status = 'pending'
       ORDER BY rc.created_at ASC`
    );
    referralDigestSentDate = todayIST; // mark sent even if zero rows, so we don't re-check all day
    if (!result.rows.length) return;

    const { sendReferralPayoutDigestEmail } = require('./services/paymentEmailService');
    await sendReferralPayoutDigestEmail(result.rows);
    console.log(`[referral-digest] Sent digest for ${result.rows.length} pending payout(s)`);
  } catch (err) {
    console.error('[referral-digest] Error:', err.message);
  }
}

/* ── Daily admit-card approvals digest (10 PM IST, matching the owner's
   own daily review habit - reviews the queue every evening around then).
   Independent gate on the same 15-min interval tick as the referral
   payout digest above, just a different hour. Mirrors checkReferralDigest
   above otherwise. ── */
let admitCardDigestSentDate = null;

async function checkAdmitCardDigest() {
  try {
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC -> IST
    const todayIST = istNow.toISOString().slice(0, 10);
    if (istNow.getUTCHours() !== 22 || admitCardDigestSentDate === todayIST) return;

    // Rejected rows (email/phone mismatch at submission) get no email to
    // anyone - the learner sees the reason on their own profile, but
    // nothing ever surfaced them to admin, so a validation problem could
    // sit unnoticed indefinitely. Including them here (separately from
    // pending) is the only proactive notice admin gets.
    const result = await query(
      `SELECT student_name, student_phone, program_name, roll_number, admit_card_status, admit_card_rejection_reason
       FROM enrollments
       WHERE admit_card_status IN ('pending', 'rejected')
       ORDER BY admit_card_status ASC, admit_card_submitted_at ASC`
    );
    admitCardDigestSentDate = todayIST; // mark sent even if zero rows, so we don't re-check all day
    if (!result.rows.length) return;

    const { sendAdmitCardDigestEmail } = require('./services/paymentEmailService');
    await sendAdmitCardDigestEmail(result.rows);
    console.log(`[admit-card-digest] Sent digest for ${result.rows.length} card(s) needing attention`);
  } catch (err) {
    console.error('[admit-card-digest] Error:', err.message);
  }
}

/* ── Backfill roll numbers for already-paid enrollments that predate
   instant-at-purchase assignment (onEnrollmentPaid in routes/payment.js),
   across every program. Runs after the server is already listening (not
   inside migrate()) so a large legacy backlog never delays the site
   coming back up after a deploy - each row still gets a fresh query/write,
   but that work no longer blocks the first HTTP request from being
   served. ── */
async function backfillMissingRollNumbers() {
  try {
    const rows = await query(
      `SELECT id, program_slug FROM enrollments
       WHERE status = 'paid' AND refund_status != 'initiated' AND roll_number IS NULL`
    );
    for (const row of rows.rows) {
      try {
        const prefix = await resolveRollNumberPrefix(row.program_slug);
        let rollNumber;
        if (typeof prefix === 'object' && prefix !== null) {
          const [degree, diploma] = await Promise.all([
            generateRollNumber(prefix.degree),
            generateRollNumber(prefix.diploma),
          ]);
          rollNumber = `${degree}|${diploma}`;
        } else {
          rollNumber = await generateRollNumber(prefix);
        }
        await query('UPDATE enrollments SET roll_number = $1 WHERE id = $2 AND roll_number IS NULL', [rollNumber, row.id]);
      } catch (err) {
        console.error(`[roll-number-backfill] failed for enrollment ${row.id}:`, err.message);
      }
    }
    if (rows.rows.length) console.log(`[roll-number-backfill] Assigned roll numbers for ${rows.rows.length} enrollment(s)`);
  } catch (err) {
    console.error('[roll-number-backfill] Error:', err.message);
  }
}

migrate()
  .catch(err => console.warn('⚠️  Migration warning:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n✅ jaspalsingh.in API running on port ${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
      setInterval(checkReferralDigest, 15 * 60 * 1000); // check every 15 min, fires once at 6 PM IST
      checkReferralDigest();
      setInterval(checkAdmitCardDigest, 15 * 60 * 1000);
      checkAdmitCardDigest();
      backfillMissingRollNumbers();
    });
  });

module.exports = app;

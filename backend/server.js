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
/* Tally webhook routes are registered above (before express.json()) so
   verifyTallySignature can see the raw body - do not re-register here. */
app.use('/api/omr-check',        require('./routes/omr-check'));
app.use('/api/free-resources',   require('./routes/free-resources'));

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
       'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Degree (Home-Based OMR Test Series)',
       'test-series','RSSB JE 2026','Degree (Civil)','enrolling',1999,2999,'purple',6,
       '/programs/rssb-je-jaspalsirki-testseries-degree-civil-omr/',TRUE),
      ('rssb-jen-omr-diploma-test-series',
       'RSSB JE 2026 - Jaspal Sir Ki Test Series - Civil Diploma (Home-Based OMR Test Series)',
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

migrate()
  .catch(err => console.warn('⚠️  Migration warning:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n✅ jaspalsingh.in API running on port ${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
      setInterval(checkReferralDigest, 15 * 60 * 1000); // check every 15 min, fires once at 6 PM IST
      checkReferralDigest();
    });
  });

module.exports = app;

-- ============================================================
-- schema.sql — PostgreSQL Database Schema
-- Dr. Jaspal Singh Website — jaspalsingh.in
--
-- Safe to run multiple times (idempotent).
-- Paste into Supabase SQL Editor and click Run.
-- ============================================================


-- ── Shared trigger function ───────────────────────────────────
-- Called by resources and blog_posts to auto-update updated_at.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── Admin Users ───────────────────────────────────────────────
-- Single admin account for Dr. Jaspal Singh.
-- Created via: cd backend && node seed.js

CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ── Resources (Study Material) ───────────────────────────────
-- Stores PDFs and notes uploaded to Cloudinary.
-- subject options : Environmental Engineering, Geotechnical Engineering,
--                   Engineering Hydrology, Irrigation Engineering,
--                   Fluid Mechanics, Structural Analysis,
--                   RCC & Steel Design, Transportation Engineering,
--                   Surveying, Other Civil Subjects
-- resource_type   : Notes, Formula Book, Strategy Guide, PYQ,
--                   Exam Update, Handwritten Notes
-- exam_tag        : ESE, GATE, General

CREATE TABLE IF NOT EXISTS resources (
  id             SERIAL PRIMARY KEY,
  title          VARCHAR(500) NOT NULL,
  subject        VARCHAR(150) NOT NULL,
  resource_type  VARCHAR(100) NOT NULL,
  exam_tag       VARCHAR(50)  NOT NULL DEFAULT 'General',
  description    TEXT,
  file_url       VARCHAR(1000),
  file_public_id VARCHAR(500),
  file_size      VARCHAR(50),
  download_count INTEGER NOT NULL DEFAULT 0,
  is_visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS resources_updated_at ON resources;

CREATE TRIGGER resources_updated_at
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_resources_subject   ON resources(subject);
CREATE INDEX IF NOT EXISTS idx_resources_type      ON resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_exam      ON resources(exam_tag);
CREATE INDEX IF NOT EXISTS idx_resources_visible   ON resources(is_visible);
CREATE INDEX IF NOT EXISTS idx_resources_downloads ON resources(download_count DESC);


-- ── Blog Posts ───────────────────────────────────────────────
-- Rich-text posts written in the admin panel using Quill.js.
-- category options: exam-updates, subject-tips, strategy,
--                   student-stories, personal-notes

CREATE TABLE IF NOT EXISTS blog_posts (
  id                    SERIAL PRIMARY KEY,
  title                 VARCHAR(500) NOT NULL,
  slug                  VARCHAR(600) UNIQUE NOT NULL,
  content               TEXT NOT NULL,
  excerpt               TEXT,
  category              VARCHAR(100) NOT NULL,
  cover_image_url       VARCHAR(1000),
  cover_image_public_id VARCHAR(500),
  is_published          BOOLEAN NOT NULL DEFAULT FALSE,
  published_at          TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS blog_updated_at ON blog_posts;

CREATE TRIGGER blog_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(is_published);
CREATE INDEX IF NOT EXISTS idx_blog_category  ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_slug      ON blog_posts(slug);


-- ── Testimonials ─────────────────────────────────────────────
-- Student success stories shown on the testimonials page.
-- exam_type: ESE, GATE, General

CREATE TABLE IF NOT EXISTS testimonials (
  id              SERIAL PRIMARY KEY,
  student_name    VARCHAR(255) NOT NULL,
  exam_type       VARCHAR(50)  NOT NULL,
  exam_year       VARCHAR(10),
  rank_or_result  VARCHAR(255),
  quote           TEXT NOT NULL,
  photo_url       VARCHAR(1000),
  photo_public_id VARCHAR(500),
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testi_visible  ON testimonials(is_visible);
CREATE INDEX IF NOT EXISTS idx_testi_exam     ON testimonials(exam_type);
CREATE INDEX IF NOT EXISTS idx_testi_featured ON testimonials(is_featured);


-- ── Contact Messages ─────────────────────────────────────────
-- Submissions from the Connect page and Strategy Maker form.

CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  subject    VARCHAR(300),
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_read ON contact_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_contact_date ON contact_messages(created_at DESC);


-- ── Learners (Student Accounts) ──────────────────────────────
-- Free accounts that students create to download resources.
-- target_exam: GATE, ESE, SSC JE, State AE/JE, General

CREATE TABLE IF NOT EXISTS learners (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  target_exam     VARCHAR(50) DEFAULT 'General',
  phone           VARCHAR(20),
  notify_strategy BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_learners_email  ON learners(email);
CREATE INDEX IF NOT EXISTS idx_learners_exam   ON learners(target_exam);
CREATE INDEX IF NOT EXISTS idx_learners_active ON learners(is_active);


-- ── Learner Download History ─────────────────────────────────
-- Tracks which learner downloaded which resource.
-- One row per learner-resource pair (unique constraint prevents duplicates).

CREATE TABLE IF NOT EXISTS learner_downloads (
  id            SERIAL PRIMARY KEY,
  learner_id    INTEGER NOT NULL REFERENCES learners(id)  ON DELETE CASCADE,
  resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(learner_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ldl_learner  ON learner_downloads(learner_id);
CREATE INDEX IF NOT EXISTS idx_ldl_resource ON learner_downloads(resource_id);
CREATE INDEX IF NOT EXISTS idx_ldl_date     ON learner_downloads(downloaded_at DESC);


-- ── Download Events (time-series analytics) ──────────────────
-- Every download is logged here regardless of learner login status.
-- Separate from resources.download_count (which is a running total).
-- Used to generate per-day charts in the admin analytics dashboard.

CREATE TABLE IF NOT EXISTS download_events (
  id            SERIAL PRIMARY KEY,
  resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  learner_id    INTEGER REFERENCES learners(id) ON DELETE SET NULL,
  downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_resource ON download_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_dev_learner  ON download_events(learner_id);
CREATE INDEX IF NOT EXISTS idx_dev_date     ON download_events(downloaded_at DESC);


-- ── Done ─────────────────────────────────────────────────────
SELECT 'Schema applied successfully — jaspalsingh.in' AS status;

-- Migration: add pdf_url to blog_posts
-- Run once against the production database on Render.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(1000);

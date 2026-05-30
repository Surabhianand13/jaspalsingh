# CLAUDE.md — jaspalsingh.in Project Instructions

## Deployment

**Never use localhost.** This site is live on:

- **Frontend** → Vercel (auto-deploys from `main` branch)
- **Backend** → Render (auto-deploys from `main` branch)
- **GitHub repo** → https://github.com/Surabhianand13/jaspalsingh

To deploy any change: commit → merge to `main` → `git push origin main`.
Both Vercel and Render pick it up automatically within ~1-2 minutes.
Always verify changes on **jaspalsingh.in**, not localhost.

## Project Structure

- `frontend/` — HTML/CSS/JS pages served by Vercel
- `backend/` — Node.js + Express API served by Render
- `images/` — Static images (banners etc.) served by Express at `/images/`

## Writing Style Rules

- **Never use em dashes (—)** anywhere — in HTML, JS, blog content, comments, or any other file
- Use ` - ` (space-hyphen-space) instead
- This applies to all future code, content, and blog posts written by Claude

## Blog Post Page (`/blog-post`)

- **No author strip** inside the article — do not add it back
- **No share buttons** (WhatsApp / Telegram / Copy Link) — do not add them back
- **No "About the Author" sidebar card** — sidebar only shows the Offline Programs CTA card
- Blog posts are hidden from nav/footer (unlisted) but indexable by Google via sitemap
- Admin credentials: email `biz@solvvai.com` — stored in Render env vars

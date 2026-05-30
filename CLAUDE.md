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

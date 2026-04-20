# Dr. Jaspal Singh — Personal Website
**jaspalsingh.in** · Personal brand hub and free study resource library for GATE & UPSC ESE aspirants.

---

## Project Structure

```
jaspalsingh/
├── frontend/                  ← All HTML, CSS, JS pages
│   ├── index.html             ← Homepage
│   ├── about.html             ← About page (Phase 2)
│   ├── resources.html         ← Free resources library (Phase 2)
│   ├── strategy.html          ← Exam strategy page (Phase 2)
│   ├── blog.html              ← Blog / updates (Phase 2)
│   ├── testimonials.html      ← Student testimonials (Phase 2)
│   ├── connect.html           ← Connect page (Phase 2)
│   ├── css/
│   │   ├── style.css          ← Global styles, header, footer, buttons
│   │   └── home.css           ← Homepage-specific styles
│   ├── js/
│   │   ├── main.js            ← Global JS (sticky header, mobile menu)
│   │   └── home.js            ← Homepage JS (stat counters, animations)
│   └── assets/
│       └── images/
│           └── jaspal-hero.png  ← REPLACE with actual photo
│
├── backend/                   ← Node.js + Express (Phase 3+)
│   ├── server.js
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── middleware/
│   └── config/
│
├── uploads/                   ← Temporary local upload staging
├── .env                       ← Your private config (never commit)
├── .env.example               ← Template — safe to commit
├── .gitignore
└── README.md
```

---

## How to Preview the Frontend (Phase 1)

The frontend is plain HTML/CSS/JS — no build step needed.

**Option 1 — VS Code Live Server (recommended):**
1. Install the "Live Server" extension in VS Code
2. Open the `jaspalsingh/` folder in VS Code
3. Right-click `frontend/index.html` → **Open with Live Server**
4. Browser opens at `http://127.0.0.1:5500/frontend/index.html`

**Option 2 — Python simple server:**
```bash
cd jaspalsingh/frontend
python3 -m http.server 5500
# Then open http://localhost:5500 in your browser
```

---

## Adding Dr. Jaspal Singh's Photo

1. Get the high-resolution photo (square crop recommended, min 800×800px)
2. Save it as `frontend/assets/images/jaspal-hero.png`
3. Refresh the browser — it will appear automatically in the hero section

Until the photo is added, the hero circle shows "JS" initials as a styled placeholder.

---

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Project structure + Homepage frontend |
| 2 | ⏳ Next | All remaining frontend pages |
| 3 | — | Backend: Node.js, PostgreSQL, JWT auth |
| 4 | — | Cloudinary file upload system |
| 5 | — | Connect frontend to live backend APIs |
| 6 | — | Admin panel dashboard |
| 7 | — | Download counter & analytics |
| 8 | — | Email notifications via Nodemailer |
| 9 | — | Full SEO: meta, OG, schema, sitemap |
| 10 | — | Testing & performance optimization |
| 11 | — | Deployment: Vercel + Railway + Supabase |

---

## Brand Reference

| Token | Value |
|-------|-------|
| Primary (Magenta) | `#F0345A` |
| Secondary (Sky Blue) | `#67C8E8` |
| Heading text | `#1A1A2E` |
| Body text | `#4A4A68` |
| Background | `#FFFFFF` |
| Alt background | `#F8F8F8` |
| Heading font | Plus Jakarta Sans (800, 700, 600) |
| Body font | Inter (400, 500, 600) |

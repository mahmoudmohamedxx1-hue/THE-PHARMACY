# The Pharmacy — Deployment & Operations Guide

## 1. Opening the Admin Panel

1. Open **`/admin`** on your site (e.g. `https://your-domain.com/admin`)
2. If you are not logged in as an admin you will see an access-restricted screen with a **Login** button
3. Log in with the admin account:

   | Field | Value |
   |---|---|
   | Email | `admin@thepharmacy.com` |
   | Password | `Admin@2026` |

4. After login you are redirected back to the Admin Dashboard (products, orders, revenue, prescriptions, users)

> The admin link is also available from the account dropdown menu (top-left user icon) whenever you are logged in as an admin.

Demo customer account: `demo@thepharmacy.com` / `Demo@2026`

**Change the admin password before going live.** You can do it from the admin panel or with:

```bash
bunx tsx -e "
import { hash } from './src/lib/auth'
console.log(await hash('NEW_PASSWORD'))
" # then update the User row in the database
```

## 2. Pushing to GitHub

**This project is already connected and pushed to:**

> **https://github.com/mahmoudmohamedxx1-hue/THE-PHARMACY** (branch `main`)

Branches on the remote:

| Branch | Contents |
|---|---|
| `main` | **The Pharmacy app** (source, images, db, scripts) — default branch, import this into Vercel |
| `research-data` | The original Chefaa scraping/research data (the old `main`), kept for reference |
| `v0/add-vercel-link` | Old v0 build link (historical) |

Day-to-day workflow after making changes:

```bash
git add -A
git commit -m "Describe what changed"
git push                # origin/main is already set as upstream
```

> When pushing from a new machine you will be asked to log in — use a GitHub **Personal Access Token** (Settings → Developer settings → Tokens) as the password.

If you cloned/copied this folder without git history, start fresh:

```bash
git init
git add -A
git commit -m "The Pharmacy — bilingual AI-powered e-pharmacy"
git branch -M main
git remote add origin https://github.com/mahmoudmohamedxx1-hue/THE-PHARMACY.git
git push -u origin main
```

What gets pushed: source code, `public/images` (product photos, ~18 MB), `db/custom.db` (seeded catalog, ~1 MB), scripts.
What stays out: `node_modules`, `.next`, `.env*`, dev logs (see `.gitignore`).

## 3. Deploying to Vercel

1. Push to GitHub (step 2)
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import **CHEFAA**
3. Framework preset: **Next.js** (auto-detected)
   - Root Directory: `./` (default — leave unchanged)
   - Build Command: leave as default (Next.js handles it)
4. Add the environment variable (Project → Settings → Environment Variables):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (or your custom domain — used for SEO tags, sitemap, link previews) |

   `DATABASE_URL` is **not required** — the app automatically falls back to the committed `db/custom.db`.
5. Deploy, then open the URL Vercel shows in the dashboard (don't guess it — the project name may get a random suffix like `CHEFAA-xxxx`)

### If you saw `404: NOT_FOUND` after importing

That page appears when **no successful deployment exists** for the URL yet — the build had failed. The original cause in this repo was: bun (Vercel's installer, chosen because of `bun.lock`) does not run Prisma's postinstall, so the Prisma client was never generated and `next build` crashed with `Cannot find module '.prisma/client/default'`. This is now fixed (`postinstall: prisma generate` in `package.json`), plus:

- `output: standalone` is auto-disabled on Vercel (it's only for VPS self-hosting)
- `DATABASE_URL` falls back to the committed SQLite file automatically
- the SQLite file + Prisma engine are traced into the serverless functions

After pulling the latest `main`, Vercel rebuilds automatically (or hit **Deployments → ⋯ → Redeploy**). If a build still fails, open the deployment in the dashboard → **Building** log, and the exact error is shown at the bottom.

### AI features on your own hosting

The 3 AI features (Rx OCR, health assistant, interaction checker) call the AI service from the server-side API routes. On this sandbox they work out of the box; on your own Vercel account they need the AI service credentials configured as environment variables — otherwise the rest of the store works fine and the AI endpoints return a friendly error. Contact your AI provider for the key values.

## 4. Opening the preview on v0

The repo is fully standard Next.js — `dev` / `build` / `start` use the plain framework commands, the Prisma client is generated automatically on install (`postinstall`), and the SQLite catalog is committed at `db/custom.db` so **no environment variables are required** to boot the preview.

If v0 shows *"`/vercel/share/v0-runtime/next-adapter.mjs` is missing, Next.js shuts down before rendering"* — that error is inside v0's own preview runtime, not in the app code (the app builds and boots green with the standard `next build` / `next start`). To recover on v0's side:

1. In the v0 project → **Settings → Git** → **Disconnect** the repository, then **Connect** it again (this re-initializes the sandbox runtime)
2. Or open the **Deployments/Preview** list and trigger a fresh build of the latest commit
3. If it still shows the same missing-file error, report it to v0 support — the file lives in their sandbox image, outside the repo

### Self-hosting note

The build uses the same pattern as the other apps in this workspace family (netstream / egxdesk): `output: "standalone"` is always on, and `npm run build` packages a self-contained server at `.next/standalone/` (server.js + static assets + public/ + the SQLite catalog + prisma). Vercel ignores the standalone folder and serves its own output — both platforms work from the exact same build.

```bash
bun install            # or npm install — generates the Prisma client automatically
bun run build          # or npm run build — works for Vercel AND self-hosting
npm run start          # self-host: bun .next/standalone/server.js (port 3000)
```

### Important — SQLite on Vercel

The app currently uses a **SQLite file** (`db/custom.db`) committed to the repo. On Vercel:

- ✅ Browsing, search, AI features, admin login all work (read-only)
- ⚠️ **Writes (placing orders, registering users, admin edits) will NOT persist** — serverless functions have an ephemeral, read-only filesystem. Orders will appear to succeed but won't be saved.

For a real store, pick one:

| Option | Effort | Notes |
|---|---|---|
| **Turso** (libsql) | ~1 hour | SQLite-compatible, free tier, keeps current schema. Best path. |
| **Neon / Supabase** (Postgres) | ~half day | Change Prisma provider to `postgresql`, adjust a few column types. |
| **VPS** (Hetzner/DigitalOcean) | ~1 hour | Run `bun run build && bun run start` behind Caddy/Nginx. SQLite works fully as-is. |

Until then, the Vercel deployment is a fully browsable demo/staging site.

## 4. Local development

```bash
bun install
bun run dev        # http://localhost:3000
bun run lint       # ESLint
```

## 5. PWA (mobile app) verification

- **Android/Chrome**: open the site → browser menu shows "Install app" (or use the in-app "Install App" button in the side menu / footer)
- **iPhone/Safari**: open the site → Share → **Add to Home Screen** → it opens fullscreen like a native app (standalone mode, no browser bar, own splash screen and teal status bar)
- Test offline: load a few pages, enable airplane mode, reopen — visited pages still work (service worker cache)

PWA files: `public/manifest.webmanifest`, `public/sw.js`, icons in `public/icons/`.
Regenerate icons/splash screens: `python3 scripts/gen_pwa_assets.py`

## 6. Shareable links (URL map)

| Page | URL |
|---|---|
| Home | `/` |
| Category | `/category/vitamins` |
| Product | `/product/panadol-advance-500mg-24-tablets` |
| Search | `/search/panadol` |
| Prescription AI | `/prescription` |
| AI Assistant | `/assistant` |
| Interaction checker | `/interactions` |
| Cart / Checkout | `/cart`, `/checkout` |
| Order confirmation | `/order-success/<orderId>` |
| Account pages | `/login`, `/register`, `/orders`, `/account`, `/wishlist` |
| Admin | `/admin` |

Old hash links (`/#/p/<slug>`, `/#/c/<slug>`, …) are automatically redirected to the new clean URLs, so previously shared links keep working.

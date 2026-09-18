# The Pharmacy — Bilingual AI-Powered E-Pharmacy 🇪🇬

A production-grade Egyptian online pharmacy (Chefaa-style) built with **Next.js 16**, **Prisma** and **Tailwind CSS 4**. Arabic-first with full English support (native RTL/LTR), installable as a mobile app (PWA), and every page has its own shareable link.

## Features

- **🛒 Full store** — 496 products / 10 categories / 187 brands with real photos & bilingual descriptions, search with thumbnails, filters, wishlist, cart
- **💊 3 real AI features** — prescription upload with OCR (matches drugs to the catalog), AI health assistant (bilingual chat + product suggestions), drug-interaction checker with severity badges
- **🚚 Egyptian checkout** — 15 delivery zones (30–95 EGP), free shipping over 500 EGP, cash on delivery, order tracking with status timeline
- **📱 PWA app shell** — Add to Home Screen on iOS/Android, opens like a native app (standalone window, splash screens, offline shell)
- **🔗 Shareable deep links** — clean URLs for every category, product and search (`/category/vitamins`, `/product/...`, `/search/...`) with Open Graph + JSON-LD previews
- **🧑‍💼 Admin panel** — revenue stats, order management, stock & price editing, prescription review
- **🌍 Bilingual** — Arabic (default) / English with instant switching, RTL-native layout, Cairo font

## Quick start

```bash
bun install          # or: npm install  (runs `prisma generate` automatically)
bun run dev          # or: npm run dev  -> http://localhost:3000
```

The catalog ships inside the repo (`db/custom.db`), so no extra seeding is needed.

### Accounts

Demo accounts ship with the catalog for local testing — **credentials live in
the private seed script / your deployment secrets, never in this file.**

| Role | Email |
|---|---|
| Admin | `admin@thepharmacy.com` |
| Demo customer | `demo@thepharmacy.com` |

> ⚠️ **Before going live:** log in as admin and rotate the password (or set
> `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars on your deployment) and disable the
> demo account. Never commit real credentials.

### Environment variables

Copy `.env.example` to `.env` if you want to override the defaults. `DATABASE_URL` is optional locally — the app falls back to `db/custom.db` in the repo. Set `NEXT_PUBLIC_SITE_URL` in production for correct SEO tags, sitemap and link previews. Email (Resend) and analytics (GA4 / Meta Pixel) keys are optional — see `.env.example`.

## Testing

```bash
bun run test        # unit tests (bun test) — auth, order logic, zones, rate limiter
bun run test:e2e    # Playwright E2E — needs the app running on :3000 (auto-reuses it)
```

The E2E checkout spec places a real order in the local database — clean it up
afterwards with `bun scripts/clean_test_order.ts TP-XXXXXXXXXX`. CI
(`.github/workflows/ci.yml` — see `docs/ci-workflow.yml.txt` to enable it) runs the unit tests + production build on every push.

## Deploy to Vercel

1. Push this repo to GitHub
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo
3. Framework: **Next.js** (auto-detected) — keep the default build command, root directory `./`
4. Environment variable: `NEXT_PUBLIC_SITE_URL` = your production URL
5. Deploy

> **SQLite note:** browsing, search, AI and admin login work read-only on Vercel; writes (orders, registrations, edits) don't persist on serverless. For a writable production store use [Turso](https://turso.tech) (SQLite-compatible, ~1h migration), Postgres (Neon/Supabase), or a VPS (`bun run build && bun run start`). See `DEPLOY.md`.

## Project structure

```
prisma/schema.prisma     # data model (User, Product, Order, Prescription, ...)
db/custom.db             # seeded SQLite catalog
src/app/                 # one route per page (17 routes) + API handlers
src/components/          # storefront UI (bilingual, RTL-aware)
src/lib/                 # db, auth, i18n, router, cart store, zones
public/images/products/  # 482 real product photos
public/manifest.webmanifest, sw.js, icons/   # PWA app shell
scripts/                 # catalog build / enrichment / maintenance tools
```

## Branches

| Branch | Contents |
|---|---|
| `main` | The Pharmacy application |
| `research-data` | Original Chefaa scraping & research data used to build the catalog |

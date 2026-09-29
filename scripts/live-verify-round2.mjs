#!/usr/bin/env node
/** Round-2 LIVE verification of all fixes on Vercel (as a user, in browser). */
import { chromium } from 'playwright-core'
const BASE = 'https://the-pharmacy-two.vercel.app'
const CHROME = '/home/z/.agent-browser/browsers/chrome-153.0.8010.52/chrome'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const newPage = async (viewport, locale = 'ar-EG') => {
  const ctx = await browser.newContext({ viewport, locale })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 130)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 130)))
  return { ctx, page, errors }
}

// scroll through the page so lazy-loaded images actually load
async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(2000)
}

// 1. Home: new arrivals instead of best sellers
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  const body = await page.evaluate(() => document.body.innerText)
  check('home: New arrivals (وصل حديثاً) present', /وصل حديثاً|New arrivals/.test(body))
  check('home: no Best-sellers claim', !/الأكثر مبيعاً|Best sellers/.test(body))
  check('home: hero 496+', /496/.test(body))
  // scroll through the page first so lazy-loaded images actually load
  await scrollThrough(page)
  const imgs = await page.evaluate(() => [...document.images].map((i) => ({ ok: i.complete && i.naturalWidth > 0 })))
  check('home: no broken images', imgs.every((i) => i.ok), `${imgs.filter((i) => !i.ok).length}/${imgs.length} broken`)
  check('home console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// 2. Category sort: only honest options
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  await page.click('[aria-label*="ترتيب"], [aria-label*="Sort"]').catch(() => {})
  await page.waitForTimeout(700)
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim()))
  check('category: no Most-popular option', !opts.some((o) => /الأكثر شعبية|Most popular/i.test(o || '')), JSON.stringify(opts))
  check('category: no Top-rated option', !opts.some((o) => /الأعلى تقييماً|Top rated/i.test(o || '')))
  check('category: has Newest', opts.some((o) => /الأحدث|Newest/i.test(o || '')))
  await ctx.close()
}

// 3. Product pages: BOM gone, movelex EN
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/product/raw-african-maya-leave-in-and-curly-enhancer', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const bom = await page.evaluate(() => /\ufeff|\u200b/.test(document.body.innerText))
  check('raw-african: no BOM in UI', bom === false)
  await page.goto(BASE + '/product/movelex-cream-120gm', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const en = page.locator('button:has-text("EN")').first()
  if (await en.count()) await en.click().catch(() => {})
  await page.waitForTimeout(1200)
  const txt = await page.evaluate(() => document.body.innerText)
  check('movelex EN: proper English', /Movelex Cream is a topical cream/.test(txt))
  check('movelex EN: no Arabic leak', !/موڤليكس متخصص/.test(txt))
  await ctx.close()
}

// 4. Volume placeholders
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/category/hair-care', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  const body = await page.evaluate(() => document.body.innerText)
  check('hair-care: no Not specified/visible', !/Not specified|Not visible/.test(body))
  await ctx.close()
}

// 5. LIVE signed session + admin warning banner
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[type="email"], input[name="email"]', 'admin@thepharmacy.com')
  await page.fill('input[type="password"]', 'Admin@2026')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3500)
  const cookies = await ctx.cookies()
  const sess = cookies.find((c) => c.name === 'tp_session')
  check('live login: signed v1 cookie', !!sess && sess.value.startsWith('v1.'), sess ? sess.value.slice(0, 22) + '…' : 'no cookie')
  // stateless: token verifies even from a brand-new HTTP client (no DB session row needed)
  if (sess) {
    const r = await fetch(BASE + '/api/auth/me', { headers: { cookie: `tp_session=${sess.value}` } })
    const j = await r.json().catch(() => ({}))
    check('stateless token verifies from separate client', r.status === 200 && j.user?.email === 'admin@thepharmacy.com')
    check('me reports ephemeral mode on Vercel', j.dbEphemeral === true, `dbEphemeral=${j.dbEphemeral}`)
  }
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3500)
  const adminBody = await page.evaluate(() => document.body.innerText)
  check('admin: ephemeral warning banner shown', /ذاكرة مؤقتة|temporary memory/.test(adminBody), '')
  check('admin: dashboard renders', /لوحة تحكم|Admin Dashboard/.test(adminBody))
  check('admin console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// 6. Mobile overflow
for (const path of ['/', '/category/vitamins', '/checkout']) {
  const { ctx, page } = await newPage({ width: 375, height: 812 })
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check(`mobile 375px no overflow ${path}`, m.sw <= m.cw + 1, `sw=${m.sw} cw=${m.cw}`)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n===== LIVE ROUND-2 VERIFY: ${results.length - failed.length}/${results.length} passed =====`)
failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail))
if (failed.length) process.exit(1)

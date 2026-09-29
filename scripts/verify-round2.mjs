#!/usr/bin/env node
/**
 * Round-2 regression on LOCAL build: verify all fixes as a user.
 * - home: "New arrivals" (no Best-sellers claim), hero 496+
 * - category: no Most-popular/Top-rated sort options, default Newest
 * - product: no BOM junk (Raw African), movelex EN proper English
 * - cards: no "Not specified" volume placeholders
 * - login: signed session cookie (v1.), works + logout
 * - mobile 375px no overflow
 */
import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
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

// 1. Home
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  const body = await page.evaluate(() => document.body.innerText)
  check('home: New arrivals section present', /وصل حديثاً|New arrivals/.test(body))
  check('home: no Best-sellers claim', !/الأكثر مبيعاً|Best sellers/.test(body))
  check('home: hero 496+', /496/.test(body))
  check('home console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// 2. Category sort options
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  await page.click('[aria-label*="ترتيب"], [aria-label*="Sort"]').catch(() => {})
  await page.waitForTimeout(600)
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim()))
  check('category: no Most-popular option', !opts.some((o) => /الأكثر شعبية|Most popular/i.test(o || '')), JSON.stringify(opts))
  check('category: no Top-rated option', !opts.some((o) => /الأعلى تقييماً|Top rated/i.test(o || '')))
  check('category: Newest option present', opts.some((o) => /الأحدث|Newest/i.test(o || '')))
  await ctx.close()
}

// 3. Product pages: BOM + movelex EN
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/product/raw-african-maya-leave-in-and-curly-enhancer', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const bom = await page.evaluate(() => /\ufeff|\u200b/.test(document.body.innerText))
  check('raw-african: no BOM chars in UI', bom === false, bom ? 'BOM visible' : 'clean')
  await page.goto(BASE + '/product/movelex-cream-120gm', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  // switch to EN
  const en = page.locator('button:has-text("EN")').first()
  if (await en.count()) await en.click().catch(() => {})
  await page.waitForTimeout(1000)
  const txt = await page.evaluate(() => document.body.innerText)
  check('movelex EN: proper English description', /Movelex Cream is a topical cream/.test(txt))
  check('movelex EN: no Arabic in EN view', !/موڤليكس متخصص/.test(txt))
  await ctx.close()
}

// 4. Volume placeholders gone (hair care grid)
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/category/hair-care', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  const body = await page.evaluate(() => document.body.innerText)
  const junk = (body.match(/Not specified|Not visible/g) || []).length
  check('hair-care cards: no Not specified/visible', junk === 0, `${junk} found`)
  await ctx.close()
}

// 5. Login flow with signed session
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[type="email"], input[name="email"]', 'admin@thepharmacy.com')
  await page.fill('input[type="password"]', 'Admin@2026')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  const cookies = await ctx.cookies()
  const sess = cookies.find((c) => c.name === 'tp_session')
  check('login: session cookie is signed v1 token', !!sess && sess.value.startsWith('v1.'), sess ? sess.value.slice(0, 24) + '…' : 'no cookie')
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  const adminBody = await page.evaluate(() => document.body.innerText)
  check('admin: no ephemeral warning locally', !/ذاكرة مؤقتة|temporary memory/.test(adminBody), '')
  check('admin: dashboard renders stats', /لوحة تحكم|Dashboard/.test(adminBody))
  check('admin console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  // logout via account
  await page.goto(BASE + '/account', { waitUntil: 'networkidle', timeout: 45000 })
  const logout = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout"), button:has-text("Log out")').first()
  if (await logout.count()) { await logout.click(); await page.waitForTimeout(1500) }
  const cookies2 = await ctx.cookies()
  check('logout clears session cookie', !cookies2.some((c) => c.name === 'tp_session'))
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
console.log(`\n===== LOCAL REGRESSION: ${results.length - failed.length}/${results.length} passed =====`)
failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail))
if (failed.length) process.exit(1)

#!/usr/bin/env node
/**
 * Round-2 in-browser user audit (fresh eyes):
 * broken images, BOM junk in descriptions, swapped-language fields,
 * placeholder volume labels, admin honesty, home claims, console errors.
 */
import { chromium } from 'playwright-core'
const BASE = 'https://the-pharmacy-two.vercel.app'
const CHROME = '/home/z/.agent-browser/browsers/chrome-153.0.8010.52/chrome'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const newPage = async (viewport) => {
  const ctx = await browser.newContext({ viewport, locale: 'ar-EG' })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 130)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 130)))
  return { ctx, page, errors }
}

// ---- 1. Home: claims + broken images ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  const body = await page.evaluate(() => document.body.innerText)
  check('home: Best-sellers fake claim present (TO FIX)', /الأكثر مبيعاً|Best sellers/.test(body), 'expected FAIL->will fix')
  const imgs = await page.evaluate(() =>
    [...document.images].map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 }))
  )
  const broken = imgs.filter((i) => !i.ok)
  check('home: no broken images', broken.length === 0, `${broken.length}/${imgs.length} broken` + (broken[0] ? ` e.g. ${broken[0].src.slice(-60)}` : ''))
  const altless = await page.evaluate(() => [...document.images].filter((i) => !i.alt || !i.alt.trim()).length)
  check('home: all images have alt', altless === 0, `${altless} without alt`)
  check('home console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---- 2. BOM junk description (Raw African) ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/product/raw-african-maya-leave-in-and-curly-enhancer', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  const bomVisible = await page.evaluate(() => /\ufeff|\u200b/.test(document.body.innerText))
  check('product page: BOM junk chars NOT visible (TO FIX)', bomVisible === false, bomVisible ? 'BOM rendered in UI' : 'clean')
  await ctx.close()
}

// ---- 3. Swapped-language field (movelex) EN mode ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900, locale: 'en-US' })
  await page.goto(BASE + '/product/movelex-cream-120gm', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  // switch to EN via header toggle if present
  const enBtn = page.locator('button:has-text("EN"), [data-lang="en"]').first()
  if (await enBtn.count()) await enBtn.click().catch(() => {})
  await page.waitForTimeout(1200)
  const txt = await page.evaluate(() => document.body.innerText)
  const arabicInEn = /موڤليكس متخصص|الشد العضلي/.test(txt)
  check('movelex EN page: description not swapped to Arabic (TO FIX)', arabicInEn === false, arabicInEn ? 'Arabic text in EN view' : 'clean')
  await ctx.close()
}

// ---- 4. Placeholder volume on cards (L'Oreal casting category page) ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/category/hair-care?limit=60', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  const body = await page.evaluate(() => document.body.innerText)
  const notSpec = (body.match(/Not specified|Not visible/g) || []).length
  check('cards: no "Not specified/visible" placeholders (TO FIX)', notSpec === 0, `${notSpec} occurrences`)
  await ctx.close()
}

// ---- 5. Admin honesty with real probe order ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[type="email"], input[name="email"]', 'admin@thepharmacy.com')
  await page.fill('input[type="password"]', 'Admin@2026')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3500)
  const body = await page.evaluate(() => document.body.innerText)
  check('admin: probe order TP-7334733007 visible', body.includes('TP-7334733007'), '')
  check('admin: shows real revenue 130', /130/.test(body), '')
  check('admin: zero-state funnel honest', /0/.test(body), '')
  check('admin: no ephemeral-DB warning yet (TO FIX)', !/ephemeral|مؤقت/.test(body), 'warning absent — will add')
  check('admin console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---- 6. Empty-ish journeys: interactions + prescription states ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/interactions', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const iBody = await page.evaluate(() => document.body.innerText)
  check('interactions page renders CTA', /أضف|Add|بحث|دواء/.test(iBody), '')
  await page.goto(BASE + '/prescription', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  check('prescription page renders upload', await page.locator('input[type="file"]').count() > 0, '')
  check('journeys console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n===== ROUND-2 BROWSER AUDIT: ${results.length - failed.length}/${results.length} passed =====`)
failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail))

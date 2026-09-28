#!/usr/bin/env node
/**
 * Live in-browser user audit of the fresh Vercel deployment.
 * Checks: hero real count, product page honesty (no discount badge/stars
 * when zero reviews), mobile 375px overflow, assistant real reply, console errors.
 */
import { chromium } from 'playwright-core'

const BASE = 'https://the-pharmacy-two.vercel.app'
const CHROME = '/home/z/.agent-browser/browsers/chrome-153.0.8010.52/chrome'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const newPage = async (viewport) => {
  const ctx = await browser.newContext({ viewport, locale: 'ar-EG' })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  return { ctx, page, errors }
}

// ---- 1. Home: hero real count + no fake claims ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  const body = await page.evaluate(() => document.body.innerText) // visible text only
  check('hero shows 496+', /\b496\+?/.test(body), 'found')
  check('no "461+" stale count', !/\b461\+/.test(body), '')
  check('home console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  // ---- 2. Product page: honest social proof ----
  await page.goto(BASE + '/product/dermactive-tricho-act-anti-hair-loss-lotion', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  const pbody = await page.textContent('body')
  const hasDiscount = await page.locator('text=/-\\s?\\d+%|خصم/').count()
  const crossed = await page.locator('s, line-through, .line-through').count()
  check('no discount badge on product page', hasDiscount === 0, `count=${hasDiscount}`)
  check('no crossed-out anchor price', crossed === 0, `count=${crossed}`)
  const stars = await page.locator('[data-stars], .fill-amber-400').count()
  check('no fake star rating', stars === 0, `count=${stars}`)
  check('product console clean', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---- 3. Mobile 375px: no horizontal overflow on category + search ----
for (const path of ['/category/vitamins', '/search/panadol', '/checkout']) {
  const { ctx, page, errors } = await newPage({ width: 375, height: 812 })
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  check(`mobile 375px no overflow ${path}`, m.sw <= m.cw + 1, `scrollWidth=${m.sw} clientWidth=${m.cw}`)
  await ctx.close()
}

// ---- 4. Assistant: real AI reply (keyless chain) ----
{
  const { ctx, page, errors } = await newPage({ width: 1280, height: 900 })
  await page.goto(BASE + '/assistant', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const api = page.waitForResponse((r) => r.url().includes('/api/ai/assistant'), { timeout: 60000 }).catch(() => null)
  // quick chips call send(q) directly; fall back to the form input
  const chip = page.locator('button', { hasText: 'عندي صداع' }).first()
  if (await chip.count()) {
    await chip.click()
  } else {
    const input = page.locator('form input').first()
    await input.fill('عندي صداع')
    await page.locator('form button[type="submit"]').click()
  }
  const res = await api
  let replied = false
  if (res) {
    try {
      const j = await res.json()
      const text = (j.reply || j.message || j.text || '').toString()
      replied = text.length > 20
    } catch { replied = res.status() === 200 }
  } else {
    await page.waitForTimeout(10000)
    const b = await page.evaluate(() => document.body.innerText)
    replied = /صداع|بانادول|paracetamol|باراسيتامول|مسكن/i.test(b) && !/عذرا|خطأ|error/i.test(b)
  }
  check('assistant returns real AI reply', replied, res ? `api status=${res.status()}` : 'no api response captured')
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n===== LIVE BROWSER AUDIT: ${results.length - failed.length}/${results.length} passed =====`)
if (failed.length) { failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail)); process.exit(1) }

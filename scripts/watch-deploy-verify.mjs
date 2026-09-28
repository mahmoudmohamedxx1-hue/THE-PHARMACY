#!/usr/bin/env node
/**
 * Watch Vercel deployment after push, then verify all fixes live.
 * Phase A: poll homepage until asset build hash changes (new deployment live)
 * Phase B: DB-level checks via API (ratings zeroed, anchors gone, product count)
 * Phase C: bundle-level checks (fake strings removed from shipped JS)
 */
const BASE = 'https://the-pharmacy-two.vercel.app'

const fetchText = async (url) => {
  const r = await fetch(url, { redirect: 'follow' })
  return { status: r.status, text: await r.text(), url: r.url }
}

const buildHash = (html) => {
  const srcs = [...html.matchAll(/src="([^"]*_next\/static[^"]+\.js)"/g)].map((m) => m[1])
  const hrefs = [...html.matchAll(/href="([^"]*_next\/static[^"]+\.js)"/g)].map((m) => m[1])
  const all = [...srcs, ...hrefs]
  if (!all.length) return null
  return all.sort().join('|')
}

// ---------- Phase A: wait for new deployment ----------
const { status: st0, text: html0 } = await fetchText(BASE + '/')
const h0 = buildHash(html0)
console.log(`[A] initial: HTTP ${st0}, ${h0 ? h0.split('|').length : 0} bundles, hash=${h0 ? h0.slice(0, 80) : 'none'}`)
if (!h0) {
  console.log('[A] WARN: no _next/static JS found in HTML — falling back to polling only status')
}

let h1 = h0
const skipWait = process.argv.includes('--skip-wait')
const deadline = Date.now() + 12 * 60 * 1000
let waited = 0
while (!skipWait && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 20000))
  waited += 20
  try {
    const { text: html } = await fetchText(BASE + '/')
    h1 = buildHash(html)
    if (h1 && h0 && h1 !== h0) {
      console.log(`[A] NEW DEPLOYMENT detected after ~${waited}s ✓`)
      break
    }
    if (!h0 && h1) {
      console.log(`[A] bundles appeared after ~${waited}s ✓`)
      break
    }
    process.stdout.write(`[A] waiting... ${waited}s (same build)\r`)
  } catch (e) {
    console.log(`[A] fetch hiccup: ${e.message}`)
  }
}
if (skipWait) console.log('[A] skip-wait: deployment freshness already established, going straight to verification')
else if (h1 === h0) console.log(`[A] TIMEOUT: no new deployment in 12min (hash unchanged)`)
await new Promise((r) => setTimeout(r, 5000)) // let ISR/API warm up

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// ---------- Phase B: DB-level checks via API ----------
let products = []
let stP = 0
try {
  const first = await (await fetch(BASE + '/api/products?limit=60&page=1')).json()
  stP = 200
  products = first.items || []
  const pages = Math.min(first.pages || 1, 12)
  for (let pg = 2; pg <= pages; pg++) {
    const r = await fetch(BASE + `/api/products?limit=60&page=${pg}`)
    const j = await r.json()
    products.push(...(j.items || []))
  }
} catch (e) {
  stP = 500
  console.log(`      products fetch error: ${e.message}`)
}
check('products API 200', stP === 200, `status=${stP}`)
console.log(`      fetched ${products.length} products across pages`)

if (products.length) {
  const withRating = products.filter((p) => (p.rating ?? 0) > 0 || (p.ratingCount ?? p.reviewCount ?? 0) > 0)
  check('all ratings zeroed', withRating.length === 0, `${withRating.length}/${products.length} still rated` +
    (withRating[0] ? ` e.g. ${withRating[0].slug || withRating[0].id}=${withRating[0].rating}` : ''))

  const withAnchor = products.filter((p) => p.compareAtPrice != null && p.compareAtPrice > (p.price ?? 0))
  check('fake discount anchors removed', withAnchor.length === 0, `${withAnchor.length} products still show compareAtPrice` +
    (withAnchor[0] ? ` e.g. ${withAnchor[0].slug}` : ''))

  const sudocrem = products.find((p) => /sudocrem/i.test(p.slug || ''))
  if (sudocrem) {
    const bad = /الشفاء|يشفي|cure/i.test(JSON.stringify(sudocrem.description || '') + (sudocrem.nameAr || ''))
    check('Sudocrem medical claim softened', !bad, bad ? 'still contains cure claim' : 'clean')
  } else {
    check('Sudocrem found in catalog', false, 'slug not found')
  }
} else {
  check('products parse', false, 'could not parse products JSON')
}

const { status: stC, text: tC } = await fetchText(BASE + '/api/categories')
let totalProducts = 0
try {
  const cats = JSON.parse(tC)
  const arr = Array.isArray(cats) ? cats : cats.categories || []
  totalProducts = arr.reduce((s, c) => s + (c.productCount || c.count || 0), 0)
} catch {}
check('categories API 200', stC === 200)
console.log(`      catalog total via categories = ${totalProducts} (hero should show ${totalProducts}+)`)

const { status: stH } = await fetchText(BASE + '/api/health')
check('health endpoint 200', stH === 200)

// ---------- Phase C: shipped JS bundle checks ----------
const { text: htmlNew } = await fetchText(BASE + '/')
const bundles = [...new Set([...htmlNew.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]))]
let fakeEmail = 0, fake247 = 0, fakeLove = 0, scanned = 0
for (const b of bundles) {
  try {
    const r = await fetch(b.startsWith('http') ? b : new URL(b, BASE).href)
    const t = await r.text()
    scanned++
    if (t.includes('care@thepharmacy.com')) fakeEmail++
    if (t.includes('24/7')) fake247++
    if (t.includes('Most-loved')) fakeLove++
  } catch {}
}
console.log(`      scanned ${scanned}/${bundles.length} bundles from HTML`)
check('footer fake email gone from bundles', fakeEmail === 0, fakeEmail ? `${fakeEmail} bundles contain care@thepharmacy.com` : '')
check('no 24/7 claim in bundles', fake247 === 0, fake247 ? `${fake247} bundles contain 24/7` : '')
check('no "Most-loved" claim in bundles', fakeLove === 0, fakeLove ? `${fakeLove} bundles contain it` : '')

// ---------- Summary ----------
const failed = results.filter((r) => !r.ok)
console.log(`\n========== LIVE VERIFY: ${results.length - failed.length}/${results.length} passed ==========`)
if (failed.length) {
  console.log('FAILED:')
  failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`))
  process.exit(1)
}

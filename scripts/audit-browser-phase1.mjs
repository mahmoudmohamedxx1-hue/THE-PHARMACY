// Task 17 — In-browser user audit, Phase 1: walk all pages as a user,
// capture console/network errors, detect fake-data surfaces in the UI.
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const consoleErrs = [], failedReqs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + String(e).slice(0, 160)));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('sw.js')) failedReqs.push(`${r.status()} ${r.url().slice(0, 100)}`);
});
page.on('requestfailed', (r) => {
  if (!r.failure()?.errorText?.includes('ERR_ABORTED')) failedReqs.push(`FAIL ${r.url().slice(0, 100)} (${r.failure()?.errorText})`);
});

const results = [];
async function walk(path, checks = {}) {
  try {
    await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    const body = await page.locator('body').innerText();
    const r = { path, ok: true, findings: [] };
    for (const [name, fn] of Object.entries(checks)) {
      try { r[name] = await fn(body); } catch (e) { r[name] = 'ERR: ' + String(e).slice(0, 80); }
    }
    results.push(r);
  } catch (e) {
    results.push({ path, ok: false, error: String(e).slice(0, 140) });
  }
}

// ---------- helpers ----------
const countSel = (sel) => async () => await page.locator(sel).count();
const hasText = (re) => async (body) => re.test(body);

// ---------- HOME ----------
await walk('/', {
  hero_count: async (body) => (body.match(/(\d+)\+\s*(منتج أصلي|genuine products)/) || [])[1] || 'NOT FOUND',
  discount_badges: countSel('span[class*="bg-red-500"]'), // -X% badges on cards
  best_sellers_label: hasText(/Best sellers|الأكثر مبيعاً/),
  featured_label: hasText(/Featured Products|منتجات مميزة/),
  promo_24_7: hasText(/24\/7|مدار الساعة/),
  product_cards: countSel('a[href*="/product/"]'),
  broken_imgs: async () => await page.evaluate(() => Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 90))),
});

// ---------- CATEGORY ----------
await walk('/category/vitamins', {
  sort_options: countSel('[role="option"], select option'),
  filter_labels: hasText(/Filters|الفلاتر/),
  top_rated_option: async (body) => body.includes('Top rated') || body.includes('الأعلى تقييماً'),
  pagination: hasText(/Page \d|صفحة \d/),
  cards: countSel('a[href*="/product/"]'),
});

// ---------- PRODUCT (discounted product) ----------
await walk('/product/dermactive-tricho-act-anti-hair-loss-lotion', {
  discount_badge: hasText(/-\d+%/),
  crossed_price: countSel('.line-through'),
  stars_visible: countSel('svg.fill-amber-400'),
  add_to_cart: hasText(/Add to Cart|أضف للعربة/),
  related: hasText(/Related|ذات صلة/),
});

// ---------- non-discount product ----------
await walk('/product/redoxon-double-action-30-tablets', {
  discount_badge: async (b) => /-\d+%/.test(b),
  price_visible: hasText(/EGP|جنيه/),
});

// ---------- SEARCH ----------
await walk('/search/panadol', {
  results_count: hasText(/\d+\s*(results|نتيجة)/),
  product_links: countSel('a[href*="/product/"]'),
});

// ---------- no-results search ----------
await walk('/search/zzzqqqxxx', {
  no_results: hasText(/No results|لا توجد نتائج/),
});

// ---------- STATIC/OTHER PAGES ----------
for (const p of ['/cart', '/checkout', '/login', '/register', '/orders', '/account', '/wishlist', '/prescription', '/assistant', '/interactions']) {
  await walk(p, { renders: async (b) => b.length > 200 });
}

// ---------- 404 page ----------
await walk('/product/does-not-exist-xyz', { status: async () => 'checked via response', body_404: hasText(/404|غير موجودة|couldn’t be found|Not Found/i) });
const resp404 = await page.goto(SITE + '/product/does-not-exist-xyz').then(r => r.status());
results.push({ path: '/product/does-not-exist-xyz', http_status: resp404 });

// ---------- OFFLINE / MANIFEST / SW ----------
for (const p of ['/manifest.webmanifest', '/sw.js', '/offline']) {
  const r = await page.goto(SITE + p).then(r => r.status()).catch(e => 'ERR ' + String(e).slice(0, 60));
  results.push({ path: p, http_status: r });
}

// ---------- MOBILE 375px ----------
const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const mpage = await mctx.newPage();
mpage.on('pageerror', (e) => consoleErrs.push('MOBILE PAGEERROR: ' + String(e).slice(0, 120)));
for (const p of ['/', '/category/vitamins', '/checkout']) {
  try {
    await mpage.goto(SITE + p, { waitUntil: 'networkidle', timeout: 30000 });
    await mpage.waitForTimeout(800);
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results.push({ path: 'MOBILE ' + p, overflow_px: overflow, ok: overflow <= 1 });
  } catch (e) { results.push({ path: 'MOBILE ' + p, ok: false, error: String(e).slice(0, 100) }); }
}
await mctx.close();

// ---------- REPORT ----------
console.log('\n===== PHASE 1 AUDIT RESULTS =====');
for (const r of results) console.log(JSON.stringify(r));
console.log('\n===== CONSOLE ERRORS (' + consoleErrs.length + ') =====');
consoleErrs.slice(0, 15).forEach((e) => console.log('  ', e));
console.log('\n===== FAILED REQUESTS (' + failedReqs.length + ') =====');
failedReqs.slice(0, 15).forEach((e) => console.log('  ', e));
await browser.close();

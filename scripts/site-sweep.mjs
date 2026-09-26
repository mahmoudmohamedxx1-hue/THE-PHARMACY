// Comprehensive site sweep of the live deployment — pages, console errors, broken assets, key flows
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const issues = [];
const ok = [];
const consoleErrs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 250)); });
page.on('pageerror', (e) => issues.push(`PAGEERROR: ${String(e).slice(0, 250)}`));
page.on('requestfailed', (r) => issues.push(`REQFAIL: ${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));

async function checkPage(path, name, opts = {}) {
  try {
    const resp = await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 45000 });
    const status = resp.status();
    const title = await page.title().catch(() => '');
    // broken images on the page
    const brokenImgs = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const bad = [];
      for (const i of imgs) {
        if (i.complete && i.naturalWidth === 0 && i.getAttribute('src')) bad.push(i.getAttribute('src').slice(0, 100));
      }
      return bad;
    }).catch(() => []);
    const h1 = await page.locator('h1').first().textContent().catch(() => '');
    if (status >= 400) issues.push(`${name} (${path}): HTTP ${status}`);
    else if (brokenImgs.length) issues.push(`${name} (${path}): broken images: ${brokenImgs.join(', ')}`);
    else ok.push(`${name}: ${status} — h1: "${(h1 || '').trim().slice(0, 60)}"`);
    if (opts.screenshot) await page.screenshot({ path: opts.screenshot });
  } catch (e) {
    issues.push(`${name} (${path}): ${String(e).slice(0, 150)}`);
  }
}

console.log('=== PAGE SWEEP ===');
await checkPage('/', 'Homepage');
await checkPage('/category/medications', 'Category: Medications');
await checkPage('/category/vitamins', 'Category: Vitamins');
await checkPage('/category/skincare', 'Category: Skincare');
await checkPage('/product/panadol-extra', 'Product: Panadol Extra');
await checkPage('/cart', 'Cart page');
await checkPage('/login', 'Login');
await checkPage('/register', 'Register');
await checkPage('/assistant', 'AI Assistant');
await checkPage('/interactions', 'Drug Interactions');
await checkPage('/prescription', 'Prescription');
await checkPage('/orders', 'Orders');
await checkPage('/wishlist', 'Wishlist');
await checkPage('/checkout', 'Checkout (empty cart redirect?)');
await checkPage('/admin', 'Admin');
await checkPage('/nonexistent-page-xyz', '404 page');
await checkPage('/sitemap.xml', 'Sitemap');
await checkPage('/robots.txt', 'Robots');
await checkPage('/manifest.json', 'PWA manifest');
await checkPage('/sw.js', 'Service worker file');

console.log('\n=== SEARCH TEST ===');
await page.goto(SITE + '/', { waitUntil: 'networkidle' });
await page.fill('input[type=search], input[placeholder*="ابحث"]', 'panadol').catch(() => {});
await page.press('input[type=search], input[placeholder*="ابحث"]', 'Enter').catch(() => {});
await page.waitForTimeout(3000);
const url = page.url();
if (url.includes('search')) {
  const results = await page.locator('a[href*="/product/"]').count().catch(() => 0);
  ok.push(`Search "panadol": URL=${url.replace(SITE, '')} — ${results} product links`);
} else issues.push(`Search: did not navigate (URL=${url})`);

console.log('\n=== AI ASSISTANT TEST ===');
await page.goto(SITE + '/assistant', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/assistant-page.png' });
const assistantInput = page.locator('textarea, input[type=text]').last();
if (await assistantInput.count()) {
  await assistantInput.fill('I have a headache, what should I take?').catch(() => {});
  const sendBtn = page.locator('button[type=submit], button:has-text("إرسال"), button:has-text("Send")').last();
  await sendBtn.click().catch(() => {});
  await page.waitForTimeout(6000);
  const body = await page.locator('body').innerText().catch(() => '');
  const hasGraceful = body.includes('غير مفعّلة') || body.includes('not enabled');
  const hasChatReply = body.includes('headache') || body.includes('صداع') || body.includes('Panadol') || body.includes('paracetamol');
  if (hasChatReply) ok.push('AI Assistant: got a real reply');
  else if (hasGraceful) issues.push('AI Assistant: AI unavailable message shown (needs API key on Vercel)');
  else issues.push('AI Assistant: NO reply and NO unavailable message — silent failure');
  await page.screenshot({ path: '/tmp/assistant-after.png' });
}

console.log('\n=== LANGUAGE TOGGLE TEST ===');
await page.goto(SITE + '/', { waitUntil: 'networkidle' });
const before = await page.locator('h1').first().textContent().catch(() => '');
const langBtn = page.locator('button[aria-label*="lang"], button:has-text("English"), button:has-text("تبديل اللغة")').first();
await langBtn.click().catch(() => {});
await page.waitForTimeout(2000);
const after = await page.locator('h1').first().textContent().catch(() => '');
if (before !== after) ok.push(`Language toggle works: "${before.slice(0, 30)}" → "${after.slice(0, 30)}"`);
else issues.push(`Language toggle: h1 unchanged ("${before.slice(0, 40)}")`);

console.log('\n=== MOBILE VIEWPORT TEST ===');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(SITE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2).catch(() => null);
if (hScroll === true) issues.push('Mobile (390px): horizontal overflow detected');
else ok.push('Mobile (390px): no horizontal overflow');
await page.screenshot({ path: '/tmp/mobile-home.png' });

console.log('\n=== RESULTS ===');
console.log('OK items:');
ok.forEach((o) => console.log('  ✓ ' + o));
console.log('\nISSUES found:');
if (issues.length) issues.forEach((i) => console.log('  ✗ ' + i));
else console.log('  (none)');
console.log('\nConsole errors (' + consoleErrs.length + '):');
[...new Set(consoleErrs)].slice(0, 15).forEach((c) => console.log('  [error] ' + c));

await browser.close();

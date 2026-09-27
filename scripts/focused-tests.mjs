// Focused tests: language toggle, search results, AI assistant UX, admin, 404 page, OG tags
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'https://the-pharmacy-two.vercel.app';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const results = [];
page.on('pageerror', (e) => results.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

console.log('=== 1. LANGUAGE TOGGLE ===');
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
const h1Before = (await page.locator('h1').first().textContent())?.trim();
// The toggle button is the one with aria-label "تبديل اللغة"
const toggleBtn = page.locator('button[aria-label="تبديل اللغة"], button[aria-label*="language" i]').first();
if (await toggleBtn.count()) {
  await toggleBtn.click();
  await page.waitForTimeout(2500);
  const h1After = (await page.locator('h1').first().textContent())?.trim();
  const htmlLang = await page.locator('html').getAttribute('lang');
  results.push(h1Before !== h1After
    ? `OK: toggle works — "${h1Before?.slice(0, 25)}" → "${h1After?.slice(0, 25)}" (html lang=${htmlLang})`
    : `BUG?: h1 unchanged after toggle: "${h1Before?.slice(0, 40)}" (html lang=${htmlLang})`);
  await page.screenshot({ path: '/tmp/toggle-after.png' });
} else {
  results.push('BUG: language toggle button not found by aria-label');
}

console.log('=== 2. SEARCH RESULTS ===');
await page.goto(SITE + '/search/panadol', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);
const productCards = await page.locator('[onclick*="product"], a[href*="/product/"]').count();
const bodyTxt = await page.locator('body').innerText();
const hasResultsWord = bodyTxt.includes('Panadol') || bodyTxt.includes('بانادول');
results.push(`Search "panadol": ${productCards} cards, mentions product names: ${hasResultsWord ? 'YES' : 'NO'}`);
await page.screenshot({ path: '/tmp/search-panadol.png' });

console.log('=== 3. AI ASSISTANT UX ===');
await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 45000 });
const textarea = page.locator('textarea').first();
if (await textarea.count()) {
  await textarea.fill('I have a headache');
  await textarea.press('Enter');
  await page.waitForTimeout(7000);
  const body = await page.locator('body').innerText();
  if (body.includes('غير مفعّلة') || body.includes('not enabled')) {
    results.push('AI Assistant: shows graceful unavailable message (BUG: AI not configured on Vercel)');
  } else if (await page.locator('[data-user], .bg-primary\\/10').last().isVisible().catch(() => false)) {
    results.push('AI Assistant: appears to reply');
  } else {
    results.push('AI Assistant: NO visible reply and NO unavailable message — check manually');
  }
  await page.screenshot({ path: '/tmp/assistant-result.png' });
} else {
  results.push('BUG: assistant textarea not found');
}

console.log('=== 4. ADMIN LOGIN ===');
await page.goto(SITE + '/admin', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);
const adminBody = await page.locator('body').innerText();
if (adminBody.includes('كلمة المرور') || adminBody.toLowerCase().includes('password') || adminBody.includes('تسجيل الدخول')) {
  results.push('Admin: login gate shown (OK)');
} else {
  results.push(`Admin: content — "${adminBody.slice(0, 120).replace(/\n/g, ' ')}"`);
}
await page.screenshot({ path: '/tmp/admin-gate.png' });

console.log('=== 5. 404 PAGE ===');
const resp = await page.goto(SITE + '/nonexistent-page-xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });
const notFoundBody = await page.locator('body').innerText();
results.push(`404: status=${resp.status()}, renders content: ${notFoundBody.length > 100 ? 'YES' : 'NO — blank page?'}`);
await page.screenshot({ path: '/tmp/404-page.png' });

console.log('=== 6. OG META TAGS on product page ===');
await page.goto(SITE + '/product/panadol-extra', { waitUntil: 'networkidle', timeout: 45000 });
const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content').catch(() => null);
const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
const canonical = await page.locator('link[rel=canonical]').getAttribute('href').catch(() => null);
results.push(`OG tags: og:url=${ogUrl ? ogUrl.slice(0, 60) : 'MISSING'} | og:image=${ogImage ? ogImage.slice(0, 60) : 'MISSING'} | canonical=${canonical ? canonical.slice(0, 60) : 'MISSING'}`);
if (String(ogUrl).includes('localhost') || String(canonical).includes('localhost')) results.push('BUG: OG/canonical URLs use localhost — bad for SEO/sharing');

console.log('\n=== RESULTS ===');
results.forEach((r) => console.log(' • ' + r));
await browser.close();

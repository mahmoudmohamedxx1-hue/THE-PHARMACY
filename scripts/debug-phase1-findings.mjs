// Investigate: (1) empty-search page content, (2) mobile category overflow culprit,
// (3) category sort + pagination UI presence
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });

// --- 1. empty search page content ---
const p1 = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await p1.goto(SITE + '/search/zzzqqqxxx', { waitUntil: 'networkidle', timeout: 30000 });
await p1.waitForTimeout(1500);
const txt = await p1.locator('main').innerText();
console.log('=== EMPTY SEARCH BODY (first 500 chars) ===');
console.log(txt.slice(0, 500) || '(EMPTY MAIN)');
console.log('=== title ===', await p1.title());

// --- 2. mobile category overflow: find wide elements ---
const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await mp.waitForTimeout(1000);
const wide = await mp.evaluate(() => {
  const out = [];
  const docW = document.documentElement.clientWidth;
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > docW + 1 || r.right > docW + 1) {
      const id = (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ').slice(0, 3).join('.');
      out.push(`${el.tagName.toLowerCase()} ${id.slice(0, 80)} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
    }
  });
  return out.slice(0, 25);
});
console.log('\n=== MOBILE OVERFLOW ELEMENTS (>375px) ===');
wide.forEach((w) => console.log(' ', w));

// --- 3. sort select interaction ---
const p2 = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await p2.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await p2.waitForTimeout(1000);
const selCount = await p2.locator('button[role="combobox"], [data-radix-collection-item]').count();
console.log('\n=== SORT UI ===');
console.log('combobox count:', selCount);
const combo = p2.locator('button[role="combobox"]').first();
if (await combo.count()) {
  console.log('combobox text:', await combo.textContent());
  await combo.click();
  await p2.waitForTimeout(600);
  const opts = await p2.locator('[role="option"]').allTextContents();
  console.log('options:', opts);
  await p2.keyboard.press('Escape');
}
// pagination presence
const pagText = await p2.locator('body').innerText();
console.log('pagination text present:', /السابق|التالي|Previous|Next|صفحة|Page/.test(pagText));
const pagBtns = await p2.locator('button:has-text("2"), a:has-text("2")').count();
console.log('page-2 buttons:', pagBtns);
console.log('results line:', (pagText.match(/\d+\s*(نتيجة|results)/) || ['none'])[0]);

await browser.close();

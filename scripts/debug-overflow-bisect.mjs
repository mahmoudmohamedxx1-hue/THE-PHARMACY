// Binary-search the overflow source on /category/vitamins by hiding subtrees
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(900);

const ov = () => page.evaluate(() => {
  window.scrollTo(0, 0);
  return document.documentElement.scrollWidth - document.documentElement.clientWidth;
});
console.log('baseline overflow:', await ov());

const suspects = [
  ['marquee', '.tp-marquee'],
  ['breadcrumb nav', 'nav'],
  ['filters panel', '[class*="filters"], aside'],
  ['toast ol', 'ol'],
  ['footer', 'footer'],
  ['header', 'header'],
];
for (const [name, sel] of suspects) {
  const before = await ov();
  const n = await page.evaluate((s) => {
    const els = document.querySelectorAll(s);
    els.forEach((el) => (el.style.display = 'none'));
    return els.length;
  }, sel);
  const after = await ov();
  await page.evaluate((s) => {
    document.querySelectorAll(s).forEach((el) => (el.style.display = ''));
  }, sel);
  console.log(`hide ${name} (${n} els): ${before} → ${after}`);
}

// deeper: hide each direct child of <main> and of main's wrapper
const mainChildren = await page.evaluate(() => Array.from(document.querySelector('main').children).map((c, i) => ({ i, cls: String(c.className).slice(0, 70) })));
console.log('\nmain children:', JSON.stringify(mainChildren, null, 1));
for (let i = 0; i < mainChildren.length; i++) {
  const before = await ov();
  await page.evaluate((idx) => { document.querySelector('main').children[idx].style.display = 'none'; }, i);
  const after = await ov();
  await page.evaluate((idx) => { document.querySelector('main').children[idx].style.display = ''; }, i);
  console.log(`hide main[${i}]: ${before} → ${after}`);
}
await browser.close();

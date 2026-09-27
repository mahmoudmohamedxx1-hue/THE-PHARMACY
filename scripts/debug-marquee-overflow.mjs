// Isolate the mobile overflow source by hiding suspects and re-measuring
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

const measure = (label) => page.evaluate((l) => {
  const d = document.documentElement;
  const b = document.body;
  return `${l}: docW=${d.scrollWidth} clientW=${d.clientWidth} overflow=${d.scrollWidth - d.clientWidth} bodyW=${b.scrollWidth} dir=${d.dir} scrollX=${window.scrollX}`;
}, label);

console.log(await measure('baseline'));

// hide marquee
await page.evaluate(() => { document.querySelectorAll('.tp-marquee').forEach((el) => (el.style.display = 'none')); });
console.log(await measure('marquee hidden'));

// restore marquee, hide its inner spans
await page.evaluate(() => {
  document.querySelectorAll('.tp-marquee').forEach((el) => (el.style.display = ''));
  document.querySelectorAll('.tp-marquee > *').forEach((el) => (el.style.display = 'none'));
});
console.log(await measure('marquee spans hidden'));

// restore, then check computed styles of marquee
const styles = await page.evaluate(() => {
  const m = document.querySelector('.tp-marquee');
  const p = m?.parentElement;
  const cs = getComputedStyle(m);
  const ps = p ? getComputedStyle(p) : null;
  return {
    marqueeW: m?.getBoundingClientRect().width,
    parentOverflow: ps?.overflow,
    marqueeAnim: cs.animationName,
    marqueeTransform: cs.transform,
    marqueeWidth: cs.width,
    marqueeMaxWidth: cs.maxWidth,
    parentRect: p ? JSON.parse(JSON.stringify(p.getBoundingClientRect())) : null,
  };
});
console.log('marquee styles:', JSON.stringify(styles, null, 1));

// check scrollLeft value
const sl = await page.evaluate(() => ({ docScrollLeft: document.documentElement.scrollLeft, bodyScrollLeft: document.body.scrollLeft, x: window.scrollX }));
console.log('scrollLeft:', JSON.stringify(sl));
await browser.close();

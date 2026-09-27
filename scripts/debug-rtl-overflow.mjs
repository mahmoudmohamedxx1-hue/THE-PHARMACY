// Find elements that create left-side overflow in RTL (negative left edge)
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

// reset scroll to 0 (RTL start) then measure overflow + find offenders
const out = await page.evaluate(() => {
  window.scrollTo(0, 0);
  const d = document.documentElement;
  const res = { docW: d.scrollWidth, clientW: d.clientWidth, scrollX: window.scrollX, offenders: [] };
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    // in RTL, left-overflow = elements whose RIGHT edge is < 0 (they stick out to the left of origin)
    if (r.right < -1 || r.left < -1) {
      res.offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.').slice(0, 100)} left=${Math.round(r.left)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  });
  return res;
});
console.log('scroll@0:', JSON.stringify({ docW: out.docW, clientW: out.clientW, scrollX: out.scrollX }));
console.log('offenders (left/right < 0):');
out.offenders.slice(0, 30).forEach((o) => console.log('  ', o));

// also: elements wider than client even after scroll reset
const wide2 = await page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > w + 2) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.').slice(0, 80)} w=${Math.round(r.width)}`);
  });
  return out.slice(0, 20);
});
console.log('wide elements after reset:', wide2);
await browser.close();

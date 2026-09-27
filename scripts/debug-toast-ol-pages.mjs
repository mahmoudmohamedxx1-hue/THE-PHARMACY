// Deep-inspect the toast ol: class list, transformed ancestors, and compare pages
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

for (const path of ['/', '/category/vitamins', '/category/skin-care', '/product/redoxon-double-action-30-tablets', '/cart', '/search/panadol']) {
  await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const ol = document.querySelector('ol');
    const d = document.documentElement;
    if (!ol) return { ol: 'not found' };
    // find transformed / filtered / contained ancestors
    const specialAncestors = [];
    let el = ol.parentElement;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform !== 'none' || cs.willChange.includes('transform') || cs.filter !== 'none' || cs.contain.includes('paint')) {
        specialAncestors.push(`${el.tagName}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
      }
      el = el.parentElement;
    }
    return {
      docW: d.scrollWidth, clientW: d.clientWidth, overflow: d.scrollWidth - d.clientWidth,
      olClass: String(ol.className).slice(0, 120),
      olRect: { x: Math.round(ol.getBoundingClientRect().x), w: Math.round(ol.getBoundingClientRect().width) },
      olComputedWidth: getComputedStyle(ol).width,
      specialAncestors,
    };
  });
  console.log(path, '→', JSON.stringify(r));
}
await browser.close();

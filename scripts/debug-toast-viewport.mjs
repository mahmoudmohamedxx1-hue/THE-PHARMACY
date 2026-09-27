// Inspect the toast viewport (ol) that is 414px wide on mobile
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const ol = document.querySelector('ol');
  if (!ol) return { found: false };
  const cs = getComputedStyle(ol);
  return {
    found: true,
    rect: JSON.parse(JSON.stringify(ol.getBoundingClientRect())),
    computedWidth: cs.width,
    position: cs.position,
    display: cs.display,
    padding: cs.padding,
    inlineStyle: ol.getAttribute('style'),
    childCount: ol.children.length,
    children: Array.from(ol.children).map((c) => ({
      tag: c.tagName,
      rect: JSON.parse(JSON.stringify(c.getBoundingClientRect())),
      text: (c.textContent || '').slice(0, 80),
      style: c.getAttribute('style')?.slice(0, 120),
    })),
    ownText: (ol.textContent || '').slice(0, 100),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

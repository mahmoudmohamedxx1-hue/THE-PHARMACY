// Inspect the title/sort row children on mobile
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/category/vitamins', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(900);

const row = 'document.querySelector("main").children[0].children[1]';
const info = await page.evaluate((r) => {
  const el = eval(r);
  const dump = (node, depth) => {
    const cr = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    return {
      tag: node.tagName, cls: String(node.className || '').slice(0, 70),
      rect: cr ? { x: Math.round(cr.x), w: Math.round(cr.width), right: Math.round(cr.right) } : null,
      text: (node.textContent || '').trim().slice(0, 40),
      children: depth < 4 ? Array.from(node.children || []).map((c) => dump(c, depth + 1)) : [],
    };
  };
  return dump(el, 0);
}, row);
console.log(JSON.stringify(info, null, 1));
await browser.close();

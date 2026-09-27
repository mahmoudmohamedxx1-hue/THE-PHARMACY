// Bisect deeper inside main > div to find the exact overflowing element
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

const root = 'document.querySelector("main").children[0]';
const kids = await page.evaluate((r) => Array.from(eval(r).children).map((c, i) => ({ i, tag: c.tagName, cls: String(c.className).slice(0, 60) })), root);
console.log('level-2 children:');
kids.forEach((k) => console.log('  ', k.i, k.tag, k.cls));

for (let i = 0; i < kids.length; i++) {
  const before = await ov();
  await page.evaluate(({ r, idx }) => { eval(r).children[idx].style.display = 'none'; }, { r: root, idx: i });
  const after = await ov();
  await page.evaluate(({ r, idx }) => { eval(r).children[idx].style.display = ''; }, { r: root, idx: i });
  console.log(`hide L2[${i}] ${kids[i].tag}.${kids[i].cls.slice(0, 30)}: ${before} → ${after}`);
}
await browser.close();

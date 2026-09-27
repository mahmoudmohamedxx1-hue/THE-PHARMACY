// Isolated: what does the browser actually render on /search/panadol?
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 120)); });
const resp = await page.goto(SITE + '/search/panadol', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('goto status:', resp.status(), '| final url:', page.url());
await page.waitForTimeout(3000);
console.log('product links:', await page.locator('a[href*="/product/"]').count());
console.log('h1:', (await page.locator('h1').first().textContent().catch(() => 'none')).trim());
const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log('body snippet:', body.replace(/\s+/g, ' ').slice(0, 250));
await browser.close();

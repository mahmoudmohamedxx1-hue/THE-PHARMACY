// Direct: add to cart -> full reload -> does checkout show the item?
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));

await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const cards = page.locator('a[href*="/product/"]');
const btn = cards.first().locator('button[aria-label="أضف للعربة"], button[aria-label="Add to cart" i]').first();
console.log('add button found:', await btn.count(), 'disabled:', await btn.isDisabled());
await btn.click();
await page.waitForTimeout(1500);
// check toast + localStorage
const ls = await page.evaluate(() => localStorage.getItem('tp-cart'));
console.log('localStorage tp-cart after add:', ls ? ls.slice(0, 200) : 'NULL');
// cart badge
const badge = await page.locator('button[aria-label="العربة"] .absolute, button[aria-label="العربة"] [class*="badge" i]').textContent().catch(() => null);
console.log('cart badge:', (badge || '').trim());

// full reload
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const ls2 = await page.evaluate(() => localStorage.getItem('tp-cart'));
console.log('after reload tp-cart:', ls2 ? ls2.slice(0, 120) : 'NULL');

// goto checkout (full load)
await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
const body = await page.evaluate(() => document.body.innerText.slice(0, 800));
console.log('--- checkout page ---');
console.log(body.replace(/\s+/g, ' ').slice(0, 400));
console.log('place-order button:', await page.getByRole('button', { name: /place order|تأكيد الطلب/i }).count());
console.log('qty +/- buttons:', await page.locator('button:has-text("+")').count());
await browser.close();

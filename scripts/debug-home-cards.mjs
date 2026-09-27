// Debug home page product cards & add buttons
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const cardLinks = page.locator('a[href*="/product/"]');
const n = await cardLinks.count();
console.log('product card links:', n);

// all buttons inside first 15 cards
for (let i = 0; i < Math.min(n, 6); i++) {
  const card = cardLinks.nth(i);
  const btns = card.locator('button');
  const cnt = await btns.count();
  const info = [];
  for (let b = 0; b < cnt; b++) {
    const btn = btns.nth(b);
    const label = await btn.getAttribute('aria-label');
    const disabled = await btn.isDisabled();
    info.push(`[${b}] aria="${label}" disabled=${disabled}`);
  }
  console.log(`card[${i}] href=${await card.getAttribute('href')} buttons: ${info.join(' | ')}`);
}

// does getByRole find them?
const byRole = await page.getByRole('button', { name: /add to cart|أضف/i }).count();
console.log('getByRole(add-to-cart-ish) count:', byRole);
const anyBtn = await page.locator('button[aria-label*="العربة"], button[aria-label*="cart" i]').count();
console.log('aria-label selector count:', anyBtn);

// section headings
const h2s = await page.locator('h2').allTextContents();
console.log('h2 sections:', h2s.slice(0, 10).map(s => s.trim()).join(' | '));
await browser.close();

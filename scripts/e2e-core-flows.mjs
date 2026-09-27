// E2E: cart / checkout / register / wishlist core flows
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

const log = (k, v) => console.log(`${k}: ${v}`);

// 1. add product to cart from homepage (button inside product card link)
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
const firstAddBtn = page.locator('a[href*="/product/"] button[aria-label*="للعربة"], button[aria-label*="Add to cart"]').first();
if (await firstAddBtn.count()) {
  await firstAddBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  log('add-to-cart', 'clicked ✓ (navigated to: ' + page.url().replace(SITE, '') + ')');
  // if clicking navigated to product page, go back and verify cart badge
  if (!page.url().endsWith('/')) await page.goto(SITE + '/', { waitUntil: 'networkidle' });
  const badge = await page.locator('header [class*="Badge"], header span').filter({ hasText: /^[1-9]\d*$/ }).first().textContent().catch(() => null);
  log('cart badge', badge ? `${badge} ✓` : 'not visible');
} else log('add button', 'NOT found ✗');

// 2. cart page
await page.goto(SITE + '/cart', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
const cartBody = await page.locator('body').innerText();
log('cart has item', /EGP|جنيه/i.test(cartBody) && /panadol|doliprane|بانادول|دوليبران/i.test(cartBody) ? 'YES ✓' : 'NO ✗');

// 3. checkout page renders
await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const cb = await page.locator('body').innerText();
log('checkout renders', cb.length > 300 ? 'YES ✓' : 'NO ✗');

// 4. register flow (scoped by input ids)
await page.goto(SITE + '/register', { waitUntil: 'networkidle', timeout: 30000 });
const email = 'bugtest' + Date.now() + '@test.com';
await page.locator('#name').fill('Bug Test');
await page.locator('#email').fill(email);
await page.locator('#phone').fill('01000000000');
await page.locator('#password').fill('Passw0rd!234');
await page.locator('button[type=submit]').click();
await page.waitForTimeout(3500);
const after = page.url();
const body = await page.locator('body').innerText();
log('register redirect', after.replace(SITE, ''));
log('register success', /حسابي|account|تسجيل الخروج|logout|أهلا/i.test(body) ? 'logged in ✓' : 'check output');
log('register dup-guard', body.includes(email) ? 'still showing form (email kept)' : 'form cleared/redirected');

// 5. wishlist toggle
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 30000 });
const wishBtn = page.locator('a[href*="/product/"] button[aria-label*="المفضلة"], button[aria-label*="wishlist" i]').first();
if (await wishBtn.count()) {
  await wishBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.goto(SITE + '/wishlist', { waitUntil: 'networkidle', timeout: 30000 });
  const wb = await page.locator('body').innerText();
  log('wishlist has item', /panadol|doliprane|بانادول|دوليبران/i.test(wb) ? 'YES ✓' : 'NO ✗');
} else log('wishlist button', 'NOT found ✗');

// 6. logout
await page.goto(SITE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
const logoutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout"), button:has-text("logout")').first();
if (await logoutBtn.count()) {
  await logoutBtn.click();
  await page.waitForTimeout(2000);
  log('logout', 'clicked, now at: ' + page.url().replace(SITE, ''));
} else log('logout button', 'not on account page (maybe not logged in)');

log('page errors', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await browser.close();

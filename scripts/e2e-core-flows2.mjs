// E2E v2: precise cart / account / wishlist verification
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
const log = (k, v) => console.log(`${k}: ${v}`);

// 1. add first product to cart, remember its name
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
const firstCard = page.locator('a[href*="/product/"]').first();
const cardName = (await firstCard.locator('h3').textContent() || '').trim();
const addBtn = firstCard.locator('button[aria-label*="للعربة"], button[aria-label*="Add to cart"]').first();
await addBtn.click({ timeout: 10000 });
await page.waitForTimeout(1500);
log('product added', `"${cardName}" ✓`);

// 2. cart page — verify the SAME product name appears
await page.goto(SITE + '/cart', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
const cartBody = await page.locator('body').innerText();
const nameWords = cardName.split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
const inCart = nameWords.some((w) => cartBody.includes(w));
log('cart shows item', inCart ? 'YES ✓' : `NO ✗ (looked for ${JSON.stringify(nameWords)})`);

// 3. wishlist: toggle on first card, then check wishlist page
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
const wishBtn = page.locator('a[href*="/product/"]').first().locator('button[aria-label*="مفضلة"], button[aria-label*="wishlist" i]').first();
if (await wishBtn.count()) {
  await wishBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.goto(SITE + '/wishlist', { waitUntil: 'networkidle', timeout: 30000 });
  const wb = await page.locator('body').innerText();
  const inWish = nameWords.some((w) => wb.includes(w));
  log('wishlist shows item', inWish ? 'YES ✓' : 'NO ✗');
} else log('wishlist button', 'NOT found ✗');

// 4. register + account page
await page.goto(SITE + '/register', { waitUntil: 'networkidle', timeout: 30000 });
const email = 'bugtest' + Date.now() + '@test.com';
await page.locator('#name').fill('Bug Test');
await page.locator('#email').fill(email);
await page.locator('#phone').fill('01000000000');
await page.locator('#password').fill('Passw0rd!234');
await page.locator('button[type=submit]').click();
await page.waitForTimeout(3500);
log('after register', page.url().replace(SITE, '') || '/');

// 5. account page after login
await page.goto(SITE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
const ab = await page.locator('body').innerText();
log('account page', /حسابي|My Account|بياناتي|البريد|email/i.test(ab) ? 'shows account ✓' : 'NOT account view: ' + ab.slice(0, 80).replace(/\n/g, ' | '));
const logoutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout"), button:has-text("logout")').first();
if (await logoutBtn.count()) {
  await logoutBtn.click();
  await page.waitForTimeout(2000);
  log('logout', 'clicked → ' + (page.url().replace(SITE, '') || '/'));
} else log('logout button', 'not found');

// 6. checkout with the carted item
await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const cb = await page.locator('body').innerText();
const checkoutHasItem = nameWords.some((w) => cb.includes(w));
const hasForm = /الاسم|name|العنوان|address|الهاتف|phone/i.test(cb);
log('checkout has item', checkoutHasItem ? 'YES ✓' : 'NO');
log('checkout has form', hasForm ? 'YES ✓' : 'NO');

log('page errors', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await browser.close();

// Final verification: account fixes, admin clean state, full purchase flow, marquee
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const L = (k, v) => console.log(`[${k}] ${v}`);

async function makePage(ctx) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 130)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 130)); });
  page._errs = errs;
  return page;
}

// ============ 1. account page: real member-since + logout ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  // login as demo (registered long ago -> real year should NOT be 2026)
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill('demo@thepharmacy.com');
  await page.locator('#password').fill('Demo@2026');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);
  await page.goto(SITE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const b = await page.locator('body').innerText();
  const ms = b.match(/عضو منذ\s*(\d{4})|Member since\s*(\d{4})/);
  L('1.member-since', ms ? (ms[1] || ms[2]) : 'not shown');
  const logoutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout")');
  L('1.logout-button-on-account', (await logoutBtn.count()) > 0 ? 'YES' : 'NO');
  if ((await logoutBtn.count()) > 0) {
    await logoutBtn.first().click();
    await page.waitForTimeout(2500);
    const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()).catch(() => null));
    L('1.logout-works', me?.user ? 'STILL LOGGED IN ✗' : 'logged out ✓');
  }
  L('1.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ 2. admin: honest empty state ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill('admin@thepharmacy.com');
  await page.locator('#password').fill('Admin@2026');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);
  await page.goto(SITE + '/admin', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const b = await page.locator('body').innerText();
  L('2.admin-loads', /لوحة تحكم|Admin Dashboard/i.test(b) ? 'YES' : 'NO');
  const ordersStat = b.match(/الطلبات\s*\n?\s*(\d+)|Orders\s*\n?\s*(\d+)/);
  L('2.orders-stat', ordersStat ? (ordersStat[1] || ordersStat[2]) : 'nf');
  const usersStat = b.match(/العملاء\s*\n?\s*(\d+)|Customers\s*\n?\s*(\d+)/);
  L('2.customers-stat', usersStat ? (usersStat[1] || usersStat[2]) : 'nf');
  L('2.fake-orders', /TP-\d+|E2E test address|Abbas El Akkad/.test(b) ? 'still present ✗' : 'clean ✓');
  L('2.analytics-empty-state', /لا توجد بيانات تحليلات|No analytics data/i.test(b) ? 'honest empty ✓' : 'something shows: ' + (b.match(/تحويل|conversion/i) ? [b.match(/([\d.]+)\s*%/)?.[1] || '?'] : 'funnel hidden'));
  L('2.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ 3. full guest purchase flow (regression) ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  const addBtn = page.locator('a[href*="/product/"] button[aria-label*="للعربة"], a[href*="/product/"] button[aria-label*="Add to cart"]').first();
  await addBtn.click();
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('#name').fill('Final Verify');
  await page.locator('#phone').fill('01012345679');
  const zoneSelect = page.locator('button[role="combobox"]').first();
  if (await zoneSelect.count()) {
    await zoneSelect.click(); await page.waitForTimeout(500);
    await page.locator('[role="option"]').nth(2).click();
  }
  await page.locator('#address, textarea').first().fill('Final Verify Street 1');
  await page.locator('button[type=submit], button:has-text("تأكيد الطلب"), button:has-text("Place Order")').first().click();
  await page.waitForTimeout(4500);
  const b = await page.locator('body').innerText();
  L('3.order-placed', b.match(/TP-\d+/)?.[0] || 'NO ORDER');
  L('3.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ 4. marquee promo text + assistant ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  const b = await page.locator('body').innerText();
  L('4.promo-cod', /الدفع عند الاستلام متاح/.test(b) ? 'new COD promo ✓' : 'not found');
  L('4.no-24-7', /24\/7|مدار الساعة/.test(b) ? 'STILL THERE ✗' : 'gone ✓');
  L('4.no-care-email', /care@thepharmacy\.com/.test(b) ? 'fake email still in footer ✗' : 'footer clean ✓');
  // assistant quick check
  await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 30000 });
  const sub = await page.locator('body').innerText();
  L('4.assistant-sub-honest', /إشراف الصيادلة|reviewed by pharmacists/i.test(sub) ? 'still claims pharmacist review ✗' : 'honest ✓');
  L('4.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

await browser.close();
console.log('final verification done');

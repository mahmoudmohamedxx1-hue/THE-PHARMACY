// Remaining: D (admin) + interactions UI + a few extra user checks
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

// ============ interactions UI proper ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  // find all med input slots
  const inputSel = 'input[placeholder*="مثال: بانادول"], input[placeholder*="e.g. Panadol"]';
  let n = await page.locator(inputSel).count();
  L('I.initial-inputs', n);
  if (n === 0) {
    await page.locator('button:has-text("أضف دواء")').click();
    await page.waitForTimeout(500);
  }
  // fill first
  const first = page.locator(inputSel).first();
  if (await first.count()) await first.fill('Panadol Extra');
  // add second and fill
  await page.locator('button:has-text("أضف دواء")').click();
  await page.waitForTimeout(500);
  const all = page.locator(inputSel);
  const cnt = await all.count();
  L('I.inputs-after-add', cnt);
  if (cnt >= 2) {
    await all.nth(1).fill('Aspirin');
    const analyze = page.locator('button:has-text("تحليل التعارضات")');
    const disabled = await analyze.isDisabled().catch(() => 'n/a');
    L('I.analyze-disabled', disabled);
    if (!disabled) {
      await analyze.click();
      await page.waitForTimeout(25000);
      const b = await page.locator('body').innerText();
      L('I.result', /متوسط|moderate|منخفض|low|خطر/i.test(b) ? 'analysis shown ✓' : 'tail: ' + b.slice(-200).replace(/\n/g, ' '));
    }
  }
  await page.screenshot({ path: 'scripts/shot-audit-ddi.png' });
  await ctx.close();
}

// ============ D. ADMIN ============
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
  L('D.admin-loads', /لوحة تحكم|Admin Dashboard/i.test(b) ? 'YES' : 'NO');
  const ordersStat = b.match(/الطلبات\s*\n?\s*(\d+)|Orders\s*\n?\s*(\d+)/);
  L('D.orders-stat', ordersStat ? (ordersStat[1] || ordersStat[2]) : 'nf');
  const usersStat = b.match(/العملاء\s*\n?\s*(\d+)|Customers\s*\n?\s*(\d+)/);
  L('D.customers-stat', usersStat ? (usersStat[1] || usersStat[2]) : 'nf');
  L('D.fake-orders-visible', /TP-3873878838|TP-1583394900|E2E test address/.test(b) ? 'YES — FAKE/TEST ORDERS' : 'no');
  L('D.funnel-rendered', /قمع التحويل|Conversion funnel/i.test(b) ? 'yes' : 'no');
  const conv = b.match(/([\d.]+)\s*%/);
  L('D.conversion', conv ? conv[1] + '%' : 'n/a');
  // click orders tab
  const ordersTab = page.locator('button[role="tab"]:has-text("الطلبات"), button[role="tab"]:has-text("Orders"), [role="tab"]:has-text("الطلبات")').first();
  if (await ordersTab.count()) {
    await ordersTab.click();
    await page.waitForTimeout(1500);
    const ob = await page.locator('body').innerText();
    L('D.orders-tab-rows', /TP-\d+/.test(ob) ? 'TP orders listed' : 'none listed');
    L('D.test-order-address', /E2E test address|Abbas El Akkad/.test(ob) ? 'YES — fake addresses in admin' : 'no');
  }
  // export CSV
  const resp = await page.evaluate(() => fetch('/api/admin/orders/export').then((r) => ({ s: r.status, t: r.headers.get('content-type') })).catch((e) => ({ e: String(e) })));
  L('D.csv-export', JSON.stringify(resp));
  L('D.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 5)) : 'none');
  await page.screenshot({ path: 'scripts/shot-audit-admin.png' });
  await ctx.close();
}

// ============ E. extra user checks ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  // language toggle EN -> AR persistence
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  const toggle = page.locator('button[aria-label="Toggle language"], button[aria-label="تبديل اللغة"]').first();
  if (await toggle.count()) {
    await toggle.click(); await page.waitForTimeout(1500);
    const dir = await page.evaluate(() => document.documentElement.dir);
    L('E.lang-toggle-dir', dir);
    await page.reload({ waitUntil: 'networkidle' });
    const dir2 = await page.evaluate(() => document.documentElement.dir);
    L('E.lang-persist', dir2);
  }
  // out-of-stock product behavior
  await page.goto(SITE + '/category/vitamins?inStock=true', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  // find an OOS product from API
  const oos = await page.evaluate(() => fetch('/api/products?limit=60').then((r) => r.json()).then((d) => d.items.find((p) => p.stock === 0)).catch(() => null));
  if (oos) {
    await page.goto(SITE + '/product/' + oos.slug, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    const b = await page.locator('body').innerText();
    L('E.oos-product', oos.slug + ' → ' + (/غير متوفر|Out of stock/i.test(b) ? 'badge shown ✓' : 'NOT SHOWN'));
    const addBtn = page.locator('button:has-text("أضف للعربة"), button:has-text("Add to Cart")').first();
    L('E.oos-add-disabled', await addBtn.isDisabled().catch(() => 'n/a'));
  }
  // orders page for guest (empty state)
  await page.goto(SITE + '/orders', { waitUntil: 'networkidle', timeout: 30000 });
  const ob = await page.locator('body').innerText();
  L('E.guest-orders-empty', /لا توجد طلبات|No orders|سجّل الدخول|login/i.test(ob) ? 'empty/login state ✓' : 'odd: ' + ob.slice(0, 80).replace(/\n/g, ' '));
  L('E.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

await browser.close();
console.log('done');

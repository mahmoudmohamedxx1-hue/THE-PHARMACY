// Re-run B (auth via /me) + C (AI features with proper selectors) + D (admin)
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });

async function makePage(ctx) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 130)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 130)); });
  page._errs = errs;
  return page;
}
const L = (k, v) => console.log(`[${k}] ${v}`);

// ============ B. AUTH JOURNEY (verified via /api/auth/me) ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  const email = 'audit2' + Date.now() + '@test.com';
  await page.goto(SITE + '/register', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#name').fill('Audit Two');
  await page.locator('#email').fill(email);
  await page.locator('#phone').fill('01098765432').catch(() => {});
  await page.locator('#password').fill('AuditPass123');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(4000);
  const me1 = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()).catch((e) => ({ err: String(e) })));
  L('B.register-session', me1?.user ? `logged in as ${me1.user.email} ✓` : 'NOT LOGGED IN: ' + JSON.stringify(me1).slice(0, 100));
  // logout via account page
  await page.goto(SITE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
  const logout = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout")').first();
  if (await logout.count()) { await logout.click(); await page.waitForTimeout(2000); }
  const me2 = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()).catch(() => null));
  L('B.logout', me2?.user ? 'STILL LOGGED IN ✗' : 'logged out ✓');
  // login demo
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill('demo@thepharmacy.com');
  await page.locator('#password').fill('Demo@2026');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);
  const me3 = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()).catch(() => null));
  L('B.login-demo', me3?.user ? `OK — ${me3.user.name}` : 'FAILED');
  L('B.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ C. AI FEATURES ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  // scope to the chat input by placeholder
  const inp = page.locator('input[placeholder*="صداع"], input[placeholder*="symptoms"], input[placeholder*="أعراض"]').first();
  if (await inp.count()) {
    await inp.fill('عندي صداع خفيف، إيه الأنسب؟');
    await page.locator('button[aria-label="إرسال"], button[aria-label="Send"]').first().click();
    await page.waitForTimeout(25000);
    const b = await page.locator('body').innerText();
    const aiOk = /بانادول|Panadol|مسكن|paracetamol|مضاد للالتهاب|فيتامين/i.test(b) && b.length > 500;
    const aiErr = /مشغولة|busy|try again|حاول مرة أخرى/i.test(b);
    L('C.assistant-reply', aiOk ? 'got reply ✓' : aiErr ? 'AI BUSY (graceful)' : 'NO REPLY — tail: ' + b.slice(-200).replace(/\n/g, ' '));
    L('C.assistant-products', /منتجات مقترحة|Suggested products/i.test(b) ? 'product cards shown ✓' : 'none');
  } else L('C.assistant-input', 'NOT FOUND by placeholder');

  // interactions
  await page.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const addBtn = page.locator('button:has-text("أضف دواء"), button:has-text("Add medicine")').first();
  if (await addBtn.count()) {
    const medInput = page.locator('input[placeholder*="Panadol"], input[placeholder*="مثال: بانادول"]');
    let n = await medInput.count();
    if (n === 0) { await addBtn.click(); await page.waitForTimeout(400); }
    const inputs = page.locator('input[placeholder*="مثال"], input[placeholder*="e.g."]');
    if ((await inputs.count()) >= 1) await inputs.first().fill('Panadol Extra');
    await addBtn.click();
    await page.waitForTimeout(400);
    const inputs2 = page.locator('input[placeholder*="مثال"], input[placeholder*="e.g."]');
    if ((await inputs2.count()) >= 2) await inputs2.nth(1).fill('Aspirin');
    const analyze = page.locator('button:has-text("تحليل التعارضات"), button:has-text("Analyze")').first();
    if (await analyze.count()) { await analyze.click(); await page.waitForTimeout(25000); }
    const b = await page.locator('body').innerText();
    L('C.interactions', /خطر|risk|تعارض|interaction|متوسط|moderate|منخفض|low|Line/i.test(b) ? 'analysis shown ✓' : 'NO RESULT — tail: ' + b.slice(-150).replace(/\n/g, ' '));
  } else L('C.interactions-addbtn', 'NOT FOUND');

  // prescription OCR
  await page.goto(SITE + '/prescription', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const fileInput = page.locator('input[type=file]');
  if (await fileInput.count()) {
    await fileInput.setInputFiles('/tmp/presc-sample.png');
    await page.waitForTimeout(1200);
    const readBtn = page.locator('button:has-text("اقرأها"), button:has-text("Read with AI")').first();
    if (await readBtn.count()) {
      await readBtn.click();
      await page.waitForTimeout(35000);
      const b = await page.locator('body').innerText();
      const meds = ['Panadol', 'Augmentin', 'Ventolin', 'بانادول', 'أوجمنتين'];
      const found = meds.filter((m) => b.includes(m));
      L('C.rx-ocr', found.length ? `extracted: ${found.join(', ')} ✓` : 'NO MEDS — tail: ' + b.slice(0, 250).replace(/\n/g, ' '));
    } else L('C.rx-read-btn', 'NOT FOUND');
  } else L('C.rx-file-input', 'NOT FOUND');
  L('C.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 5)) : 'none');
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
  L('D.admin-loads', /لوحة تحكم|Admin Dashboard/i.test(b) ? 'YES' : 'NO — ' + b.slice(0, 100).replace(/\n/g, ' '));
  const ordersStat = b.match(/الطلبات\s*\n?\s*(\d+)|Orders\s*\n?\s*(\d+)/);
  L('D.orders-stat', ordersStat ? (ordersStat[1] || ordersStat[2]) : 'not found');
  const usersStat = b.match(/العملاء\s*\n?\s*(\d+)|Customers\s*\n?\s*(\d+)/);
  L('D.customers-stat', usersStat ? (usersStat[1] || usersStat[2]) : 'not found');
  L('D.fake-orders-visible', /TP-3873878838|TP-1583394900|E2E test address/.test(b) ? 'YES — FAKE/TEST ORDERS SHOWN' : 'no');
  L('D.funnel-rendered', /قمع التحويل|Conversion funnel/i.test(b) ? 'yes' : 'no');
  const conv = b.match(/([\d.]+)\s*%/);
  L('D.conversion-rate', conv ? conv[1] + '%' : 'n/a');
  L('D.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 5)) : 'none');
  await page.screenshot({ path: 'scripts/shot-audit-admin.png' });
  await ctx.close();
}

await browser.close();
console.log('\nB/C/D complete.');

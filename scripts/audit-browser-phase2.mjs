// Task 17 — Phase 2+3: full user journeys in-browser (commerce, auth, AI, admin)
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

// ============ A. GUEST CHECKOUT JOURNEY ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  // add to cart
  const addBtn = page.locator('a[href*="/product/"] button[aria-label*="للعربة"], a[href*="/product/"] button[aria-label*="Add to cart"]').first();
  if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(1200); L('A.add-to-cart', 'clicked'); }
  else L('A.add-to-cart', 'BUTTON NOT FOUND');
  // open cart drawer
  const cartBtn = page.locator('header button[aria-label*="عربة"], header button[aria-label*="cart" i]').first();
  if (await cartBtn.count()) {
    await cartBtn.click(); await page.waitForTimeout(900);
    const drawer = await page.locator('body').innerText();
    L('A.cart-drawer', /جنيه|EGP/.test(drawer) ? 'shows item' : 'EMPTY');
  } else L('A.cart-drawer', 'cart button NOT FOUND');
  // close drawer before navigating
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('[data-slot="sheet-overlay"]').forEach((el) => el.remove()));
  // go to checkout page
  await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  // fill the form
  await page.locator('#name').fill('Audit Tester').catch(() => L('A.form', 'name field missing'));
  await page.locator('#phone').fill('01012345679').catch(() => {});
  const zoneSelect = page.locator('button[role="combobox"]').first();
  if (await zoneSelect.count()) {
    await zoneSelect.click(); await page.waitForTimeout(500);
    await page.locator('[role="option"]').nth(2).click().catch(() => L('A.zone', 'could not pick zone'));
  }
  await page.locator('#address, textarea').first().fill('Audit Street 12, Building 4').catch(() => {});
  await page.locator('button[type=submit], button:has-text("تأكيد الطلب"), button:has-text("Place Order")').first().click().catch((e) => L('A.submit', String(e).slice(0, 80)));
  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText();
  const orderNum = body.match(/TP-\d+/)?.[0];
  L('A.order-placed', orderNum ? `YES — ${orderNum}` : 'NO ORDER NUMBER');
  L('A.success-page', /تم تأكيد طلبك|Order Placed/i.test(body) ? 'YES' : 'NO');
  L('A.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ B. AUTH JOURNEY ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  const email = 'audit' + Date.now() + '@test.com';
  await page.goto(SITE + '/register', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#name').fill('Audit User');
  await page.locator('#email').fill(email);
  await page.locator('#phone').fill('01098765432').catch(() => {});
  await page.locator('#password').fill('AuditPass123');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3500);
  const b1 = await page.locator('body').innerText();
  L('B.register', /حسابي|Account|تسجيل الخروج|Logout/i.test(b1) ? 'logged in ✓' : 'FAILED: ' + b1.slice(0, 80).replace(/\n/g, ' '));
  // logout
  await page.goto(SITE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
  const logout = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout")').first();
  if (await logout.count()) { await logout.click(); await page.waitForTimeout(2000); }
  // login demo
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill('demo@thepharmacy.com');
  await page.locator('#password').fill('Demo@2026');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);
  const b2 = await page.locator('body').innerText();
  L('B.login-demo', /حسابي|Account|تسجيل الخروج|Logout/i.test(b2) ? 'OK' : 'FAILED');
  // wrong password
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill('demo@thepharmacy.com');
  await page.locator('#password').fill('wrongpass');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(2500);
  const b3 = await page.locator('body').innerText();
  L('B.login-wrongpass', /غير صحيح|Invalid/i.test(b3) ? 'shows error ✓' : 'NO ERROR SHOWN');
  L('B.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 3)) : 'none');
  await ctx.close();
}

// ============ C. AI FEATURES ============
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await makePage(ctx);
  // assistant
  await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const inp = page.locator('form input:visible, textarea:visible').first();
  if (await inp.count()) {
    await inp.fill('عندي صداع خفيف، إيه الأنسب؟');
    await page.locator('form button[type=submit], form button:has-text("إرسال"), form button:has-text("Send")').first().click();
    await page.waitForTimeout(20000); // AI can be slow
    const b = await page.locator('body').innerText();
    const aiOk = b.includes('صداع') || /بانادول|Panadol|مسكن|paracetamol/i.test(b);
    const aiErr = /مشغولة|busy|حاول مرة أخرى|try again/i.test(b);
    L('C.assistant-reply', aiOk ? 'got reply ✓' : aiErr ? 'AI BUSY (degraded gracefully)' : 'NO REPLY: ' + b.slice(-200).replace(/\n/g, ' '));
  } else L('C.assistant', 'input not found');
  // interactions
  await page.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const add1 = page.locator('button:has-text("أضف دواء"), button:has-text("Add medicine")').first();
  if (await add1.count()) {
    await add1.click(); await page.waitForTimeout(500);
    const medInputs = page.locator('input[placeholder*="Panadol"], input[placeholder*="بانادول"]');
    if (await medInputs.count()) await medInputs.first().fill('Panadol Extra');
    await add1.click(); await page.waitForTimeout(500);
    const allInputs = page.locator('input[placeholder*="مثال"], input[placeholder*="e.g."]');
    if ((await allInputs.count()) >= 2) await allInputs.nth(1).fill('Aspirin');
    const analyze = page.locator('button:has-text("تحليل التعارضات"), button:has-text("Analyze")').first();
    if (await analyze.count()) { await analyze.click(); await page.waitForTimeout(20000); }
    const b = await page.locator('body').innerText();
    L('C.interactions', /خطر|risk|تعارض|interaction|متوسط|moderate|منخفض|low/i.test(b) ? 'analysis shown ✓' : 'NO RESULT: ' + b.slice(-150).replace(/\n/g, ' '));
  } else L('C.interactions', 'add-medicine button not found');
  // prescription OCR
  await page.goto(SITE + '/prescription', { waitUntil: 'networkidle', timeout: 30000 });
  const fileInput = page.locator('input[type=file]');
  if (await fileInput.count()) {
    await fileInput.setInputFiles('/tmp/presc-sample.png');
    const readBtn = page.locator('button:has-text("اقرأها"), button:has-text("Read with AI")').first();
    if (await readBtn.count()) {
      await readBtn.click();
      await page.waitForTimeout(30000);
      const b = await page.locator('body').innerText();
      const meds = ['Panadol', 'Augmentin', 'Ventolin', 'بانادول', 'أوجمنتين'];
      const found = meds.filter((m) => b.includes(m));
      L('C.rx-ocr', found.length ? `extracted: ${found.join(', ')}` : 'NO MEDS — ' + b.slice(0, 200).replace(/\n/g, ' '));
    } else L('C.rx-ocr', 'read button not found');
  } else L('C.rx-ocr', 'no file input');
  L('C.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 5)) : 'none');
  await ctx.close();
}

// ============ D. ADMIN DASHBOARD (fake-data surface check) ============
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
  // stat cards
  const ordersStat = b.match(/الطلبات\s*\n?\s*(\d+)|Orders\s*\n?\s*(\d+)/);
  L('D.admin-orders-stat', ordersStat ? (ordersStat[1] || ordersStat[2]) : 'not found');
  const usersStat = b.match(/العملاء\s*\n?\s*(\d+)|Customers\s*\n?\s*(\d+)/);
  L('D.admin-customers-stat', usersStat ? (usersStat[1] || usersStat[2]) : 'not found');
  const revenue = b.match(/([\d.,]+)\s*(جنيه|EGP)/);
  L('D.admin-revenue', revenue ? revenue[1] + ' EGP' : 'not shown');
  // fake orders visible?
  L('D.fake-orders-visible', /TP-3873878838|TP-1583394900|E2E test address/.test(b) ? 'YES — FAKE ORDERS SHOWN' : 'no');
  // funnel / analytics
  L('D.analytics-funnel', /قمع التحويل|Conversion funnel/i.test(b) ? 'rendered' : 'not rendered');
  const conv = b.match(/([\d.]+)\s*%/);
  L('D.conversion', conv ? conv[1] + '%' : 'n/a');
  // pending orders in table with fake address?
  L('D.pending-order-rows', (b.match(/قيد الانتظار|pending/gi) || []).length + ' pending mentions');
  // tabs work?
  const tabs = await page.locator('button[role="tab"], [role="tab"]').count();
  L('D.tabs', tabs);
  L('D.errors', page._errs.length ? JSON.stringify(page._errs.slice(0, 5)) : 'none');
  await page.screenshot({ path: 'scripts/shot-audit-admin.png', fullPage: false });
  await ctx.close();
}

await browser.close();
console.log('\nPhase 2+3 complete.');

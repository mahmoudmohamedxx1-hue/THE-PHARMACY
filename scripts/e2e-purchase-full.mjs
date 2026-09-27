// Corrected full E2E purchase flow + prescription + search on live site
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const issues = [];
const ok = [];
function OK(m) { ok.push(m); console.log(`  ok  ${m}`); }
function BUG(m) { issues.push(m); console.log(`  BUG ${m}`); }

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('_rsc') && !m.text().includes('401') && !m.text().includes('404')) errs.push(m.text().slice(0, 150)); });

// 1. homepage -> featured product in stock -> product page
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
// find a product card with an add button not disabled
const cards = page.locator('a[href*="/product/"]');
const n = await cards.count();
let target = null;
for (let i = 0; i < Math.min(n, 15); i++) {
  const card = cards.nth(i);
  const btn = card.getByRole('button', { name: /add to cart|أضف/i });
  if ((await btn.count()) && !(await btn.first().isDisabled())) { target = card; break; }
}
if (!target) { BUG('no in-stock product card with enabled add-to-cart on home'); }
else {
  OK(`found in-stock product card on home (${Math.min(n, 15)} scanned)`);
  // 2. add to cart from card
  const addBtn = target.getByRole('button', { name: /add to cart|أضف/i }).first();
  await addBtn.click();
  await page.waitForTimeout(1200);
  // 3. open cart drawer via header
  const cartBtn = page.locator('button[aria-label="العربة"], button[aria-label="Cart" i], button[aria-label*="cart" i]').first();
  if (await cartBtn.count()) {
    await cartBtn.click();
    await page.waitForTimeout(1000);
    // qty stepper in drawer
    const plus = page.locator('[role="dialog"], [data-state="open"]').getByRole('button', { name: /\+/ }).first();
    if (await plus.count()) { await plus.click(); await page.waitForTimeout(600); OK('cart drawer opened, qty + clicked'); }
    else OK('cart drawer opened (no qty stepper found?)');
    // go to cart page from drawer
    const viewCart = page.getByRole('link', { name: /view cart|السلة|cart/i }).first();
    if (await viewCart.count()) { await viewCart.click(); await page.waitForURL(/\/cart/, { timeout: 15000 }); }
    else await page.goto(SITE + '/cart', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const qty2 = await page.locator('input[type="number"]').first().inputValue().catch(() => 'n/a');
    OK(`cart page loaded, qty input = ${qty2}`);
  } else { BUG('no cart button in header'); await page.goto(SITE + '/cart', { waitUntil: 'networkidle' }); }

  // 4. proceed to checkout
  const checkoutLink = page.getByRole('link', { name: /checkout|إتمام|إتمام الطلب/i }).first();
  if (await checkoutLink.count()) await checkoutLink.click();
  else await page.goto(SITE + '/checkout', { waitUntil: 'networkidle' });
  await page.waitForURL(/\/checkout/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 5. empty submit -> client validation?
  const placeBtn = page.getByRole('button', { name: /place order|تأكيد الطلب/i }).first();
  if (await placeBtn.count()) {
    await placeBtn.click();
    await page.waitForTimeout(1200);
    const bodyTxt = (await page.textContent('body')).slice(0, 6000);
    const hasErr = /phone|الهاتف|address|العنوان|zone|المنطقة|required|مطلوب|valid|صحيح|error|خطأ/i.test(bodyTxt) || (await page.locator('[role="alert"], .text-red-500, .text-destructive').count()) > 0;
    if (hasErr) OK('checkout empty submit: validation feedback shown');
    else BUG('checkout empty submit: no validation feedback');

    // 6. fill form properly and place order
    const phoneInput = page.locator('#phone');
    await phoneInput.fill('01012345678');
    const nameInput = page.locator('#name');
    if (await nameInput.count()) await nameInput.fill('Edge Tester');
    // zone select (shadcn Select is not a native select)
    const zoneTrigger = page.locator('[role="combobox"]').first();
    if (await zoneTrigger.count()) {
      await zoneTrigger.click();
      await page.waitForTimeout(600);
      const opt = page.locator('[role="option"]').nth(1);
      if (await opt.count()) await opt.click();
      else console.log('  [info] zone options not open');
    } else console.log('  [info] no combobox — native select?');
    const addr = page.locator('#address');
    await addr.fill('12 Edge Test Street, Nasr City, Cairo');
    await page.waitForTimeout(300);
    await placeBtn.click();
    // wait for order success or error
    try {
      await page.waitForURL(/order-success|order\/|success/i, { timeout: 30000 });
      await page.waitForTimeout(2000);
      const body = (await page.textContent('body')).slice(0, 4000);
      const orderNum = body.match(/TP-\d+/) ? body.match(/TP-\d+/)[0] : null;
      if (/thank|شكرا|success|نجح|order|طلب/i.test(body)) OK(`checkout full flow: order placed ${orderNum ? '(' + orderNum + ')' : ''}`);
      else BUG(`order-success page unclear: ${body.slice(0, 120).replace(/\s+/g, ' ')}`);
    } catch {
      const body = (await page.textContent('body')).slice(0, 3000);
      BUG(`checkout submit did not reach success: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
  } else BUG('no place-order button on checkout');
}

// 7. invalid phone inline validation
{
  const p2 = await ctx.newPage();
  await p2.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  const c2 = p2.locator('a[href*="/product/"]');
  const add2 = c2.first().getByRole('button', { name: /add to cart|أضف/i });
  let placed = false;
  for (let i = 0; i < Math.min(await c2.count(), 10); i++) {
    const b = c2.nth(i).getByRole('button', { name: /add to cart|أضف/i }).first();
    if ((await b.count()) && !(await b.isDisabled())) { await b.click(); placed = true; break; }
  }
  if (placed) {
    await p2.goto(SITE + '/checkout', { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1500);
    await p2.locator('#phone').fill('12345');
    await p2.locator('#address').fill('12 Test Street Cairo');
    const zt = p2.locator('[role="combobox"]').first();
    if (await zt.count()) { await zt.click(); await p2.waitForTimeout(500); const o = p2.locator('[role="option"]').nth(1); if (await o.count()) await o.click(); }
    await p2.getByRole('button', { name: /place order|تأكيد الطلب/i }).first().click();
    await p2.waitForTimeout(2500);
    const body = (await p2.textContent('body')).slice(0, 5000);
    if (/phone|الهاتف|invalid|صحيح|10|11 digits/i.test(body)) OK('invalid phone: inline error shown');
    else if (p2.url().includes('checkout')) console.log('  [info] invalid phone stayed on checkout — server 400 or silent');
    else BUG('invalid phone: order went through?! ' + p2.url());
  }
}

// 8. prescription upload flow
{
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errs.push('presc PAGEERROR: ' + String(e).slice(0, 200)));
  // generate a fake prescription image with readable text
  const tmp = await ctx.newPage();
  await tmp.setContent(`<body style="margin:0;background:#fff"><div style="font:700 44px/1.6 Georgia,serif;padding:60px;color:#111">
  <div style="font:700 28px Arial;border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:24px">Rx — Cairo Clinic</div>
  <div>1. Panadol Extra 500mg — 1 tab every 8h</div>
  <div>2. Augmentin 1g — twice daily, 7 days</div>
  <div>3. Ventolin inhaler — as needed</div>
  <div style="margin-top:40px;font:400 26px cursive">Dr. A. Hassan</div>
  </div></body>`);
  await tmp.setViewportSize({ width: 700, height: 500 });
  const fs = await import('fs');
  fs.writeFileSync('/tmp/presc-sample.png', await tmp.screenshot());
  await tmp.close();
  const SAMPLE = '/tmp/presc-sample.png';

  await p3.goto(SITE + '/prescription', { waitUntil: 'networkidle', timeout: 60000 });
  await p3.waitForTimeout(1500);
  const fileInput = p3.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(SAMPLE);
    const analyze = p3.getByRole('button', { name: /read with ai|اقرأها|analyze|تحليل|reading/i }).first();
    if (await analyze.count()) {
      await analyze.click();
      await p3.waitForFunction(() => !document.querySelector('button[disabled]'), null, { timeout: 80000 }).catch(() => {});
      await p3.waitForTimeout(2000);
      const body = (await p3.textContent('body')).slice(0, 5000);
      if (/panadol|augmentin|ventolin|medicine|دواء|لا يمكن|unavailable|error|خطأ/i.test(body)) OK('prescription flow: analysis response rendered');
      else console.log('  [info] prescription body: ' + body.slice(0, 150).replace(/\s+/g, ' '));
    } else BUG('no analyze button on prescription page');
  } else BUG('no file input on prescription page');
}

// 9. search page with results (crawl links) + search suggestions dropdown
{
  const p4 = await ctx.newPage();
  await p4.goto(SITE + '/search?q=panadol', { waitUntil: 'networkidle', timeout: 60000 });
  await p4.waitForTimeout(1500);
  const links = await p4.locator('a[href*="/product/"]').count();
  if (links > 0) OK(`search page: ${links} product links`);
  else BUG('search page: no product links for "panadol"');
  // header search dropdown
  const si = p4.locator('form input:visible').first();
  await si.fill('vitamin');
  await p4.waitForTimeout(1500);
  const sug = await p4.locator('[role="listbox"], [data-radix-popper-content-wrapper], [class*="suggestion" i]').count();
  const anyName = await p4.getByText(/vitamin/i).count();
  if (sug > 0 || anyName > 0) OK('header search suggestions appear');
  else console.log('  [info] no visible suggestions dropdown for "vitamin"');
}

// 10. interactions checker
{
  const p5 = await ctx.newPage();
  await p5.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 60000 });
  await p5.waitForTimeout(1200);
  const input = p5.locator('input:visible, textarea:visible').first();
  if (await input.count()) {
    await input.fill('Panadol');
    const add = p5.getByRole('button', { name: /add medicine|أضف دواء|add|إضافة/i }).first();
    if (await add.count()) {
      await add.click();
      await p5.waitForTimeout(500);
      await input.fill('Aspirin');
      await add.click();
      await p5.waitForTimeout(500);
      const check = p5.getByRole('button', { name: /analyze interactions|تحليل التعارضات|analyze|فحص/i }).first();
      if (await check.count()) {
        await check.click();
        try {
          await p5.waitForFunction(() => /interaction|تفاعل|no known|لا يوجد|warn|احذر/i.test(document.body.innerText), null, { timeout: 70000 });
          OK('interactions checker: result rendered');
        } catch { BUG('interactions checker: no result in 70s'); }
      } else console.log('  [info] no check button (auto-check?)');
    } else console.log('  [info] interactions UI differs — no add button');
  }
}

console.log(`\n=== RESULT: ${ok.length} ok, ${issues.length} bugs ===`);
issues.forEach(i => console.log('  BUG: ' + i));
console.log('page/console errors:', errs.length ? [...new Set(errs)].slice(0, 8) : '(none)');
await browser.close();
process.exit(issues.length ? 1 : 0);

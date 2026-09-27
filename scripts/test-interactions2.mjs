import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto('https://the-pharmacy-two.vercel.app/interactions', { waitUntil: 'networkidle', timeout: 45000 });
const inputs = await page.locator('main input').all();
console.log('inputs in main:', inputs.length);
for (const inp of inputs) console.log('  placeholder:', await inp.getAttribute('placeholder'));
const input = page.locator('main input').first();
await input.fill('Panadol');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
await input.fill('Brufen');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const checkBtn = page.locator('main button').filter({ hasText: /فحص|Check|تحليل|analyze/i }).first();
console.log('check btn found:', await checkBtn.count() > 0);
if (await checkBtn.count()) {
  await checkBtn.click();
  await page.waitForTimeout(8000);
  const body = await page.locator('body').innerText();
  console.log('has interaction result:', /تفاعل|interaction|تعارض|conflict|لا يوجد|no interaction/i.test(body));
  console.log('has unavailable msg:', body.includes('غير مفعّلة') || body.includes('not enabled'));
}
await page.screenshot({ path: '/tmp/interactions.png' });
await browser.close();

import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto('https://the-pharmacy-two.vercel.app/interactions', { waitUntil: 'networkidle', timeout: 45000 });
// find the drug input and add two meds
const input = page.locator('input[placeholder*="دواء"], input[placeholder*="medicine"], input[placeholder*="medication"], input[placeholder*="Add"]').first();
console.log('input found:', await input.count() > 0);
if (await input.count()) {
  await input.fill('Panadol');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await input.fill('Brufen');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const checkBtn = page.locator('button:has-text("فحص"), button:has-text("Check"), button:has-text("check")').first();
  if (await checkBtn.count()) {
    await checkBtn.click();
    await page.waitForTimeout(8000);
    const body = await page.locator('body').innerText();
    console.log('has result/interaction info:', /تفاعل|interaction|تعارض|conflict|No interaction|لا يوجد/i.test(body));
    console.log('has unavailable msg:', body.includes('غير مفعّلة') || body.includes('not enabled'));
  } else console.log('check button not found');
  await page.screenshot({ path: '/tmp/interactions.png' });
}
await browser.close();

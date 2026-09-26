// AI Assistant chat flow test (correct element: shadcn Input, not textarea)
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 45000 });
const input = page.locator('input[placeholder*="headache"], input[placeholder*="صداع"], input[aria-label*="headache"], input[aria-label*="صداع"]').first();
console.log('input found:', await input.count() > 0);
await input.fill('I have a headache, what should I take?');
const sendBtn = page.locator('button[aria-label="إرسال"], button[aria-label*="Send"], button[aria-label*="send"]').first();
console.log('send button enabled:', await sendBtn.isEnabled());
await sendBtn.click();
await page.waitForTimeout(8000);
const body = await page.locator('body').innerText();
console.log('user message echoed:', body.includes('headache'));
console.log('graceful unavailable msg:', body.includes('غير مفعّلة') || body.includes('not enabled'));
// check for the assistant's reply bubble (any element after our message)
const msgCount = await page.locator('[class*="rounded"], [class*="bubble"]').count();
console.log('message-like elements on page:', msgCount);
await page.screenshot({ path: '/tmp/assistant-live.png', fullPage: false });
console.log('screenshot saved');
await browser.close();

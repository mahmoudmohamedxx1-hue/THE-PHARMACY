// E2E: AI assistant page — type a question, verify a reply renders
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));

await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 45000 });
await page.screenshot({ path: '/tmp/assistant-before.png' });

// find the chat input (textarea preferred)
const ta = page.locator('textarea').first();
const inp = page.locator('form input:visible').last();
const target = (await ta.count()) ? ta : inp;
console.log('input kind:', (await ta.count()) ? 'textarea' : 'form input (visible)');

if (await target.count()) {
  await target.fill('I have a headache, what should I take?');
  await page.screenshot({ path: '/tmp/assistant-typed.png' });
  // click send button
  const send = page.locator('button[type=submit]').last();
  if (await send.count()) await send.click();
  else await target.press('Enter');

  // wait up to 45s for an assistant reply bubble
  try {
    await page.waitForFunction(
      () => document.body.innerText.length > 0 && /headache|صداع|Panadol|paracetamol|pain/i.test(document.body.innerText),
      { timeout: 45000 },
    );
    const body = await page.locator('body').innerText();
    console.log('AI REPLY RENDERED ✓');
    console.log('excerpt:', body.split('\n').slice(-12).join(' | ').slice(0, 400));
  } catch {
    console.log('AI REPLY DID NOT RENDER ✗');
    const body = await page.locator('body').innerText();
    console.log('body tail:', body.split('\n').slice(-8).join(' | ').slice(0, 300));
  }
  await page.screenshot({ path: '/tmp/assistant-after.png' });
} else {
  console.log('NO INPUT FOUND on assistant page ✗');
}

if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();

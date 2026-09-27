// Debug: assistant page DOM + lang toggle + assistant live chat
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));

// --- lang toggle test ---
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 60000 });
console.log('home dir:', await page.getAttribute('html', 'dir'), '| html lang:', await page.getAttribute('html', 'lang'));
const enBtn = page.locator('button', { hasText: /^EN$/ }).first();
console.log('EN button count:', await page.locator('button', { hasText: /^EN$/ }).count());
await enBtn.click();
await page.waitForTimeout(1500);
console.log('after EN click: dir =', await page.getAttribute('html', 'dir'), '| lang =', await page.getAttribute('html', 'lang'));
const heroEn = await page.locator('h1').first().textContent().catch(() => '');
console.log('h1 after EN:', (heroEn || '').trim().slice(0, 60));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
console.log('after reload: dir =', await page.getAttribute('html', 'dir'), '| h1 =', (await page.locator('h1').first().textContent().catch(() => '') || '').trim().slice(0, 60));

// --- assistant page DOM ---
console.log('\n=== /assistant DOM ===');
const page2 = await ctx.newPage();
page2.on('pageerror', e => errs.push('assistant PAGEERROR: ' + String(e).slice(0, 250)));
await page2.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 60000 });
await page2.waitForTimeout(2000);
console.log('url:', page2.url());
const forms = await page2.locator('form').count();
console.log('forms:', forms);
for (let i = 0; i < forms; i++) {
  const f = page2.locator('form').nth(i);
  const inputs = await f.locator('input, textarea, button').allTextContents().catch(() => []);
  const btnCount = await f.locator('button').count();
  const inputAttrs = await f.locator('input, textarea').evaluateAll(els => els.map(e => ({ tag: e.tagName, type: e.getAttribute('type'), aria: e.getAttribute('aria-label'), placeholder: (e.getAttribute('placeholder') || '').slice(0, 30) }))).catch(() => []);
  console.log(`  form[${i}]: buttons=${btnCount} controls=${JSON.stringify(inputAttrs).slice(0, 220)}`);
}
// send a message and wait for reply
const chatInput = page2.locator('form').last().locator('input').first();
if (await chatInput.count()) {
  await chatInput.fill('What is Panadol used for?');
  const sendBtn = page2.locator('form').last().locator('button[type="submit"], button').last();
  await sendBtn.click();
  console.log('message sent, waiting for AI reply...');
  try {
    await page2.waitForFunction(() => document.body.innerText.match(/pain|fever|المسكن|panadol/i) && !document.body.innerText.match(/loading/i), null, { timeout: 75000 });
    console.log('AI REPLY RECEIVED');
  } catch {
    console.log('no reply in 75s');
  }
  await page2.waitForTimeout(1000);
  const body = await page2.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log('--- chat body ---\n' + body.split('\n').filter(l => l.trim()).slice(-12).join('\n'));
} else {
  console.log('NO CHAT INPUT FOUND');
  const body = await page2.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('body:', body.replace(/\s+/g, ' '));
}

console.log('\nconsole/page errors:', errs.length ? errs.slice(0, 8) : '(none)');
await browser.close();

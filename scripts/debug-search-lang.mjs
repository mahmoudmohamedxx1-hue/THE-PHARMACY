// Debug: search page product links + language toggle
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

console.log('=== SEARCH PAGE STRUCTURE ===');
await page.goto(SITE + '/search/panadol', { waitUntil: 'networkidle', timeout: 30000 });
const links = await page.locator('a').all();
const hrefs = [];
for (const l of links.slice(0, 25)) hrefs.push(await l.getAttribute('href').catch(() => null));
console.log('all links (first 25):', JSON.stringify(hrefs.filter(Boolean).slice(0, 20)));
const bodyTxt = await page.locator('body').innerText();
console.log('has product name text:', bodyTxt.includes('Panadol'), '| has "no results":', /no|لا|نتائج/i.test(bodyTxt.slice(0, 200)));
console.log('body excerpt:', bodyTxt.replace(/\n+/g, ' | ').slice(0, 400));

console.log('\n=== LANGUAGE TOGGLE ===');
await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 30000 });
const h1Before = await page.locator('h1').first().textContent();
// find all buttons in header
const btns = await page.locator('header button, nav button, button').all();
const btnInfo = [];
for (const b of btns.slice(0, 12)) {
  const t = (await b.textContent().catch(() => '')).trim().slice(0, 20);
  const aria = await b.getAttribute('aria-label').catch(() => null);
  btnInfo.push(t + (aria ? ` [${aria}]` : ''));
}
console.log('buttons (first 12):', JSON.stringify(btnInfo));
const htmlBefore = await page.locator('html').getAttribute('dir');
const langBtn = page.locator('button:has-text("English"), button:has-text("EN"), button:has-text("عربي"), button[aria-label*="nglish"], button[aria-label*="anguage"]').first();
if (await langBtn.count()) {
  await langBtn.click();
  await page.waitForTimeout(2500);
  const h1After = await page.locator('h1').first().textContent();
  const dirAfter = await page.locator('html').getAttribute('dir');
  console.log(`h1: "${h1Before}" -> "${h1After}" | dir: ${htmlBefore} -> ${dirAfter}`);
} else {
  console.log('NO language toggle button found!');
  console.log('html dir:', htmlBefore);
}

await browser.close();

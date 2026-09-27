// Direct Playwright test of the prescription flow on the live Vercel site
// (bypasses the agent-browser daemon whose eval channel is broken)
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'https://the-pharmacy-two.vercel.app';
const IMG = '/home/z/my-project/public/images/products/panadol-extra.webp';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const consoleMsgs = [];
const pageErrors = [];
const failedReqs = [];
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
page.on('requestfailed', (r) => failedReqs.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));

console.log('1. Opening prescription page…');
await page.goto(`${SITE}/prescription`, { waitUntil: 'networkidle', timeout: 45000 });

// Baseline: page responsive?
await page.evaluate(() => 1 + 1);
console.log('   page responsive: YES');

console.log('2. Uploading image…');
await page.setInputFiles('input[type=file]', IMG);
await page.waitForTimeout(1500);
const hasPreview = await page.locator('img[alt="Prescription preview"]').count();
console.log(`   preview shown: ${hasPreview ? 'YES' : 'NO'}`);

console.log('3. Clicking "Read with AI"…');
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/prescriptions'), { timeout: 60000 }),
  page.getByRole('button', { name: /اقرأها بالذكاء|Read with AI/i }).click(),
]);
console.log(`   API status: ${resp.status()}`);

// Right after response — is the page responsive?
let responsive;
try {
  await Promise.race([
    page.evaluate(() => 1 + 1),
    new Promise((_, rej) => setTimeout(() => rej(new Error('EVAL TIMEOUT — page frozen')), 8000)),
  ]);
  responsive = 'YES';
} catch {
  responsive = 'NO — MAIN THREAD BLOCKED';
}
console.log(`   page responsive after response: ${responsive}`);

await page.waitForTimeout(3000);
// Error message visible?
const errText = await page.locator('p.text-red-600').allTextContents().catch(() => []);
console.log(`4. Error message displayed: ${errText.length ? JSON.stringify(errText) : 'NONE — silent failure!'}`);

// Responsive check again after wait
try {
  await Promise.race([
    page.evaluate(() => 1 + 1),
    new Promise((_, rej) => setTimeout(() => rej(new Error('EVAL TIMEOUT')), 8000)),
  ]);
  console.log('   page responsive after 3s wait: YES');
} catch {
  console.log('   page responsive after 3s wait: NO — MAIN THREAD BLOCKED');
}

await page.screenshot({ path: '/tmp/presc-flow.png', fullPage: false });
console.log('5. Screenshot saved: /tmp/presc-flow.png');

console.log('\n=== CONSOLE MESSAGES ===');
consoleMsgs.slice(-15).forEach((m) => console.log(m));
console.log('\n=== PAGE ERRORS ===');
pageErrors.forEach((e) => console.log(e));
console.log('\n=== FAILED REQUESTS ===');
failedReqs.forEach((r) => console.log(r));
if (!consoleMsgs.length && !pageErrors.length && !failedReqs.length) console.log('(none)');

await browser.close();

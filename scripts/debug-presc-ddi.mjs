// Isolated: prescription OCR upload + interactions checker on live
import { chromium } from 'playwright-core';
import fs from 'fs';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });

// generate fake prescription image
const tmp = await ctx.newPage();
await tmp.setContent(`<body style="margin:0;background:#fff"><div style="font:700 44px/1.6 Georgia,serif;padding:60px;color:#111">
<div style="font:700 28px Arial;border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:24px">Rx — Cairo Clinic</div>
<div>1. Panadol Extra 500mg — 1 tab every 8h</div>
<div>2. Augmentin 1g — twice daily, 7 days</div>
<div>3. Ventolin inhaler — as needed</div>
<div style="margin-top:40px;font:400 26px cursive">Dr. A. Hassan</div>
</div></body>`);
await tmp.setViewportSize({ width: 700, height: 500 });
fs.writeFileSync('/tmp/presc-sample.png', await tmp.screenshot());
await tmp.close();
console.log('sample prescription image written');

// --- prescription flow ---
const p3 = await ctx.newPage();
p3.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
await p3.goto(SITE + '/prescription', { waitUntil: 'networkidle', timeout: 60000 });
await p3.waitForTimeout(2500);
const fileInput = p3.locator('input[type="file"]').first();
console.log('file input count:', await fileInput.count());
await fileInput.setInputFiles('/tmp/presc-sample.png');
await p3.waitForTimeout(2000);
// preview should appear; find the analyze button
const btns = await p3.locator('button').all();
for (const b of btns) {
  const t = (await b.textContent().catch(() => '')).trim();
  if (t && t.length < 60) console.log('  button:', JSON.stringify(t));
}
const analyze = p3.getByRole('button', { name: /read with ai|اقرأها|analyze|تحليل|reading|الذكاء/i }).first();
console.log('analyze button count:', await analyze.count());
if (await analyze.count()) {
  await analyze.click();
  console.log('clicked analyze — waiting for result...');
  // wait until loading disappears and results render
  for (let i = 0; i < 30; i++) {
    await p3.waitForTimeout(3000);
    const body = await p3.evaluate(() => document.body.innerText);
    if (/panadol|augmentin|ventolin|دواء|confidence|ثقة|match|طابق/i.test(body) && !/يقرأ روشتتك/i.test(body.split('\n').pop())) {
      console.log(`RESULT after ${(i + 1) * 3}s:`);
      const lines = body.split('\n').filter(l => /panadol|augmentin|ventolin|confidence|ثقة|شباب|match|%/i.test(l)).slice(0, 12);
      lines.forEach(l => console.log('   ' + l.trim().slice(0, 100)));
      break;
    }
    if (i === 29) console.log('NO RESULT in 90s. tail:', body.replace(/\s+/g, ' ').slice(-300));
  }
}

// --- interactions flow ---
console.log('\n=== interactions ===');
const p5 = await ctx.newPage();
p5.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
await p5.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 60000 });
await p5.waitForTimeout(2000);
const body0 = await p5.evaluate(() => document.body.innerText.slice(0, 600));
console.log('interactions page snippet:', body0.replace(/\s+/g, ' ').slice(0, 300));
const inputs = p5.locator('input:visible');
console.log('visible inputs:', await inputs.count());
const i1 = inputs.first();
await i1.fill('Panadol');
await p5.waitForTimeout(500);
const addBtn = p5.getByRole('button', { name: /add medicine|أضف دواء|add/i }).first();
console.log('add-medicine button:', await addBtn.count());
if (await addBtn.count()) {
  await addBtn.click();
  await p5.waitForTimeout(500);
  await i1.fill('Aspirin');
  await p5.waitForTimeout(300);
  // pick a suggestion if dropdown appears
  const sug = p5.getByRole('option').first();
  if (await sug.count()) { await sug.click(); console.log('picked suggestion'); }
  await addBtn.click();
  await p5.waitForTimeout(500);
  const analyzeBtn = p5.getByRole('button', { name: /analyze interactions|تحليل التعارضات|analyze|فحص/i }).first();
  console.log('analyze-interactions button:', await analyzeBtn.count());
  if (await analyzeBtn.count()) {
    await analyzeBtn.click();
    for (let i = 0; i < 25; i++) {
      await p5.waitForTimeout(3000);
      const body = await p5.evaluate(() => document.body.innerText);
      if (/interaction|تفاعل|no known|لا يوجد|warn|احذر|مخاطر|خطر/i.test(body)) {
        console.log(`INTERACTIONS RESULT after ${(i + 1) * 3}s:`);
        body.split('\n').filter(l => /interaction|تفاعل|warn|احذر|خطر|risk|مخاطر/i.test(l)).slice(0, 8).forEach(l => console.log('   ' + l.trim().slice(0, 110)));
        break;
      }
      if (i === 24) console.log('NO RESULT in 75s');
    }
  }
}
await browser.close();

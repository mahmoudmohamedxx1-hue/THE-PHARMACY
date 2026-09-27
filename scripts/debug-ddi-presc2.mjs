// Final corrected: interactions checker + prescription OCR result verification
import { chromium } from 'playwright-core';
import fs from 'fs';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });

// --- interactions flow (correct scoping) ---
console.log('=== interactions ===');
const p5 = await ctx.newPage();
p5.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
await p5.goto(SITE + '/interactions', { waitUntil: 'networkidle', timeout: 60000 });
await p5.waitForTimeout(2000);
const i1 = p5.locator('input[aria-label="أضف دواء"], input[aria-label="Add medicine" i]').first();
console.log('ddi input found:', await i1.count());
if (await i1.count()) {
  await i1.fill('Panadol');
  await p5.locator('button:has-text("أضف دواء"), button:has-text("Add medicine")').first().click();
  await p5.waitForTimeout(600);
  await i1.fill('Aspirin');
  await p5.locator('button:has-text("أضف دواء"), button:has-text("Add medicine")').first().click();
  await p5.waitForTimeout(600);
  // chips should show both meds
  const body = await p5.evaluate(() => document.body.innerText);
  console.log('chips contain Panadol:', /panadol/i.test(body), '| Aspirin:', /aspirin/i.test(body));
  const analyzeBtn = p5.getByRole('button', { name: /analyze interactions|تحليل التعارضات/i }).first();
  console.log('analyze button enabled:', !(await analyzeBtn.isDisabled()).catch?.() ?? !(await analyzeBtn.isDisabled()));
  await analyzeBtn.click();
  console.log('clicked analyze — waiting...');
  for (let i = 0; i < 25; i++) {
    await p5.waitForTimeout(3000);
    const mainText = await p5.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText;
    });
    // look for interaction analysis result (excluding chips)
    if (/interaction risk|major|moderate|minor|no known interaction|تعارض|تفاعل|خطير|معتدل/i.test(mainText) && mainText.split(/panadol|aspirin/i).length > 2) {
      console.log(`INTERACTIONS RESULT after ${(i + 1) * 3}s:`);
      mainText.split('\n').filter(l => /interaction|تفاعل|تعارض|warn|risk|خطير|معتدل|minor|major/i.test(l)).slice(0, 10).forEach(l => console.log('   ' + l.trim().slice(0, 110)));
      break;
    }
    if (i === 24) console.log('NO RESULT in 75s. main tail:', mainText.replace(/\s+/g, ' ').slice(-250));
  }
}

// --- prescription OCR (proper result detection) ---
console.log('\n=== prescription OCR ===');
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

const p3 = await ctx.newPage();
p3.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
await p3.goto(SITE + '/prescription', { waitUntil: 'networkidle', timeout: 60000 });
await p3.waitForTimeout(2000);
await p3.locator('input[type="file"]').first().setInputFiles('/tmp/presc-sample.png');
await p3.waitForTimeout(1500);
const analyze = p3.getByRole('button', { name: /اقرأها|read with ai/i }).first();
console.log('analyze button:', await analyze.count());
await analyze.click();
console.log('clicked — waiting for real OCR result (meds extracted)...');
for (let i = 0; i < 30; i++) {
  await p3.waitForTimeout(3000);
  const txt = await p3.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return main.innerText;
  });
  const medsFound = /panadol|augmentin|ventolin|بانادول|أوجمنتين|فنتولين/i.test(txt);
  const loadingDone = !/يقرأ روشتتك|reading your prescription/i.test(txt);
  if (medsFound && loadingDone) {
    console.log(`OCR RESULT after ${(i + 1) * 3}s — medicine names extracted:`);
    txt.split('\n').filter(l => /panadol|augmentin|ventolin|بانادول|أوجمنتين|فنتولين|%|confidence|ثقة/i.test(l)).slice(0, 15).forEach(l => console.log('   ' + l.trim().slice(0, 110)));
    break;
  }
  if (i === 29) console.log('NO OCR RESULT in 90s. main tail:', txt.replace(/\s+/g, ' ').slice(-250));
}
await browser.close();

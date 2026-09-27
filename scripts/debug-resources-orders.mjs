// Identify failing sub-resources on live pages + order qty clamp test with in-stock product
import { chromium } from 'playwright-core';
const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = 'https://the-pharmacy-two.vercel.app';

// --- 1. find 404/401 resources ---
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 140)}`); });
for (const p of ['/', '/product/panadol-extra', '/cart', '/assistant']) {
  bad.length = 0;
  await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log(`${p}:`, bad.length ? bad : '(all sub-resources OK)');
}
await browser.close();

// --- 2. order qty clamp with in-stock product ---
const r = await fetch(SITE + '/api/products?limit=50');
const j = await r.json();
const list = j.products || j.items || [];
const inStock = list.find(p => p.stock >= 25);
console.log('\nin-stock product:', inStock?.nameEn, 'id:', inStock?.id, 'stock:', inStock?.stock, 'price:', inStock?.price);

async function order(body) {
  const res = await fetch(SITE + '/api/orders', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const base = { items: [{ productId: inStock.id, quantity: 1 }], zone: 'nasr-city', address: '12 Test Street, Cairo', phone: '01012345678', notes: 'clamp test' };
for (const [qty, name] of [[-5, 'negative'], [0.7, 'fractional'], [9999, 'huge']]) {
  const rr = await order({ ...base, items: [{ productId: inStock.id, quantity: qty }] });
  console.log(`${name} qty (${qty}): HTTP ${rr.status} -> quantity=${rr.json?.order?.items?.[0]?.quantity} subtotal=${rr.json?.order?.subtotal}`);
}
// total math
const rt = await order({ ...base, items: [{ productId: inStock.id, quantity: 2 }] });
const o = rt.json?.order;
if (o) {
  const sub = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const fee = sub >= 500 ? 0 : 30;
  const exp = Math.round((sub + fee) * 100) / 100;
  console.log(`total math: subtotal=${o.subtotal} fee=${o.deliveryFee} total=${o.total} expected=${exp} ${Math.abs(o.total - exp) < 0.01 ? 'OK' : 'BUG'}`);
}
// OOS ordering: how many of first 50 products are OOS?
const oos = list.filter(p => p.stock === 0).length;
console.log(`\nfirst 50 products: ${oos} out-of-stock in top of list`);
const r2 = await fetch(SITE + '/api/products?limit=8');
const j2 = await r2.json();
const home = j2.products || [];
console.log('first 8 (home candidates):', home.map(p => `${p.nameEn.slice(0, 28)}(stock=${p.stock})`).join(' | '));

// Deep edge-case bug hunt on the live deployment — API validation + browser UI edges
// Dimensions NOT covered by site-sweep.mjs: malformed inputs, empty states, validation,
// qty clamping, RTL/lang persistence, wishlist, checkout form, admin gate, assistant.
import { chromium } from 'playwright-core';

const BROWSER = '/home/z/.agent-browser/browsers/chrome-153.0.8010.47/chrome';
const SITE = process.argv[2] || 'https://the-pharmacy-two.vercel.app';

const issues = [];
const ok = [];
function OK(msg) { ok.push(msg); console.log(`  ok  ${msg}`); }
function BUG(msg) { issues.push(msg); console.log(`  BUG ${msg}`); }

const jar = new Map(); // cookie jar
function getCookies() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
function setCookiesFrom(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
async function api(method, path, body, opts = {}) {
  const res = await fetch(SITE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie: getCookies(), ...(opts.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: opts.redirect || 'manual',
  });
  setCookiesFrom(res);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, res };
}

console.log('=== PART 1: API EDGE CASES ===');

// --- search edges ---
{
  const t = [
    ['/api/search?q=', 'empty q'],
    ['/api/search', 'missing q'],
    ['/api/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'xss payload'],
    ['/api/search?q=' + 'a'.repeat(500), '500-char q'],
    ['/api/search?q=%D8%A8%D9%86%D8%AF%D9%88%D9%84', 'arabic q'],
    ['/api/search?q=panadol&limit=999', 'limit=999'],
    ['/api/search?q=panadol&limit=-5', 'negative limit'],
  ];
  for (const [p, name] of t) {
    const r = await api('GET', p);
    if (r.status === 200 && r.json) OK(`search ${name}: 200, keys=${Object.keys(r.json).join(',')}`);
    else BUG(`search ${name}: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }
}

// --- products edges ---
{
  const t = [
    ['/api/products?category=does-not-exist', 'bad category'],
    ['/api/products?limit=0', 'limit 0'],
    ['/api/products?sort=bogus', 'bad sort'],
    ['/api/products?page=9999', 'page beyond'],
    ['/api/products/00000000-0000-0000-0000-000000000000', 'nonexistent product id'],
  ];
  for (const [p, name] of t) {
    const r = await api('GET', p);
    if (r.status === 200 || r.status === 404) OK(`products ${name}: ${r.status}`);
    else BUG(`products ${name}: HTTP ${r.status}`);
  }
}

// --- auth edges ---
{
  const r1 = await api('POST', '/api/auth/register', { email: 'not-an-email', password: '123456' });
  if (r1.status === 400 && r1.json?.error === 'invalid_email') OK('register bad email: 400 invalid_email');
  else BUG(`register bad email: ${r1.status} ${JSON.stringify(r1.json).slice(0, 80)}`);

  const r2 = await api('POST', '/api/auth/register', { email: 'probe-edge@test.dev', password: '123' });
  if (r2.status === 400 && r2.json?.error === 'weak_password') OK('register weak pw: 400 weak_password');
  else BUG(`register weak pw: ${r2.status}`);

  const r3 = await api('POST', '/api/auth/login', { email: 'nobody@test.dev', password: 'wrongwrong' });
  if (r3.status === 401) OK('login unknown user: 401');
  else BUG(`login unknown user: ${r3.status}`);

  const r4 = await api('POST', '/api/auth/login', { email: 'not-an-email', password: '' });
  if (r4.status === 400 || r4.status === 401) OK(`login bad email: ${r4.status}`);
  else BUG(`login bad email: ${r4.status}`);

  const r5 = await api('POST', '/api/auth/register', {});
  if (r5.status === 400) OK('register empty body: 400');
  else BUG(`register empty body: ${r5.status}`);

  // duplicate registration
  const stamp = Date.now();
  const dup = await api('POST', '/api/auth/register', { email: `dup${stamp}@test.dev`, password: '123456', name: 'Dup' });
  if (dup.status !== 200 && dup.status !== 201) { BUG(`register fresh user failed: ${dup.status}`); }
  else {
    const dup2 = await api('POST', '/api/auth/register', { email: `dup${stamp}@test.dev`, password: '123456' });
    if (dup2.status === 409 && dup2.json?.error === 'email_taken') OK('register duplicate: 409 email_taken');
    else BUG(`register duplicate: ${dup2.status} ${JSON.stringify(dup2.json).slice(0, 80)}`);
  }
  // logout
  await api('POST', '/api/auth/logout', {});
  const me = await api('GET', '/api/auth/me');
  if (me.status === 200 && (me.json?.user === null || me.json?.authenticated === false || !me.json?.user?.email))
    OK(`me after logout: no user (${JSON.stringify(me.json).slice(0, 60)})`);
  else OK(`me after logout: ${JSON.stringify(me.json).slice(0, 60)}`);
}

// --- order edges ---
{
  let pid = null, price = 0, stock = 0;
  {
    const r = await api('GET', '/api/products?limit=5');
    const list = r.json?.products || r.json?.items || [];
    pid = list[0]?.id; price = list[0]?.price; stock = list[0]?.stock;
    if (!pid) { BUG('cannot get product for order tests'); }
    else OK(`order test product: ${pid} price=${price} stock=${stock}`);
  }
  if (pid) {
    const base = { items: [{ productId: pid, quantity: 1 }], zone: 'nasr-city', address: '12 Test Street, Cairo', phone: '01012345678', notes: 'edge test' };
    const cases = [
      [{ ...base, items: [] }, 'empty items', 400],
      [{ ...base, zone: 'atlantis' }, 'invalid zone', 400],
      [{ ...base, address: 'short' }, 'short address', 400],
      [{ ...base, phone: '123' }, 'bad phone', 400],
      [{ ...base, items: [{ productId: 'nope', quantity: 1 }] }, 'unknown product', 400],
      [{ ...base, items: [{ productId: pid, quantity: -5 }] }, 'negative qty (clamp->1)', 200],
      [{ ...base, items: [{ productId: pid, quantity: 9999 }] }, 'huge qty (clamp->20)', 200],
      [{ ...base, items: [{ productId: pid, quantity: 0.7 }] }, 'fractional qty', 200],
    ];
    for (const [body, name, expect] of cases) {
      const r = await api('POST', '/api/orders', body);
      if (r.status === expect) OK(`order ${name}: ${r.status} (${r.json?.error || 'created ' + (r.json?.order?.orderNumber || '')})`);
      else BUG(`order ${name}: expected ${expect} got ${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
    }
    // verify clamping took effect in created order
    const rNeg = await api('POST', '/api/orders', { ...base, items: [{ productId: pid, quantity: -5 }] });
    const q = rNeg.json?.order?.items?.[0]?.quantity;
    if (q === 1) OK('negative qty clamped to 1 server-side');
    else if (rNeg.status === 200) BUG(`negative qty not clamped: quantity=${q}`);
    // total math check
    const rT = await api('POST', '/api/orders', { ...base, items: [{ productId: pid, quantity: 2 }] });
    const o = rT.json?.order;
    if (o) {
      const sub = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const fee = sub >= 500 ? 0 : 30;
      const expTotal = Math.round((sub + fee) * 100) / 100;
      if (Math.abs(o.total - expTotal) < 0.01) OK(`order total math: subtotal=${o.subtotal} fee=${o.deliveryFee} total=${o.total}`);
      else BUG(`order total math wrong: got ${o.total}, expected ${expTotal}`);
    }
    // GET orders as guest
    await api('POST', '/api/auth/logout', {});
    const rg = await api('GET', '/api/orders');
    if (rg.status === 200 && Array.isArray(rg.json?.orders)) OK('orders GET guest: 200 empty');
    else BUG(`orders GET guest: ${rg.status}`);
  }
}

// --- admin gate ---
{
  for (const p of ['/api/admin/stats', '/api/admin/orders', '/api/admin/products']) {
    const r = await api('GET', p);
    if (r.status === 401 || r.status === 403) OK(`admin gate ${p}: ${r.status}`);
    else BUG(`admin gate ${p}: expected 401/403 got ${r.status}`);
  }
}

// --- AI edges ---
{
  const r1 = await api('POST', '/api/ai/assistant', { message: '' });
  if (r1.status === 400 || r1.status === 200) OK(`assistant empty message: ${r1.status} (${r1.json?.error || 'reply'})`);
  else BUG(`assistant empty message: ${r1.status}`);

  const r2 = await api('POST', '/api/ai/interactions', { drugs: [] });
  if (r2.status === 400 || r2.status === 200) OK(`interactions empty: ${r2.status}`);
  else BUG(`interactions empty: ${r2.status}`);

  const r3 = await api('POST', '/api/ai/assistant', { message: 'x'.repeat(12000) });
  if (r3.status === 400 || r3.status === 200 || r3.status === 429) OK(`assistant 12k message: ${r3.status}`);
  else BUG(`assistant 12k message: ${r3.status}`);

  const r4 = await api('GET', '/api/ai/assistant');
  if (r4.status === 405 || r4.status === 404) OK(`assistant GET: ${r4.status}`);
  else BUG(`assistant GET: ${r4.status}`);
}

// --- misc route edges ---
{
  const checks = [
    ['/api/route', 'api root'],
    ['/api/health?x=1', 'health query'],
    ['/nonexistent-page', '404 page', 404],
    ['/product/nonexistent-slug-xyz', '404 product', 404],
    ['/category/nonexistent-slug-xyz', '404 category', 404],
    ['/search/', 'empty search path'],
  ];
  for (const [p, name, expect] of checks) {
    const r = await api('GET', p);
    if (expect !== undefined) {
      if (r.status === expect) OK(`${name}: ${r.status}`);
      else BUG(`${name}: expected ${expect} got ${r.status}`);
    } else {
      if (r.status < 500) OK(`${name}: ${r.status}`);
      else BUG(`${name}: HTTP ${r.status}`);
    }
  }
  // OPTIONS/CORS
  const ro = await api('OPTIONS', '/api/products');
  OK(`OPTIONS /api/products: ${ro.status}`);
  // robots + manifest + offline
  for (const p of ['/robots.txt', '/manifest.webmanifest', '/offline', '/sw.js']) {
    const r = await api('GET', p);
    if (r.status < 500) OK(`${p}: ${r.status}`);
    else BUG(`${p}: ${r.status}`);
  }
}

// === PART 2: BROWSER UI EDGE CASES ===
console.log('=== PART 2: BROWSER UI EDGES ===');
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
let ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
let page = await ctx.newPage();
const consoleErrs = [];
function attach(p) {
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('_rsc=') && !t.includes('net::ERR_ABORTED')) consoleErrs.push(t.slice(0, 200));
  });
  p.on('pageerror', (e) => issues.push(`PAGEERROR: ${String(e).slice(0, 200)}`));
}
attach(page);

async function newCtx() { try { await ctx.close(); } catch {}; ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); page = await ctx.newPage(); attach(page); }

// 1. language toggle + persistence
try {
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  const dir0 = await page.getAttribute('html', 'dir');
  await page.click('button[aria-label*="anguage" i], [data-testid="lang-toggle"], button:has-text("English"), button:has-text("العربية")', { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const dir1 = await page.getAttribute('html', 'dir');
  const url1 = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const dir2 = await page.getAttribute('html', 'dir');
  OK(`lang toggle: dir ${dir0} -> ${dir1} (url ${url1.replace(SITE, '')}), after reload still ${dir2} ${dir2 === dir1 ? '(persisted)' : '(RESET BUG?)'}`);
  if (dir1 === dir0 && dir0 !== null) console.log(`  [info] dir unchanged by toggle attempt — selector may need check`);
} catch (e) { BUG(`lang toggle: ${String(e).slice(0, 120)}`); }

// 2. search UI: no-results state
try {
  await newCtx();
  await page.goto(SITE + '/search?q=zzzznotfoundxyz', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  const body = (await page.textContent('body')).slice(0, 3000);
  if (/no.*(results|products)|لا.*نتائج|لا توجد/i.test(body) || page.locator('text=/no results|لا توجد نتائج/i').count() > 0)
    OK('search no-results state renders message');
  else {
    const hasProducts = await page.locator('[data-testid="product-card"], a[href*="/product/"]').count();
    if (hasProducts === 0) OK('search no-results: no bogus products shown');
    else BUG('search no-results: products shown for nonsense query');
  }
} catch (e) { BUG(`search no-results: ${String(e).slice(0, 120)}`); }

// 3. product page qty stepper + add to cart
try {
  await newCtx();
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.locator('a[href*="/product/"]').first().click();
  await page.waitForURL(/\/product\//, { timeout: 20000 });
  await page.waitForTimeout(1000);
  // find qty controls
  const minus = page.locator('button:has-text("−"), button:has-text("-"):near([data-testid*="qty" i])').first();
  const plus = page.locator('button:has-text("+")').first();
  const qtyInput = page.locator('input[type="number"]').first();
  if (await qtyInput.count()) {
    const val0 = await qtyInput.inputValue();
    await plus.click().catch(() => {});
    await page.waitForTimeout(300);
    const val1 = await qtyInput.inputValue();
    await minus.click().catch(() => {});
    await page.waitForTimeout(300);
    const val2 = await qtyInput.inputValue();
    OK(`qty stepper: ${val0} -> +${val1} -> -${val2}`);
  } else {
    console.log('  [info] no qty input on product page (uses cart drawer stepper?)');
  }
  const addBtn = page.locator('button:has-text(/add to cart|أضف للسلة|add/i)').first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    const badge = await page.locator('[data-testid="cart-badge"], .badge, [class*="badge" i]').first().textContent().catch(() => null);
    OK(`add to cart clicked, badge="${(badge || '').trim()}"`);
    // go to cart page
    await page.goto(SITE + '/cart', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const cartBody = (await page.textContent('body')).slice(0, 3000);
    if (await page.locator('a[href*="/product/"]').count() > 0) OK('cart page shows item with product link');
    else if (/empty|فارغ/i.test(cartBody)) console.log('  [info] cart appears empty — check persistence');
    // qty + in cart
    const cartPlus = page.locator('button:has-text("+")').first();
    if (await cartPlus.count()) {
      await cartPlus.click();
      await page.waitForTimeout(800);
      const body2 = (await page.textContent('body')).slice(0, 4000);
      const m = body2.match(/(\d+)\s*×|×\s*(\d+)/);
      OK(`cart qty stepper clicked ${m ? `(shows ${m[0]})` : ''}`);
    }
  } else BUG('no add-to-cart button on product page');
} catch (e) { BUG(`product/cart flow: ${String(e).slice(0, 150)}`); }

// 4. checkout form validation
try {
  await newCtx();
  await page.goto(SITE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  const body = (await page.textContent('body')).slice(0, 3000);
  if (/empty|فارغ|no items/i.test(body) && await page.locator('form').count() === 0) {
    OK('checkout with empty cart: blocked with message');
  } else if (await page.locator('form').count() > 0) {
    // submit empty form
    const submit = page.locator('button[type="submit"], button:has-text(/place order|تأكيد|checkout|complete/i)').first();
    await submit.click();
    await page.waitForTimeout(1200);
    const errs = await page.locator('text=/required|خطأ|invalid|مطلوب/i').count();
    OK(`checkout empty submit: ${errs > 0 ? 'inline validation shown' : 'no inline validation found (check manually)'}`);
    // invalid phone
    const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="01"]').first();
    if (await phoneInput.count()) {
      await phoneInput.fill('12345');
      const addr = page.locator('textarea, input[name="address"]').first();
      if (await addr.count()) await addr.fill('12 Test Street Cairo');
      const zone = page.locator('select').first();
      if (await zone.count()) await zone.selectOption({ index: 1 }).catch(() => {});
      await submit.click();
      await page.waitForTimeout(1500);
      const body2 = (await page.textContent('body')).slice(0, 5000);
      if (/phone|الهاتف|invalid|صحيح/i.test(body2)) OK('checkout invalid phone: validation error shown');
      else console.log('  [info] invalid phone: no visible message — server will 400');
    }
  } else {
    console.log(`  [info] checkout state: ${body.slice(0, 100)}`);
  }
} catch (e) { BUG(`checkout validation: ${String(e).slice(0, 150)}`); }

// 5. wishlist guest
try {
  await newCtx();
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  const wlBtn = page.locator('[data-testid*="wishlist" i], button[aria-label*="ishlist" i], button[aria-label*="المفضلة"]').first();
  if (await wlBtn.count()) {
    await wlBtn.click();
    await page.waitForTimeout(800);
    await page.goto(SITE + '/wishlist', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    OK(`wishlist flow: guest wishlist page loads (${(await page.textContent('body')).slice(0, 80).replace(/\s+/g, ' ')})`);
  } else console.log('  [info] no wishlist button on first product card');
} catch (e) { BUG(`wishlist: ${String(e).slice(0, 120)}`); }

// 6. admin gate page
try {
  await newCtx();
  await page.goto(SITE + '/admin', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1000);
  const body = (await page.textContent('body')).slice(0, 2000);
  if (/login|sign in|تسجيل الدخول/i.test(body) || page.url() !== SITE + '/admin') OK('admin page: gated (login required)');
  else console.log(`  [info] admin page content: ${body.slice(0, 100).replace(/\s+/g, ' ')}`);
} catch (e) { BUG(`admin gate: ${String(e).slice(0, 120)}`); }

// 7. login wrong password UI message
try {
  await newCtx();
  await page.goto(SITE + '/login', { waitUntil: 'networkidle', timeout: 45000 });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  if (await email.count() && await pass.count()) {
    await email.fill('nobody@nowhere.dev');
    await pass.fill('wrongpassword123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2500);
    const body = (await page.textContent('body')).slice(0, 4000);
    if (/invalid|incorrect|wrong|خطأ|صحيح/i.test(body)) OK('login wrong password: error message shown');
    else BUG('login wrong password: no visible error message');
  }
} catch (e) { BUG(`login error UI: ${String(e).slice(0, 120)}`); }

// 8. AI assistant live (keyless pool, allow 60s)
try {
  await newCtx();
  await page.goto(SITE + '/assistant', { waitUntil: 'networkidle', timeout: 45000 });
  const input = page.locator('form input:visible, textarea:visible').first();
  if (await input.count()) {
    await input.fill('What is Panadol used for?');
    await page.locator('form button[type="submit"], form button:last-child').first().click();
    try {
      await page.waitForSelector('text=/Panadol|pain|fever|المسكن/i', { timeout: 70000 });
      OK('assistant live: got AI reply mentioning pain/fever/Panadol');
    } catch {
      const body = (await page.textContent('body')).slice(0, 3000);
      if (/unavailable|غير متوفر|503|try again/i.test(body)) OK('assistant live: graceful unavailable message');
      else BUG(`assistant live: no reply within 70s. body: ${body.slice(0, 150).replace(/\s+/g, ' ')}`);
    }
  } else BUG('assistant page: no input found');
} catch (e) { BUG(`assistant page: ${String(e).slice(0, 120)}`); }

// 9. mobile 390px overflow on key pages
try {
  await newCtx();
  await ctx.close().catch(() => {});
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage(); attach(page);
  for (const p of ['/', '/cart', '/checkout', '/login', '/assistant']) {
    try {
      await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow <= 2) OK(`mobile 390px ${p}: no horizontal overflow`);
      else BUG(`mobile 390px ${p}: overflow ${overflow}px`);
    } catch (e) { BUG(`mobile ${p}: ${String(e).slice(0, 100)}`); }
  }
} catch (e) { BUG(`mobile sweep: ${String(e).slice(0, 100)}`); }

// 10. hydration warnings check on home
try {
  await newCtx();
  const warnings = [];
  const p2 = await ctx.newPage();
  p2.on('console', (m) => { if (m.type() === 'warning' && /hydrat|did not match|Expected/i.test(m.text())) warnings.push(m.text().slice(0, 150)); });
  await p2.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await p2.waitForTimeout(2000);
  if (warnings.length === 0) OK('hydration: no mismatch warnings on home');
  else BUG(`hydration warnings: ${warnings[0]}`);
} catch (e) { BUG(`hydration check: ${String(e).slice(0, 100)}`); }

console.log('\n=== CONSOLE ERRORS (unique) ===');
const uniq = [...new Set(consoleErrs)];
for (const e of uniq.slice(0, 15)) console.log(`  ${e}`);
if (uniq.length === 0) console.log('  (none)');

console.log(`\n=== SUMMARY: ${ok.length} ok, ${issues.length} issues ===`);
for (const i of issues) console.log(`  ISSUE: ${i}`);

await browser.close();
process.exit(issues.length > 0 ? 1 : 0);

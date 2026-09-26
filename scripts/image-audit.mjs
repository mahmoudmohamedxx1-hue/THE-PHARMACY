// Sample-audit every product image URL on the live site
const res = await fetch('https://the-pharmacy-two.vercel.app/api/products?limit=500');
const data = await res.json();
const items = data.items || [];
console.log('products fetched:', items.length);
const urls = [...new Set(items.map(i => i.imageUrl).filter(Boolean))];
console.log('unique image paths:', urls.length);
let broken = [], slow = [], checked = 0;
for (const u of urls) {
  const r = await fetch('https://the-pharmacy-two.vercel.app' + u, { method: 'HEAD' }).catch(e => ({ status: 0, error: String(e).slice(0, 80) }));
  checked++;
  if (r.status !== 200) broken.push(`${u} -> ${r.status}`);
}
console.log('checked:', checked);
console.log('broken:', broken.length);
broken.slice(0, 15).forEach(b => console.log('  ✗ ' + b));
if (!broken.length) console.log('  ALL IMAGES OK');

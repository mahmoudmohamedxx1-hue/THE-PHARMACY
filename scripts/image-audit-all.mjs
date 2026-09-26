const all = [];
let page = 1;
while (page < 20) {
  const res = await fetch(`https://the-pharmacy-two.vercel.app/api/products?page=${page}&limit=100`);
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) break;
  all.push(...items);
  page++;
}
console.log('total products fetched:', all.length);
const urls = [...new Set(all.map(i => i.imageUrl).filter(Boolean))];
console.log('unique image paths:', urls.length);
let broken = [];
for (const u of urls) {
  const r = await fetch('https://the-pharmacy-two.vercel.app' + u, { method: 'HEAD' }).catch(() => ({ status: 0 }));
  if (r.status !== 200) broken.push(`${u} -> ${r.status}`);
}
console.log('broken:', broken.length);
broken.slice(0, 20).forEach(b => console.log('  ✗ ' + b));
if (!broken.length) console.log('  ALL ' + urls.length + ' IMAGES OK');
// also check category cover images
const cats = await (await fetch('https://the-pharmacy-two.vercel.app/api/categories')).json();
for (const c of cats.categories || []) {
  if (c.coverImage) {
    const r = await fetch('https://the-pharmacy-two.vercel.app' + c.coverImage, { method: 'HEAD' }).catch(() => ({ status: 0 }));
    if (r.status !== 200) console.log('  ✗ category cover: ' + c.slug + ' ' + c.coverImage + ' -> ' + r.status);
  }
}
console.log('category covers checked');

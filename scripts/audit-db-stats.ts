import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const tot = await p.product.count();
  const all = await p.product.findMany({
    select: { imageUrl: true, stock: true, rating: true, reviewCount: true, price: true, nameEn: true, slug: true, descEn: true },
  });
  const noImg = all.filter((x) => !x.imageUrl).length;
  const zeroStock = all.filter((x) => x.stock === 0).length;
  const rated = {};
  for (const x of all) if (x.rating > 0) rated[x.rating] = (rated[x.rating] || 0) + 1;
  const distinctRC = [...new Set(all.map((r) => r.reviewCount))].sort((a, b) => a - b);
  const ratedCount = all.filter((r) => r.rating > 0).length;
  const withReviews = all.filter((r) => r.reviewCount > 0).length;
  console.log('products:', tot, '| no image:', noImg, '| stock=0:', zeroStock);
  console.log('products with rating>0:', ratedCount, '| with reviewCount>0:', withReviews);
  console.log('rating distribution:', Object.entries(rated).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('distinct reviewCounts:', distinctRC.slice(0, 30).join(','));
  // price sanity
  const weird = all.filter((x) => x.price <= 0 || x.price > 3000).map((x) => `${x.nameEn}=${x.price}`);
  console.log('weird prices:', weird.length ? weird.join(' | ') : 'none');
  // fake-looking names/descs
  const lorem = all.filter((x) => /lorem|TODO|placeholder|xxx/i.test(x.descEn || '')).map((x) => x.slug);
  console.log('lorem/todo descs:', lorem.length ? lorem.join(', ') : 'none');
  await p.$disconnect();
})();

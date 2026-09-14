import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  // Find the most common templated phrases
  const products = await p.product.findMany({ select: { descEn: true, descAr: true } });
  const phrases: Record<string, number> = {};
  for (const pr of products) {
    const m = pr.descEn.match(/([A-Za-z ,'-]{25,90})(?:\.|$)/g) || [];
    for (const s of m) {
      const key = s.trim();
      phrases[key] = (phrases[key] || 0) + 1;
    }
  }
  const top = Object.entries(phrases).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('Top repeated sentence templates:');
  for (const [s, c] of top) console.log(`  ${c}x  "${s}"`);
  // Average desc length
  const avgLen = products.reduce((a, b) => a + b.descEn.length, 0) / products.length;
  console.log('avg descEn length:', avgLen.toFixed(0), 'chars');
  // 24 products without images
  const noImg = await p.product.findMany({ where: { imageUrl: '' }, select: { id: true, slug: true, nameEn: true, brand: true, category: { select: { nameEn: true } } } });
  console.log('\\n24 products without images:');
  for (const pr of noImg) console.log(`  - [${pr.category.nameEn}] ${pr.nameEn} (${pr.brand})`);
}
main().finally(() => p.$disconnect());

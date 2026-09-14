import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const total = await p.product.count();
  const noImg = await p.product.count({ where: { imageUrl: '' } });
  const noDescEn = await p.product.count({ where: { descEn: '' } });
  const noDescAr = await p.product.count({ where: { descAr: '' } });
  const featured = await p.product.count({ where: { isFeatured: true } });
  console.log({ total, noImg, noDescEn, noDescAr, featured });

  const sample = await p.product.findMany({
    take: 3,
    orderBy: { popularity: 'desc' },
    select: { nameEn: true, nameAr: true, brand: true, imageUrl: true, imageSource: true, descEn: true, volume: true, subcategory: true, popularity: true, category: { select: { nameEn: true } } },
  });
  console.log(JSON.stringify(sample, null, 2));

  const byCat = await p.product.groupBy({ by: ['categoryId'], _count: { _all: true } });
  console.log('category groups:', byCat.length);

  // Show desc length distribution for non-empty
  const withDesc = await p.product.count({ where: { NOT: { descEn: '' } } });
  console.log('products with descEn:', withDesc);
}

main().finally(() => p.$disconnect());

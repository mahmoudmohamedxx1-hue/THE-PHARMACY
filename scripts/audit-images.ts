import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const p = new PrismaClient();

(async () => {
  const products = await p.product.findMany({
    select: { slug: true, nameEn: true, imageUrl: true, imageSource: true },
  });
  const missing = [];
  const noImg = [];
  const broken = [];
  for (const prod of products) {
    if (!prod.imageUrl) {
      noImg.push(`${prod.slug} [${prod.imageSource || 'no-source'}]`);
      continue;
    }
    if (prod.imageUrl.startsWith('http')) continue; // external
    const file = path.join('/home/z/my-project/public', prod.imageUrl);
    if (!fs.existsSync(file)) broken.push(`${prod.slug} -> ${prod.imageUrl}`);
  }
  console.log('NO IMAGE (' + noImg.length + '):');
  noImg.forEach((s) => console.log('  ' + s));
  console.log('BROKEN PATH (' + broken.length + '):');
  broken.forEach((s) => console.log('  ' + s));
  await p.$disconnect();
})();

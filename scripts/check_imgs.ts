import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ select: { slug: true, imageUrl: true, imageSource: true } });
  let exists = 0, missing = 0, empty = 0;
  const missingList: string[] = [];
  for (const pr of products) {
    if (!pr.imageUrl) { empty++; continue; }
    const fp = path.join('public', pr.imageUrl);
    if (fs.existsSync(fp)) exists++; else { missing++; missingList.push(`${pr.slug} -> ${pr.imageUrl}`); }
  }
  console.log({ total: products.length, filesExist: exists, filesMissing: missing, noUrl: empty });
  // imageSource distribution
  const bySrc: Record<string, number> = {};
  for (const pr of products) bySrc[pr.imageSource || '(none)'] = (bySrc[pr.imageSource || '(none)'] || 0) + 1;
  console.log('imageSource distribution:', bySrc);
  console.log('sample missing:', missingList.slice(0, 10));
}
main().finally(() => p.$disconnect());

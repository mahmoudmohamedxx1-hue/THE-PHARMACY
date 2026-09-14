import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ select: { slug: true, imageUrl: true } });
  let ok = 0, missing: string[] = [];
  for (const pr of products) {
    if (!pr.imageUrl) { missing.push(`${pr.slug} (no url)`); continue; }
    if (fs.existsSync(`public${pr.imageUrl}`)) ok++;
    else missing.push(`${pr.slug} -> ${pr.imageUrl}`);
  }
  console.log('ok:', ok, '/', products.length, '| problems:', missing.length);
  missing.slice(0, 10).forEach((m) => console.log('  !', m));
}
main().finally(() => p.$disconnect());

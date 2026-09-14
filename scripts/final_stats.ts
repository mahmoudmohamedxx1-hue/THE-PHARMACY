import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const total = await p.product.count();
  const withImg = await p.product.count({ where: { NOT: { imageUrl: '' } } });
  const realDesc = await p.product.count({ where: { OR: [{ descEn: { contains: '\n\n' } }] } });
  const imgBySource: Record<string, number> = {};
  const all = await p.product.findMany({ select: { imageSource: true, descEn: true } });
  for (const x of all) imgBySource[x.imageSource || 'legacy'] = (imgBySource[x.imageSource || 'legacy'] || 0) + 1;
  console.log(JSON.stringify({ total, withImg, realChefaaDesc: realDesc, imgBySource }, null, 1));
}
main().finally(() => p.$disconnect());

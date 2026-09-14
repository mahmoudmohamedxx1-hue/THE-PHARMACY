import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ select: { descEn: true, descAr: true } });
  const withReal = products.filter((x) => x.descEn.includes('\n\n') || x.descEn.length > 250);
  console.log('total:', products.length, '| rich desc (multi-para/long):', withReal.length);
  const avgLen = products.reduce((a, b) => a + b.descEn.length, 0) / products.length;
  console.log('avg descEn len:', avgLen.toFixed(0));
  // check for remaining boilerplate
  const boiler = products.filter((x) => x.descEn.includes('for leave-ins, apply to damp hair'));
  console.log('still boilerplate:', boiler.length);
  const empty = products.filter((x) => !x.descEn || x.descEn.length < 60);
  console.log('thin/empty:', empty.length);
}
main().finally(() => p.$disconnect());

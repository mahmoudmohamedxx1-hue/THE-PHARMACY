import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const all = await p.product.findMany({
    select: { slug: true, nameEn: true, nameAr: true, descEn: true, descAr: true, brand: true },
  });
  // missing Arabic content (fallback shows English in RTL mode)
  const noDescAr = all.filter((x) => !x.descAr || !x.descAr.trim());
  const noNameAr = all.filter((x) => !x.nameAr || !x.nameAr.trim());
  console.log('products missing descAr:', noDescAr.length, noDescAr.slice(0, 8).map((x) => x.slug).join(', '));
  console.log('products missing nameAr:', noNameAr.length, noNameAr.slice(0, 8).map((x) => x.slug).join(', '));
  // duplicate-ish names
  const byName = {};
  for (const x of all) {
    const k = (x.nameEn || '').toLowerCase().replace(/\s+/g, ' ').trim();
    (byName[k] = byName[k] || []).push(x.slug);
  }
  const dups = Object.entries(byName).filter(([, v]) => v.length > 1);
  console.log('duplicate nameEn groups:', dups.length);
  dups.slice(0, 10).forEach(([k, v]) => console.log('  DUP:', k, '->', v.join(' | ')));
  // shaan specifically
  console.log('shaan products:', all.filter((x) => /shaan|shan/i.test(x.nameEn)).map((x) => x.slug).join(', '));
  await p.$disconnect();
})();

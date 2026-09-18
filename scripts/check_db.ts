import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const J = (x: unknown) =>
  console.log(JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))

async function main() {
  J({
    products: await db.$queryRaw`SELECT COUNT(*) c FROM Product`,
    noImg: await db.$queryRaw`SELECT COUNT(*) c FROM Product WHERE imageUrl = '' OR imageUrl IS NULL`,
    orders: await db.$queryRaw`SELECT COUNT(*) c FROM \`Order\``,
    users: await db.$queryRaw`SELECT COUNT(*) c FROM User`,
    events: await db.$queryRaw`SELECT COUNT(*) c FROM AnalyticsEvent`,
  })
  J(await db.$queryRaw`SELECT orderNumber, total, status, zone, phone, address, createdAt FROM \`Order\` ORDER BY createdAt`)
  J(await db.$queryRaw`SELECT email, isAdmin, name FROM User`)
  J(await db.$queryRaw`SELECT ROUND(rating,1) r, COUNT(*) c FROM Product GROUP BY ROUND(rating,1) ORDER BY r DESC`)
  J(await db.$queryRaw`SELECT reviewCount, COUNT(*) c FROM Product GROUP BY reviewCount ORDER BY reviewCount DESC LIMIT 12`)
  J(await db.$queryRaw`SELECT stock, COUNT(*) c FROM Product GROUP BY stock ORDER BY stock LIMIT 15`)
  J(await db.$queryRaw`SELECT descEn, COUNT(*) c FROM Product WHERE descEn != '' GROUP BY descEn HAVING c > 3 ORDER BY c DESC LIMIT 8`)
  J(await db.$queryRaw`SELECT popularity, COUNT(*) c FROM Product GROUP BY popularity ORDER BY c DESC LIMIT 10`)
  J(await db.$queryRaw`SELECT imageSource, COUNT(*) c FROM Product WHERE imageUrl != '' GROUP BY imageSource ORDER BY c DESC LIMIT 10`)
  await db.$disconnect()
}
main()

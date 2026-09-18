// Data honesty cleanup (resumable): remove QA test accounts and fabricated
// review counts. Demo/E2E orders were already removed in a previous run.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const J = (x: unknown) =>
  console.log(JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))

async function main() {
  // 2) QA test accounts (keep admin@ + demo@)
  const qaUsers = await db.user.findMany({
    where: { email: { startsWith: 'qa-test-' } },
    select: { id: true },
  })
  const ids = qaUsers.map((u) => u.id)
  if (ids.length) {
    await db.session.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  }
  J({ qaUsersRemoved: ids.length })

  // 3) fabricated review counts -> 0 (UI hides ratings when there are no reviews)
  await db.product.updateMany({ data: { reviewCount: 0 } })

  // 4) purge analytics events (test events if any)
  await db.analyticsEvent.deleteMany({})

  J({
    remainingOrders: await db.order.count(),
    remainingUsers: await db.user.findMany({ select: { email: true, isAdmin: true } }),
    productsWithZeroReviews: await db.product.count({ where: { reviewCount: 0 } }),
  })
  await db.$disconnect()
}
main()

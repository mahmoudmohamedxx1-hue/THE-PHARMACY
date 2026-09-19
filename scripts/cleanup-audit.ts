// Post-audit cleanup: remove ALL E2E/manual test orders (with stock restore),
// test prescriptions, test sessions and analytics events so the committed DB
// stays honest. Keeps admin@ + demo@ accounts (documented demo credentials).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })

async function main() {
  const orders = await db.order.findMany({ include: { items: true } })
  for (const o of orders) {
    for (const it of o.items) {
      if (it.productId) {
        await db.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.quantity } },
        })
      }
    }
    await db.order.delete({ where: { id: o.id } })
  }
  // test prescriptions uploaded during the audit
  await db.prescription.deleteMany({ where: { userId: null } })
  // stale sessions + telemetry from the audit run
  await db.session.deleteMany({})
  await db.analyticsEvent.deleteMany({})

  const J = (x: unknown) => console.log(JSON.stringify(x))
  J({
    remainingOrders: await db.order.count(),
    remainingPrescriptions: await db.prescription.count(),
    remainingEvents: await db.analyticsEvent.count(),
    remainingSessions: await db.session.count(),
    users: await db.user.findMany({ select: { email: true, isAdmin: true } }),
  })
  await db.$disconnect()
}
main()

// Remove an E2E test order (and restore stock) so the database stays clean
// after running the Playwright checkout spec.
// Usage: bun scripts/clean_test_order.ts TP-1234567890
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })

async function main() {
  const orderNumber = process.argv[2]
  if (!orderNumber) {
    console.error('usage: bun scripts/clean_test_order.ts TP-XXXXXXXXXX')
    process.exit(1)
  }
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  })
  if (!order) { console.log('order not found (already clean)'); return }
  // restore stock for each item before deleting
  for (const it of order.items) {
    if (it.productId) {
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { increment: it.quantity } },
      })
    }
  }
  await db.order.delete({ where: { id: order.id } })
  // also drop analytics events referencing the test order
  await db.analyticsEvent.deleteMany({
    where: { meta: { contains: order.orderNumber } },
  })
  console.log(`removed ${orderNumber} (${order.items.length} items, stock restored)`)
  await db.$disconnect()
}
main()

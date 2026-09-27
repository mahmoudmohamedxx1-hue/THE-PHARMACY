// Remove test artifacts created while bug-hunting (local DB only)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const testUser = await db.user.findUnique({ where: { email: "verceltest@check.local" } });
if (testUser) {
  await db.prescription.deleteMany({ where: { userId: testUser.id } });
  await db.order.deleteMany({ where: { userId: testUser.id } });
  await db.review.deleteMany({ where: { userId: testUser.id } });
  await db.analyticsEvent.deleteMany({ where: { sessionId: { contains: "verceltest" } } });
  await db.user.delete({ where: { id: testUser.id } });
  console.log("removed test user verceltest@check.local");
} else console.log("test user not present");

// test prescription from the JSON API test (anonymous)
const rx = await db.prescription.findFirst({ where: { notes: "test" } });
if (rx) { await db.prescription.delete({ where: { id: rx.id } }); console.log("removed test prescription", rx.id); }

// any test orders by phone from browser checkout (that was on Vercel, but check anyway)
const orders = await db.order.findMany({ where: { phone: "01098765432" } });
for (const o of orders) { await db.orderItem.deleteMany({ where: { orderId: o.id } }); await db.order.delete({ where: { id: o.id } }); console.log("removed test order", o.orderNumber); }

console.log("cleanup done");
await db.$disconnect();

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/tmp/committed.db" } } });
const orders = await db.order.findMany({ select: { orderNumber: true, createdAt: true } });
console.log("committed orders:", JSON.stringify(orders.map(o => o.orderNumber)));
const events = await db.analyticsEvent.count();
console.log("committed analytics events:", events);
await db.$disconnect();

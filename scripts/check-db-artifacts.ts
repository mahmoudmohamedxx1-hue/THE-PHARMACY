import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const rxs = await db.prescription.findMany({ select: { id: true, notes: true, status: true, createdAt: true, userId: true }, orderBy: { createdAt: "desc" }, take: 5 });
console.log("recent prescriptions:", JSON.stringify(rxs, null, 1));
const users = await db.user.findMany({ select: { email: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 });
console.log("recent users:", JSON.stringify(users.map(u => u.email)));
const orders = await db.order.findMany({ select: { orderNumber: true, phone: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 });
console.log("recent orders:", JSON.stringify(orders.map(o => o.orderNumber + "/" + o.phone)));
await db.$disconnect();

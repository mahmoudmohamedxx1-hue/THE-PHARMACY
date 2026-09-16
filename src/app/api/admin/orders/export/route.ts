import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/order-utils'
import { zoneById } from '@/lib/zones'

// Admin: export all orders as CSV (Excel-friendly: UTF-8 BOM + CRLF).
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const orders = await db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { items: true, user: { select: { email: true, name: true } } },
    })
    const rows: unknown[][] = [
      ['Order #', 'Date', 'Status', 'Customer', 'Email', 'Phone', 'Zone', 'Address',
        'Items', 'Subtotal (EGP)', 'Delivery (EGP)', 'Total (EGP)', 'Payment', 'Notes'],
    ]
    for (const o of orders) {
      rows.push([
        o.orderNumber,
        o.createdAt.toISOString(),
        o.status,
        o.user?.name || o.user?.email || 'Guest',
        o.user?.email || '',
        o.phone,
        zoneById(o.zone)?.nameEn || o.zone,
        o.address,
        o.items.map((it) => `${it.nameEn} x${it.quantity}`).join('; '),
        o.subtotal.toFixed(2),
        o.deliveryFee.toFixed(2),
        o.total.toFixed(2),
        o.paymentMethod,
        o.notes || '',
      ])
    }
    const csv = toCsv(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="the-pharmacy-orders-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('admin orders export error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ORDER_STATUSES } from '@/lib/zones'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1))
    const limit = 15
    const [items, total] = await Promise.all([
      db.order.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { items: true, user: { select: { email: true, name: true } } },
      }),
      db.order.count(),
    ])
    const prescriptions = await db.prescription.findMany({
      orderBy: { createdAt: 'desc' }, take: 10,
      include: { user: { select: { email: true, name: true } } },
    })
    return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) || 1, prescriptions })
  } catch (e) {
    console.error('admin orders error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const { id, status } = await req.json()
    if (!id || !(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }
    const order = await db.order.update({ where: { id }, data: { status } })
    return NextResponse.json({ order })
  } catch (e: any) {
    // Prisma P2025 = record to update not found -> proper 404, not a 500
    if (e?.code === 'P2025') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    console.error('admin order patch error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') || '').trim()
    const page = Math.max(1, Number(sp.get('page') || 1))
    const limit = 20
    const where = q ? {
      OR: [{ nameEn: { contains: q } }, { nameAr: { contains: q } }, { brand: { contains: q } }],
    } : {}
    const [items, total] = await Promise.all([
      db.product.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { category: { select: { nameEn: true, nameAr: true } } },
      }),
      db.product.count({ where }),
    ])
    return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) || 1 })
  } catch (e) {
    console.error('admin products error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const { id, price, stock, isFeatured } = await req.json()
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    const data: any = {}
    if (price !== undefined && price !== null && !Number.isNaN(Number(price))) data.price = Math.max(0, Number(price))
    if (stock !== undefined && stock !== null && !Number.isNaN(Number(stock))) data.stock = Math.max(0, Math.floor(Number(stock)))
    if (isFeatured !== undefined) data.isFeatured = !!isFeatured
    const updated = await db.product.update({ where: { id }, data })
    return NextResponse.json({ product: updated })
  } catch (e: any) {
    // Prisma P2025 = record to update not found -> proper 404, not a 500
    if (e?.code === 'P2025') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    console.error('admin product patch error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

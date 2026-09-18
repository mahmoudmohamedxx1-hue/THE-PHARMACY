import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const [products, lowStock, orders, users, prescriptions, revenueAgg, statusAgg, topProducts, funnelAgg, topPagesAgg, topViewedAgg] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { stock: { lte: 10 } } }),
      db.order.count(),
      db.user.count({ where: { isAdmin: false } }),
      db.prescription.count(),
      db.order.aggregate({ _sum: { total: true }, where: { status: { not: 'cancelled' } } }),
      db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      db.orderItem.groupBy({
        by: ['nameEn', 'nameAr'], _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } }, take: 5,
      }),
      // first-party analytics funnel (last 30 days)
      db.analyticsEvent.groupBy({
        by: ['type'], where: { createdAt: { gte: since30d } }, _count: { _all: true },
      }),
      db.analyticsEvent.groupBy({
        by: ['path'], where: { type: 'page_view', createdAt: { gte: since30d } },
        _count: { _all: true }, orderBy: { _count: { path: 'desc' } }, take: 6,
      }),
      db.analyticsEvent.groupBy({
        by: ['productId'], where: { type: 'view_item', createdAt: { gte: since30d } },
        _count: { _all: true }, orderBy: { _count: { productId: 'desc' } }, take: 5,
      }),
    ])

    // resolve product names for the most-viewed list
    const viewedIds = topViewedAgg.map((v) => v.productId).filter(Boolean) as string[]
    const viewedProducts = viewedIds.length
      ? await db.product.findMany({ where: { id: { in: viewedIds } }, select: { id: true, nameEn: true, nameAr: true } })
      : []
    const nameById = new Map(viewedProducts.map((p) => [p.id, p]))
    const topViewed = topViewedAgg
      .filter((v) => v.productId && nameById.get(v.productId as string))
      .map((v) => ({
        nameEn: nameById.get(v.productId as string)!.nameEn,
        nameAr: nameById.get(v.productId as string)!.nameAr,
        views: v._count._all,
      }))

    const funnel = Object.fromEntries(funnelAgg.map((f) => [f.type, f._count._all]))

    return NextResponse.json({
      stats: {
        products, lowStock, orders, users, prescriptions,
        revenue: revenueAgg._sum.total || 0,
        statusCounts: Object.fromEntries(statusAgg.map((s) => [s.status, s._count._all])),
      },
      topProducts: topProducts.map((t) => ({ nameEn: t.nameEn, nameAr: t.nameAr, qty: t._sum.quantity || 0 })),
      analytics: {
        funnel: {
          pageViews: funnel.page_view || 0,
          itemViews: funnel.view_item || 0,
          addToCart: funnel.add_to_cart || 0,
          beginCheckout: funnel.begin_checkout || 0,
          purchases: funnel.purchase || 0,
        },
        topPages: topPagesAgg.map((p) => ({ path: p.path, views: p._count._all })),
        topViewed,
      },
    })
  } catch (e) {
    console.error('admin stats error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

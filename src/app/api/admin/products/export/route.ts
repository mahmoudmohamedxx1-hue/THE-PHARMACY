import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/order-utils'

// Admin: export the product catalog as CSV (Excel-friendly: UTF-8 BOM + CRLF).
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const products = await db.product.findMany({
      orderBy: { nameEn: 'asc' },
      take: 10000,
      include: { category: { select: { nameEn: true, nameAr: true } } },
    })
    const rows: unknown[][] = [
      ['Name (EN)', 'Name (AR)', 'Brand', 'Category', 'Subcategory', 'Price (EGP)',
        'Compare At (EGP)', 'Stock', 'Rx Required', 'Featured', 'Rating', 'Reviews',
        'Popularity', 'Image URL', 'Slug'],
    ]
    for (const p of products) {
      rows.push([
        p.nameEn,
        p.nameAr,
        p.brand,
        p.category?.nameEn || '',
        p.subcategory,
        p.price.toFixed(2),
        p.compareAtPrice != null ? p.compareAtPrice.toFixed(2) : '',
        p.stock,
        p.prescriptionRequired ? 'yes' : 'no',
        p.isFeatured ? 'yes' : 'no',
        p.rating.toFixed(1),
        p.reviewCount,
        p.popularity,
        p.imageUrl,
        p.slug,
      ])
    }
    const csv = toCsv(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="the-pharmacy-products-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('admin products export error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

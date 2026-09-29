import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ suggestions: [] })

    // escape for SQLite LIKE
    const esc = q.replace(/[%_\\]/g, (m) => '\\' + m)

    const products = await db.product.findMany({
      where: {
        OR: [
          { nameEn: { contains: q } },
          { nameAr: { contains: q } },
          { brand: { contains: q } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, slug: true, nameEn: true, nameAr: true,
        price: true, brand: true, stock: true, imageUrl: true,
        category: { select: { slug: true } },
      },
    })

    const brands = [...new Set(products.map((p) => p.brand))].slice(0, 4)

    return NextResponse.json({ suggestions: products, brands })
  } catch (e) {
    console.error('search error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

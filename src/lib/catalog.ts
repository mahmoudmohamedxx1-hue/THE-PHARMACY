import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

/**
 * Shared catalog queries — used by BOTH the API routes (client-side fetches)
 * and server components (SSR initial data). One source of truth so the
 * hydrated data always matches what the client would fetch.
 */

export interface CategoryDTO {
  id?: string
  slug: string
  nameEn: string
  nameAr: string
  descEn: string
  descAr: string
  icon?: string
  productCount: number
  coverImage: string
}

export interface ProductsDTO {
  items: any[]
  total: number
  page: number
  pages: number
  brands: { brand: string; count: number }[]
}

export async function getCategories(): Promise<CategoryDTO[]> {
  const cats = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  const covers = await db.product.findMany({
    where: { imageUrl: { not: '' }, stock: { gt: 0 } },
    orderBy: [{ isFeatured: 'desc' }, { popularity: 'desc' }],
    select: { categoryId: true, imageUrl: true },
  })
  const coverByCat = new Map<string, string>()
  for (const p of covers) {
    if (!coverByCat.has(p.categoryId)) coverByCat.set(p.categoryId, p.imageUrl)
  }

  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    descEn: c.descEn,
    descAr: c.descAr,
    icon: c.icon,
    productCount: c._count.products,
    coverImage: coverByCat.get(c.id) || '',
  }))
}

export interface ProductQueryParams {
  category?: string
  q?: string
  sort?: string
  min?: number
  max?: number
  brand?: string
  rx?: 'true' | 'false'
  inStock?: boolean
  hasImage?: boolean
  featured?: boolean
  ids?: string[]
  page?: number
  limit?: number
}

export async function getProducts(params: ProductQueryParams): Promise<ProductsDTO> {
  const page = Math.max(1, params.page || 1)
  const limit = Math.min(60, Math.max(1, params.limit || 24))

  const where: Prisma.ProductWhereInput = {}
  if (params.ids?.length) where.id = { in: params.ids }
  if (params.category) where.category = { slug: params.category }
  if (params.featured) where.isFeatured = true
  if (params.brand) where.brand = { equals: params.brand }
  if (params.rx === 'true') where.prescriptionRequired = true
  if (params.rx === 'false') where.prescriptionRequired = false
  if (params.inStock) where.stock = { gt: 0 }
  if (params.hasImage) where.imageUrl = { not: '' }
  if (params.min !== undefined || params.max !== undefined) {
    where.price = {}
    if (params.min !== undefined && !Number.isNaN(params.min)) where.price.gte = params.min
    if (params.max !== undefined && !Number.isNaN(params.max)) where.price.lte = params.max
  }
  if (params.q) {
    where.OR = [
      { nameEn: { contains: params.q } },
      { nameAr: { contains: params.q } },
      { brand: { contains: params.q } },
      { descEn: { contains: params.q } },
      { subcategory: { contains: params.q } },
    ]
  }

  let orderBy: Prisma.ProductOrderByWithRelationInput[]
  switch (params.sort) {
    case 'price-asc': orderBy = [{ price: 'asc' }, { popularity: 'desc' }]; break
    case 'price-desc': orderBy = [{ price: 'desc' }, { popularity: 'desc' }]; break
    case 'rating': orderBy = [{ rating: 'desc' }, { reviewCount: 'desc' }, { popularity: 'desc' }]; break
    case 'newest': orderBy = [{ createdAt: 'desc' }]; break
    default: orderBy = [{ popularity: 'desc' }, { rating: 'desc' }]
  }

  const [items, total, brandAgg] = await Promise.all([
    db.product.findMany({
      where, orderBy,
      skip: (page - 1) * limit, take: limit,
      include: { category: { select: { slug: true, nameEn: true, nameAr: true } } },
    }),
    db.product.count({ where }),
    db.product.groupBy({
      by: ['brand'], where, _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } }, take: 24,
    }),
  ])

  return {
    items,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    brands: brandAgg.map((b) => ({ brand: b.brand, count: b._count._all })),
  }
}

/** Product detail + related items (used by the product page and its API). */
export async function getProductDetail(idOrSlug: string) {
  const product = await db.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { category: true },
  })
  if (!product) return null

  const related = await db.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id } },
    orderBy: { popularity: 'desc' },
    take: 8,
  })

  return { product, related }
}

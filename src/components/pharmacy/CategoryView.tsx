'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, SlidersHorizontal, PackageSearch } from 'lucide-react'
import { useLang } from './LangContext'
import { useCategories, useProducts, type Product } from './hooks'
import { ProductCard } from './ProductCard'
import { go } from '@/lib/router'

interface Props {
  categorySlug?: string
  searchQuery?: string
  initial?: {
    categories: import('./hooks').Category[]
    products: import('./hooks').ProductsResponse
  }
}

export function CategoryView({ categorySlug, searchQuery, initial }: Props) {
  const { lang, t } = useLang()
  const { data: categories = [] } = useCategories(initial?.categories)
  const category = categories.find((c) => c.slug === categorySlug)

  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('popular')
  const [min, setMin] = useState(0)
  const [max, setMax] = useState(2500)
  const [brand, setBrand] = useState('')
  const [rx, setRx] = useState('')
  const [inStock, setInStock] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const params: Record<string, string | number | undefined> = {
    category: categorySlug, q: searchQuery, sort, page, limit: 24,
    min: min > 0 ? min : undefined, max: max < 2500 ? max : undefined,
    brand: brand || undefined, rx: rx || undefined, inStock: inStock ? 'true' : undefined,
  }
  // SSR initial data is only valid for the default (unfiltered) first page —
  // the query key changes with any filter, and seeding it there would be wrong.
  // (The server fetched this data WITH the current category/search query,
  // which are part of the query key, so they don't need excluding here.)
  const isDefaultView = page === 1 && sort === 'popular'
    && min === 0 && max === 2500 && !brand && !rx && !inStock
  const { data, isLoading } = useProducts(params, true, isDefaultView ? initial?.products : undefined)
  const items: Product[] = data?.items || []
  const pages = data?.pages || 1
  const total = data?.total || 0

  const clear = () => { setMin(0); setMax(2500); setBrand(''); setRx(''); setInStock(false); setPage(1) }
  const hasFilters = min > 0 || max < 2500 || brand || rx || inStock

  const FiltersPanel = (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-bold text-sm mb-3">{t('price_range')}</p>
        <div className="flex items-center gap-2 mb-3">
          <Input type="number" value={min} onChange={(e) => setMin(Number(e.target.value) || 0)} className="h-9 rounded-xl" aria-label={t('a11y_min_price')} />
          <span className="text-muted-foreground">—</span>
          <Input type="number" value={max} onChange={(e) => setMax(Number(e.target.value) || 2500)} className="h-9 rounded-xl" aria-label={t('a11y_max_price')} />
        </div>
        <Slider
          value={[min, max]} min={0} max={2500} step={25}
          onValueChange={([a, b]: number[]) => { setMin(a); setMax(b) }}
          className="py-1"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
          <span>{fmt(min)}</span><span>{fmt(max)}</span>
        </div>
      </div>

      {(data?.brands?.length || 0) > 0 && (
        <div>
          <p className="font-bold text-sm mb-3">{t('brand_f')}</p>
          <div className="scroll-area flex flex-col gap-2 pe-1">
            {data?.brands?.map((b) => (
              <button
                key={b.brand}
                onClick={() => { setBrand(brand === b.brand ? '' : b.brand); setPage(1) }}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${brand === b.brand ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                <span className="truncate">{b.brand}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0 ms-2">{b.count}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="font-bold text-sm mb-3">{t('prescription_f')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: '', label: t('all') },
            { v: 'false', label: t('otc_only') },
            { v: 'true', label: t('rx_only') },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => { setRx(o.v); setPage(1) }}
              className={`px-2 py-2 rounded-xl text-xs font-bold transition-colors ${rx === o.v ? 'bg-primary text-primary-foreground' : 'bg-accent/60 hover:bg-accent'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox id="instock" checked={inStock} onCheckedChange={(v) => { setInStock(!!v); setPage(1) }} />
        <label htmlFor="instock" className="text-sm font-medium cursor-pointer">{t('in_stock_only')}</label>
      </div>

      {hasFilters && (
        <Button variant="outline" onClick={clear} className="rounded-xl w-full">{t('clear_filters')}</Button>
      )}
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-8">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4" aria-label={t('a11y_breadcrumb')}>
        <button onClick={() => go('/')} className="hover:text-primary transition-colors">{lang === 'ar' ? 'الرئيسية' : 'Home'}</button>
        <ChevronRight className="w-3 h-3 flip-x rtl:rotate-180" />
        <span className="font-semibold text-foreground">
          {searchQuery ? `${t('search_results_for')} "${searchQuery}"` : (lang === 'ar' ? category?.nameAr : category?.nameEn) || ''}
        </span>
      </nav>

      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            {searchQuery ? `"${searchQuery}"` : (lang === 'ar' ? category?.nameAr : category?.nameEn)}
          </h1>
          {category && !searchQuery && (
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
              {lang === 'ar' ? category.descAr : category.descEn}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {total} {t('results')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
            <SelectTrigger className="w-40 sm:w-48 rounded-xl h-10 text-sm" aria-label={t('sort_by')}>
              <SelectValue placeholder={t('sort_by')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">{t('sort_popular')}</SelectItem>
              <SelectItem value="price-asc">{t('sort_price_asc')}</SelectItem>
              <SelectItem value="price-desc">{t('sort_price_desc')}</SelectItem>
              <SelectItem value="rating">{t('sort_rating')}</SelectItem>
              <SelectItem value="newest">{t('sort_newest')}</SelectItem>
            </SelectContent>
          </Select>

          {/* mobile filters */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="rounded-xl h-10 lg:hidden gap-1.5">
                <SlidersHorizontal className="w-4 h-4" /> {t('filters')}
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-80 overflow-y-auto">
              <SheetTitle>{t('filters')}</SheetTitle>
              {FiltersPanel}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-8">
        {/* sidebar filters */}
        <aside className="hidden lg:block">
          <Card className="p-5 sticky top-40">
            <p className="font-black text-base mb-5">{t('filters')}</p>
            {FiltersPanel}
          </Card>
        </aside>

        {/* products */}
        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                <PackageSearch className="w-7 h-7 text-primary" />
              </span>
              <p className="font-bold">{t('no_products')}</p>
              {hasFilters && <Button variant="outline" onClick={clear} className="rounded-xl">{t('clear_filters')}</Button>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-xl" aria-label={t('prev')}>
                    <ChevronLeft className="w-4 h-4 flip-x rtl:rotate-180" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {t('page')} {page} {t('product_of')} {pages}
                  </span>
                  <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-xl" aria-label={t('next')}>
                    <ChevronRight className="w-4 h-4 flip-x rtl:rotate-180" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(v: number) {
  return v.toLocaleString('en-US')
}

'use client'
import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Star, ShoppingCart, Minus, Plus, FileText, ShieldCheck, Truck, Cross, Package, ChevronRight, Banknote, Timer, ZoomIn } from 'lucide-react'
import { useLang } from './LangContext'
import { useProduct, type Product } from './hooks'
import { ProductCard, fmtPrice } from './ProductCard'
import { ProductImage } from './ProductImage'
import { go } from '@/lib/router'
import { useCart } from '@/lib/store'
import { useRecent } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { useEffect } from 'react'
import { trackEvent } from '@/lib/track'

export function ProductView({ slug, initial }: { slug: string; initial?: { product: any; related: any[] } }) {
  const { lang, t } = useLang()
  const { data, isLoading, isError } = useProduct(slug, initial)
  const add = useCart((s) => s.add)
  const pushRecent = useRecent((s) => s.push)
  const { toast } = useToast()
  const [qty, setQty] = useState(1)
  const [descOpen, setDescOpen] = useState(false)
  const zoomRef = useRef<HTMLDivElement>(null)
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({})

  const onZoomMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = zoomRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    setZoomStyle({ transformOrigin: `${x}% ${y}%` })
  }

  useEffect(() => {
    if (data?.product) {
      pushRecent(data.product.id)
      // commerce analytics: product page view
      trackEvent('view_item', {
        productId: data.product.slug,
        path: `/product/${data.product.slug}`,
        value: data.product.price,
        name: data.product.nameEn,
      })
    }
  }, [data?.product?.id, pushRecent])

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-8 grid lg:grid-cols-2 gap-10">
        <Skeleton className="aspect-square rounded-3xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
    )
  }

  if (isError || !data?.product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center flex flex-col items-center gap-3">
        <p className="font-bold text-lg">{t('no_results')}</p>
        <Button onClick={() => go('/')} className="rounded-xl">{t('continue_shopping')}</Button>
      </div>
    )
  }

  const p: Product = data.product
  const name = lang === 'ar' ? p.nameAr : p.nameEn
  const desc = lang === 'ar' ? p.descAr : p.descEn
  const discount = p.compareAtPrice && p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0

  const onAdd = () => {
    add({
      productId: p.id, slug: p.slug, nameEn: p.nameEn, nameAr: p.nameAr,
      price: p.price, stock: p.stock, prescriptionRequired: p.prescriptionRequired,
      imageUrl: p.imageUrl,
    }, qty)
    toast({ description: `${name} — ${lang === 'ar' ? 'تمت الإضافة للعربة' : 'Added to cart'}` })
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-8 pb-16">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="breadcrumb">
        <button onClick={() => go('/')} className="hover:text-primary transition-colors">{lang === 'ar' ? 'الرئيسية' : 'Home'}</button>
        <ChevronRight className="w-3 h-3 flip-x rtl:rotate-180" />
        <button onClick={() => go(`/c/${p.category.slug}`)} className="hover:text-primary transition-colors">
          {lang === 'ar' ? p.category.nameAr : p.category.nameEn}
        </button>
        <ChevronRight className="w-3 h-3 flip-x rtl:rotate-180" />
        <span className="font-semibold text-foreground truncate max-w-[200px]">{name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        <div className="flex flex-col gap-4">
          <div
            ref={zoomRef}
            onMouseMove={onZoomMove}
            onMouseLeave={() => setZoomStyle({})}
            className="group/zoom relative overflow-hidden rounded-3xl border shadow-sm"
            aria-hidden={false}
          >
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-accent/40 to-transparent pointer-events-none z-0" />
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt={name}
                className="relative z-10 w-full aspect-square object-contain p-3 transition-transform duration-300 ease-out group-hover/zoom:scale-[1.6]"
                style={zoomStyle}
              />
            ) : (
              <ProductImage slug={p.slug} category={p.category.slug} brand={p.brand} imageUrl={p.imageUrl} alt={name} className="relative z-10 w-full aspect-square" rounded="rounded-3xl" sizes="(max-width: 1024px) 92vw, 45vw" />
            )}
            {discount > 0 && (
              <Badge className="absolute top-4 start-4 z-20 bg-red-500 hover:bg-red-500 text-sm font-black px-3 py-1.5 shadow-md">-{discount}% {t('off')}</Badge>
            )}
            {p.imageUrl && (
              <span className="absolute bottom-4 end-4 z-20 text-[10px] font-bold text-muted-foreground bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm opacity-0 group-hover/zoom:opacity-100 transition-opacity inline-flex items-center gap-1">
                <ZoomIn className="w-3 h-3" />
                {lang === 'ar' ? 'مرّر للتكبير' : 'Hover to zoom'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-accent/50">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="text-[11px] font-semibold text-center leading-tight">{t('trust_genuine')}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-accent/50">
              <Truck className="w-5 h-5 text-primary" />
              <span className="text-[11px] font-semibold text-center leading-tight">{t('promo_1')}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-accent/50">
              <Cross className="w-5 h-5 text-primary" />
              <span className="text-[11px] font-semibold text-center leading-tight">{t('trust_pharmacist')}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">{p.brand}</span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{name}</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* honest social proof: ratings/reviews only show when real reviews exist */}
            {p.reviewCount > 0 && (
              <>
                <span className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(p.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                  ))}
                </span>
                <span className="text-sm font-bold">{p.rating.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">({p.reviewCount} {t('reviews')})</span>
              </>
            )}
            {p.volume && <Badge variant="secondary" className="font-semibold"><Package className="w-3 h-3 me-1" />{p.volume}</Badge>}
          </div>

          {p.prescriptionRequired && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <FileText className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800">{t('rx_required')}</p>
            </div>
          )}

          <div className="flex items-end gap-3">
            <span className="text-3xl font-black text-foreground">{fmtPrice(p.price, lang)}</span>
            {discount > 0 && p.compareAtPrice && (
              <>
                <span className="text-lg text-muted-foreground line-through">{fmtPrice(p.compareAtPrice, lang)}</span>
                <Badge className="bg-red-500 hover:bg-red-500 font-bold">{t('savings')} {fmtPrice(p.compareAtPrice - p.price, lang)}</Badge>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold">
            {p.stock > 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t('in_stock')}
                {p.stock <= 10 && <span className="text-amber-600"> — {t('low_stock')} ({p.stock})</span>}
              </span>
            ) : (
              <span className="text-red-500">{t('out_of_stock')}</span>
            )}
          </div>

          <Separator />

          {/* delivery / payment reassurance chips */}
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
              <Timer className="w-4 h-4 text-primary shrink-0" /> {t('delivery_express')}
            </span>
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
              <Truck className="w-4 h-4 text-primary shrink-0" /> {t('delivery_nationwide')}
            </span>
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
              <Banknote className="w-4 h-4 text-primary shrink-0" /> {t('cod_available')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center border rounded-2xl overflow-hidden h-12">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 h-full flex items-center justify-center hover:bg-accent transition-colors" aria-label="decrease">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center font-black">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(Math.min(p.stock, 20), q + 1))} disabled={p.stock <= 0} className="w-11 h-full flex items-center justify-center hover:bg-accent disabled:opacity-40 transition-colors" aria-label="increase">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <Button
              size="lg"
              disabled={p.stock <= 0}
              onClick={onAdd}
              className="flex-1 h-12 rounded-2xl text-base font-bold gap-2 shadow-lg shadow-primary/20"
            >
              <ShoppingCart className="w-5 h-5" /> {t('add_to_cart')}
            </Button>
          </div>

          <Tabs defaultValue="desc" className="mt-2">
            <TabsList className="rounded-xl h-11">
              <TabsTrigger value="desc" className="rounded-lg font-semibold">{t('description')}</TabsTrigger>
            </TabsList>
            <TabsContent value="desc" className="mt-4">
              <div
                className={`text-sm md:text-[15px] leading-7 text-foreground/85 whitespace-pre-line ${!descOpen && (desc || '').length > 420 ? 'max-h-[130px] overflow-hidden relative' : ''}`}
              >
                {desc || (lang === 'ar' ? 'منتج أصلي من ذا فارميسي.' : 'Genuine product from The Pharmacy.')}
                {!descOpen && (desc || '').length > 420 && (
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                )}
              </div>
              {(desc || '').length > 420 && (
                <button
                  onClick={() => setDescOpen((v) => !v)}
                  className="mt-1 text-sm font-bold text-primary inline-flex items-center gap-1 hover:gap-1.5 transition-all"
                >
                  {descOpen ? (lang === 'ar' ? 'عرض أقل' : 'Show less') : (lang === 'ar' ? 'اقرأ المزيد' : 'Read more')}
                  <ChevronDown className={`w-4 h-4 transition-transform ${descOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              {p.prescriptionRequired && (
                <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  {lang === 'ar' ? 'تنبيه: يصرف هذا الدواء بروشتة طبية فقط. يرجى استشارة الطبيب أو الصيدلي قبل الاستخدام.' : 'Note: This medication requires a valid prescription. Please consult your doctor or pharmacist before use.'}
                </p>
              )}
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between p-3 rounded-xl bg-muted/40">
                  <span className="text-muted-foreground">{lang === 'ar' ? 'الماركة' : 'Brand'}</span>
                  <span className="font-semibold">{p.brand}</span>
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-muted/40">
                  <span className="text-muted-foreground">{lang === 'ar' ? 'القسم' : 'Category'}</span>
                  <span className="font-semibold">{lang === 'ar' ? p.category.nameAr : p.category.nameEn}</span>
                </div>
                {p.volume && (
                  <div className="flex justify-between p-3 rounded-xl bg-muted/40">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'الحجم' : 'Size'}</span>
                    <span className="font-semibold">{p.volume}</span>
                  </div>
                )}
                <div className="flex justify-between p-3 rounded-xl bg-muted/40">
                  <span className="text-muted-foreground">{lang === 'ar' ? 'الروشتة' : 'Prescription'}</span>
                  <span className="font-semibold">{p.prescriptionRequired ? t('rx_required') : (lang === 'ar' ? 'غير مطلوبة' : 'Not required')}</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* related */}
      {data.related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-5">{t('related_products')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.related.slice(0, 4).map((r) => <ProductCard key={r.id} p={r} />)}
          </div>
        </section>
      )}
    </div>
  )
}

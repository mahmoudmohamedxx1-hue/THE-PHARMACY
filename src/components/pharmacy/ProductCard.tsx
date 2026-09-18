'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star, ShoppingCart, Heart, FileText } from 'lucide-react'
import { useCart, useWishlist } from '@/lib/store'
import { useLang } from './LangContext'
import { ProductImage } from './ProductImage'
import { go } from '@/lib/router'
import { useToast } from '@/hooks/use-toast'
import type { Lang } from '@/lib/i18n'

export interface P {
  id: string; slug: string; nameEn: string; nameAr: string; brand: string
  price: number; compareAtPrice?: number | null; stock: number; rating: number
  reviewCount: number; prescriptionRequired: boolean; category: { slug: string } | string
  volume?: string; imageUrl?: string | null
}

export function fmtPrice(v: number, lang: Lang) {
  const n = v % 1 === 0 ? v.toLocaleString('en-US') : v.toFixed(2)
  return lang === 'ar' ? `${n} جنيه` : `EGP ${n}`
}

export function ProductCard({ p, eager = false }: { p: P; eager?: boolean }) {
  const { lang } = useLang()
  const add = useCart((s) => s.add)
  const wishlist = useWishlist()
  const { toast } = useToast()
  const catSlug = typeof p.category === 'string' ? p.category : p.category?.slug
  const name = lang === 'ar' ? p.nameAr : p.nameEn
  const discount = p.compareAtPrice && p.compareAtPrice > p.price
    ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0

  const onAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (p.stock <= 0) return
    add({
      productId: p.id, slug: p.slug, nameEn: p.nameEn, nameAr: p.nameAr,
      price: p.price, stock: p.stock, prescriptionRequired: p.prescriptionRequired,
      imageUrl: p.imageUrl || undefined,
    })
    toast({ description: `${name} — ${lang === 'ar' ? 'تمت الإضافة للعربة' : 'Added to cart'}` })
  }

  const onWish = (e: React.MouseEvent) => {
    e.stopPropagation()
    const addedNow = wishlist.toggle(p.id)
    toast({ description: addedNow
      ? (lang === 'ar' ? 'أضيف للمفضلة' : 'Added to wishlist')
      : (lang === 'ar' ? 'أُزيل من المفضلة' : 'Removed from wishlist') })
  }

  return (
    <Card
      onClick={() => go(`/p/${p.slug}`)}
      className="group relative cursor-pointer rounded-2xl border-border/60 bg-card overflow-hidden shadow-[0_1px_2px_rgba(16,40,55,0.04)] hover:border-primary/35 hover:shadow-[0_14px_36px_-14px_rgba(13,148,136,0.3)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col p-0 gap-0"
    >
      {/* image */}
      <div className="relative p-2.5 pb-0 sm:p-3 sm:pb-0">
        <ProductImage
          slug={p.slug} category={catSlug} brand={p.brand} imageUrl={p.imageUrl} alt={name}
          zoom
          eager={eager}
          className="w-full aspect-square rounded-xl border-border/40"
          rounded="rounded-xl"
        />
        {discount > 0 && (
          <Badge className="absolute top-4 start-3.5 sm:top-4 sm:start-4 bg-red-500 hover:bg-red-500 text-[11px] font-black shadow-sm">
            -{discount}%
          </Badge>
        )}
        {p.prescriptionRequired && (
          <Badge variant="secondary" className="absolute top-4 end-3.5 sm:top-4 sm:end-4 gap-1 text-[11px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-sm">
            <FileText className="w-3 h-3" /> {lang === 'ar' ? 'روشتة' : 'Rx'}
          </Badge>
        )}
        <button
          onClick={onWish}
          aria-label={lang === 'ar' ? 'أضف للمفضلة' : 'Add to wishlist'}
          className="absolute bottom-4 end-4 z-10 bg-white/95 backdrop-blur rounded-full p-2 shadow-sm hover:scale-110 active:scale-95 transition-transform min-w-9 min-h-9 flex items-center justify-center"
        >
          <Heart className={`w-4 h-4 transition-colors ${wishlist.has(p.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground/80 group-hover:text-red-400'}`} />
        </button>
        {p.stock === 0 && (
          <div className="absolute inset-2.5 rounded-xl bg-white/65 backdrop-blur-[1.5px] flex items-center justify-center">
            <span className="bg-foreground/80 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              {lang === 'ar' ? 'غير متوفر' : 'Out of stock'}
            </span>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-col gap-1 flex-1 p-3.5 pt-3 sm:p-4 sm:pt-3">
        <span className="text-[10.5px] font-bold text-primary/80 uppercase tracking-[0.08em] truncate">{p.brand}</span>
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]">
          {name}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-h-[18px]">
          {/* honest social proof: ratings/reviews only show when real reviews exist */}
          {p.reviewCount > 0 && (
            <>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
              <span className="font-bold text-foreground/90">{p.rating.toFixed(1)}</span>
              <span className="text-muted-foreground/70">({p.reviewCount})</span>
            </>
          )}
          {p.stock > 0 && p.stock <= 10 && (
            <span className={`${p.reviewCount > 0 ? 'ms-auto' : ''} text-[10.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full`}>{lang === 'ar' ? 'آخر ' : 'Only '}{p.stock}</span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2.5 pt-2.5 border-t border-border/50">
          <div className="flex flex-col leading-tight min-w-0">
            {p.volume && (
              <span className="text-[10.5px] text-muted-foreground/80 font-medium mb-0.5 truncate">{p.volume}</span>
            )}
            <span className="text-base font-extrabold text-foreground tracking-tight whitespace-nowrap">{fmtPrice(p.price, lang)}</span>
            {discount > 0 && p.compareAtPrice && (
              <span className="text-[11px] text-muted-foreground/80 line-through">{fmtPrice(p.compareAtPrice, lang)}</span>
            )}
          </div>
          <Button
            size="icon"
            onClick={onAdd}
            disabled={p.stock <= 0}
            aria-label={lang === 'ar' ? 'أضف للعربة' : 'Add to cart'}
            className="rounded-xl h-11 w-11 shrink-0 shadow-sm group-hover:shadow-[0_6px_16px_-6px_rgba(13,148,136,0.5)] group-hover:bg-primary group-hover:text-primary-foreground transition-all"
          >
            <ShoppingCart className="w-4.5 h-4.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

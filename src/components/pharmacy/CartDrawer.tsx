'use client'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight, Truck } from 'lucide-react'
import { useCart } from '@/lib/store'
import { useLang } from './LangContext'
import { go } from '@/lib/router'
import { fmtPrice } from './ProductCard'
import { ProductImage } from './ProductImage'
import { FREE_DELIVERY_THRESHOLD } from '@/lib/zones'

export function CartDrawer() {
  const { lang, t } = useLang()
  const { items, isOpen, close, remove, setQty } = useCart()
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const count = items.reduce((s, i) => s + i.qty, 0)
  const progress = Math.min(100, (subtotal / FREE_DELIVERY_THRESHOLD) * 100)
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal)

  return (
    <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent side={lang === 'ar' ? 'left' : 'right'} className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetTitle className="sr-only">{t('cart')}</SheetTitle>
        <div className="p-4 border-b flex items-center gap-2.5">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <span className="font-black text-lg">{t('cart')}</span>
          <span className="text-sm text-muted-foreground">({count} {t('items')})</span>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-primary" />
            </span>
            <p className="font-bold">{t('cart_empty')}</p>
            <p className="text-sm text-muted-foreground">{t('cart_empty_sub')}</p>
            <Button onClick={() => { close(); go('/') }} className="mt-2 rounded-xl">
              {t('continue_shopping')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {items.map((i) => (
                <div key={i.productId} className="flex gap-3 p-3 rounded-2xl border bg-card hover:border-primary/30 transition-colors">
                  <button onClick={() => { close(); go(`/p/${i.slug}`) }} className="shrink-0" aria-label="view product">
                    <ProductImage slug={i.slug} category="pill" brand="" imageUrl={i.imageUrl} alt={lang === 'ar' ? i.nameAr : i.nameEn} className="w-20 h-20 rounded-xl border-border/50" rounded="rounded-xl" sizes="80px" />
                  </button>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <button onClick={() => { close(); go(`/p/${i.slug}`) }} className="text-start">
                      <p className="text-sm font-semibold line-clamp-2 hover:text-primary transition-colors">
                        {lang === 'ar' ? i.nameAr : i.nameEn}
                      </p>
                    </button>
                    <span className="text-sm font-extrabold text-primary">{fmtPrice(i.price, lang)}</span>
                    {i.prescriptionRequired && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 w-fit px-2 py-0.5 rounded-full">
                        {t('rx_required')}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center border rounded-xl overflow-hidden h-8">
                        <button
                          onClick={() => setQty(i.productId, i.qty - 1)}
                          className="w-8 h-full flex items-center justify-center hover:bg-accent transition-colors"
                          aria-label="decrease"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{i.qty}</span>
                        <button
                          onClick={() => setQty(i.productId, i.qty + 1)}
                          disabled={i.qty >= Math.min(i.stock, 20)}
                          className="w-8 h-full flex items-center justify-center hover:bg-accent disabled:opacity-40 transition-colors"
                          aria-label="increase"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => remove(i.productId)}
                        className="ms-auto text-muted-foreground hover:text-red-500 transition-colors p-1.5"
                        aria-label={t('remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t p-4 flex flex-col gap-3 bg-muted/30">
              {subtotal < FREE_DELIVERY_THRESHOLD ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-primary" />
                    {fmtPrice(remaining, lang)} {t('free_delivery_hint')}
                  </span>
                  <Progress value={progress} className="h-1.5" />
                </div>
              ) : (
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> {t('promo_1')} 🎉
                </span>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('subtotal')}</span>
                <span className="text-lg font-black">{fmtPrice(subtotal, lang)}</span>
              </div>
              <Button
                size="lg"
                className="w-full rounded-2xl text-base font-bold gap-2"
                onClick={() => { close(); go('/checkout') }}
              >
                {t('checkout')} <ArrowRight className="w-4 h-4 flip-x rtl:rotate-180" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

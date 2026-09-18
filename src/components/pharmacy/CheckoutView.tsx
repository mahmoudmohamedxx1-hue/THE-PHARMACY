'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Banknote, MapPin, Phone, Truck, ShoppingBag, Loader2, ShieldCheck } from 'lucide-react'
import { useCart } from '@/lib/store'
import { useLang } from './LangContext'
import { ProductImage } from './ProductImage'
import { fmtPrice } from './ProductCard'
import { go } from '@/lib/router'
import { ZONES, FREE_DELIVERY_THRESHOLD } from '@/lib/zones'
import { trackEvent } from '@/lib/track'
import { EGYPT_PHONE_RE } from '@/lib/order-utils'

export function CheckoutView() {
  const { lang, t, user } = useLang()
  const { items, clear } = useCart()
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [zone, setZone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const zoneInfo = ZONES.find((z) => z.id === zone)
  const deliveryFee = zoneInfo ? (subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : zoneInfo.fee) : 0
  const total = subtotal + deliveryFee
  const etaLabel = zoneInfo
    ? (zoneInfo.eta === 'same-day' ? t('same_day') : zoneInfo.eta === 'next-day' ? t('next_day') : zoneInfo.eta === '2-3 days' ? t('days_2_3') : t('days_3_5'))
    : ''

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex flex-col items-center gap-4 text-center">
        <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
          <ShoppingBag className="w-7 h-7 text-primary" />
        </span>
        <p className="font-bold text-lg">{t('cart_empty')}</p>
        <Button onClick={() => go('/')} className="rounded-xl">{t('continue_shopping')}</Button>
      </div>
    )
  }

  const submit = async () => {
    setError('')
    if (!zone) { setError(lang === 'ar' ? 'اختر منطقة التوصيل' : 'Select a delivery zone'); return }
    if (address.trim().length < 8) { setError(lang === 'ar' ? 'أدخل عنواناً كاملاً' : 'Enter a complete address'); return }
    const cleanPhone = phone.replace(/[\s-]/g, '')
    if (!EGYPT_PHONE_RE.test(cleanPhone)) { setError(t('phone_hint')); return }

    // commerce analytics: user is committing to the order
    trackEvent('begin_checkout', { path: '/checkout', value: total })

    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.qty })),
          zone, address: address.trim(), phone: cleanPhone, notes: notes.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error === 'out_of_stock'
          ? `${data.name} — ${lang === 'ar' ? 'الكمية المتاحة' : 'available'}: ${data.available}`
          : t('error_generic'))
        return
      }
      clear()
      // purchase mirror to GA4 / Meta Pixel (first-party event is recorded
      // server-side by /api/orders — no double count internally)
      trackEvent('purchase', {
        path: '/checkout',
        value: data.order?.total ?? total,
        orderId: data.order?.orderNumber,
      })
      // Navigate by orderNumber (not the cuid): the order API lets guests
      // view their order via the random order number only — using the cuid
      // made the success page 403 for guest checkouts.
      go(`/success/${data.order.orderNumber}`)
    } catch {
      setError(t('error_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-8 pb-16">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">{t('checkout')}</h1>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        {/* form */}
        <div className="flex flex-col gap-6">
          <Card className="p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MapPin className="w-4.5 h-4.5" />
              </span>
              <h2 className="font-black text-lg">{t('delivery_details')}</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t('full_name')}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl h-11" placeholder={user?.name || (lang === 'ar' ? 'محمد أحمد' : 'Mohamed Ahmed')} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{t('phone')} *</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl h-11" dir="ltr" placeholder="01012345678" required />
                <p className="text-[11px] text-muted-foreground">{t('phone_hint')}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('zone_select')} *</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger className="rounded-xl h-11 w-full" aria-label={t('zone_select')}>
                  <SelectValue placeholder={t('zone_select')} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ZONES.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      <span className="flex items-center justify-between gap-6 w-full">
                        <span>{lang === 'ar' ? z.nameAr : z.nameEn}</span>
                        <span className="text-xs text-muted-foreground">{subtotal >= FREE_DELIVERY_THRESHOLD ? t('free') : `${z.fee} EGP`}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {zoneInfo && (
                <Badge variant="secondary" className="w-fit gap-1.5 mt-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  <Truck className="w-3.5 h-3.5" /> {etaLabel}
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="address">{t('address')} *</Label>
              <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-xl min-h-24" placeholder={t('address_hint')} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">{t('notes')}</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl h-11" />
            </div>
          </Card>

          {/* payment */}
          <Card className="p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Banknote className="w-4.5 h-4.5" />
              </span>
              <h2 className="font-black text-lg">{t('payment_method')}</h2>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-primary bg-primary/5">
              <span className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5" />
              </span>
              <div>
                <p className="font-bold">{t('cod')}</p>
                <p className="text-xs text-muted-foreground">{t('cod_desc')}</p>
              </div>
              <Badge className="ms-auto bg-primary hover:bg-primary">{lang === 'ar' ? 'محدد' : 'Selected'}</Badge>
            </div>
            {!user && (
              <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" /> {t('login_to_checkout')}
              </p>
            )}
          </Card>
        </div>

        {/* summary */}
        <Card className="p-6 h-fit lg:sticky lg:top-40 flex flex-col gap-4">
          <h2 className="font-black text-lg">{t('order_summary')}</h2>
          <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pe-1">
            {items.map((i) => (
              <div key={i.productId} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5 min-w-0">
                  <ProductImage slug={i.slug} category="pill" brand="" imageUrl={i.imageUrl} alt={lang === 'ar' ? i.nameAr : i.nameEn} className="w-11 h-11 shrink-0 rounded-lg border-border/50" rounded="rounded-lg" sizes="44px" />
                  <span className="min-w-0">
                    <span className="block font-medium line-clamp-1">{lang === 'ar' ? i.nameAr : i.nameEn}</span>
                    <span className="text-xs text-muted-foreground">× {i.qty}</span>
                  </span>
                </span>
                <span className="font-bold shrink-0">{fmtPrice(i.price * i.qty, lang)}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('subtotal')}</span>
              <span className="font-bold">{fmtPrice(subtotal, lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('delivery_fee')}</span>
              <span className="font-bold">{zoneInfo ? (deliveryFee === 0 ? <span className="text-primary">{t('free')}</span> : fmtPrice(deliveryFee, lang)) : '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-bold">{t('total')}</span>
              <span className="font-black text-primary text-lg">{fmtPrice(total, lang)}</span>
            </div>
          </div>
          {error && (
            <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
          )}
          <Button size="lg" onClick={submit} disabled={loading} className="h-12 rounded-2xl text-base font-bold gap-2 shadow-lg shadow-primary/20">
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('place_order')}
          </Button>
        </Card>
      </div>
    </div>
  )
}

export function SuccessView({ orderId }: { orderId: string }) {
  const { t, lang } = useLang()
  const [order, setOrder] = useState<any>(null)

  useEffect(() => {
    if (!orderId) return
    fetch(`/api/orders/${orderId}`)
      .then((r) => r.json())
      .then((d) => setOrder(d.order || null))
      .catch(() => setOrder(null))
  }, [orderId])

  return (
    <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center gap-5 text-center">
      <span className="relative w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-primary animate-ping opacity-60" />
      </span>
      <h1 className="text-2xl sm:text-3xl font-black">{t('order_success')}</h1>
      <p className="text-muted-foreground leading-relaxed">{t('order_success_sub')}</p>
      {order && (
        <div className="w-full flex flex-col gap-3 p-5 rounded-2xl border bg-card text-start">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('order_number')}</span>
            <span className="font-mono font-black text-primary">{order.orderNumber}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('total')}</span>
            <span className="font-black">{fmtPrice(order.total, lang)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('payment_method')}</span>
            <span className="font-semibold text-sm">{t('cod')}</span>
          </div>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button onClick={() => go('/orders')} variant="outline" className="rounded-xl font-bold">{t('track_orders')}</Button>
        <Button onClick={() => go('/')} className="rounded-xl font-bold">{t('continue_shopping')}</Button>
      </div>
    </div>
  )
}

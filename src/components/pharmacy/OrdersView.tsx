'use client'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Package, Clock, CheckCircle2, Truck, XCircle, Loader2, PackageOpen, MapPin, Phone, Mail, CalendarDays } from 'lucide-react'
import { useLang } from './LangContext'
import { fmtPrice } from './ProductCard'
import { ProductImage } from './ProductImage'
import { go } from '@/lib/router'
import { zoneById, ORDER_STATUSES } from '@/lib/zones'

const STATUS_META: Record<string, { icon: any; classes: string; key: 'st_pending' | 'st_confirmed' | 'st_preparing' | 'st_out_for_delivery' | 'st_delivered' | 'st_cancelled' }> = {
  pending: { icon: Clock, classes: 'bg-amber-50 text-amber-700 border-amber-200', key: 'st_pending' },
  confirmed: { icon: CheckCircle2, classes: 'bg-sky-50 text-sky-700 border-sky-200', key: 'st_confirmed' },
  preparing: { icon: Loader2, classes: 'bg-violet-50 text-violet-700 border-violet-200', key: 'st_preparing' },
  out_for_delivery: { icon: Truck, classes: 'bg-primary/10 text-primary border-primary/20', key: 'st_out_for_delivery' },
  delivered: { icon: CheckCircle2, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', key: 'st_delivered' },
  cancelled: { icon: XCircle, classes: 'bg-red-50 text-red-600 border-red-200', key: 'st_cancelled' },
}

function StatusBadge({ status, lang }: { status: string; lang: string }) {
  const { t } = useLang()
  const meta = STATUS_META[status] || STATUS_META.pending
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={`gap-1.5 font-bold ${meta.classes}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'preparing' ? 'animate-spin' : ''}`} />
      {t(meta.key)}
    </Badge>
  )
}

export function OrdersView() {
  const { lang, t, user } = useLang()
  const { data, isLoading } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/orders')
      return res.json()
    },
    enabled: !!user,
  })

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center gap-4 text-center">
        <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
          <Package className="w-7 h-7 text-primary" />
        </span>
        <p className="font-bold text-lg">{t('my_orders')}</p>
        <p className="text-muted-foreground text-sm">{t('login_to_checkout')}</p>
        <Button onClick={() => go('/login')} className="rounded-xl font-bold">{t('login')}</Button>
      </div>
    )
  }

  const orders: any[] = data?.orders || []

  return (
    <div className="max-w-4xl mx-auto w-full px-4 lg:px-6 py-8 pb-16">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">{t('my_orders')}</h1>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
            <PackageOpen className="w-7 h-7 text-primary" />
          </span>
          <p className="font-bold">{t('orders_empty')}</p>
          <Button onClick={() => go('/')} className="rounded-xl font-bold">{t('continue_shopping')}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {orders.map((o) => {
            const zone = zoneById(o.zone)
            return (
              <Card key={o.id} className="p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-primary">{o.orderNumber}</span>
                    <StatusBadge status={o.status} lang={lang} />
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {new Date(o.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  {o.items.map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between text-sm gap-3">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ProductImage slug={it.product?.slug || it.id} category="pill" brand="" imageUrl={it.product?.imageUrl} alt={lang === 'ar' ? it.nameAr : it.nameEn} className="w-10 h-10 shrink-0 rounded-lg border-border/50" rounded="rounded-lg" />
                        <span className="font-medium line-clamp-1">{lang === 'ar' ? it.nameAr : it.nameEn} × {it.quantity}</span>
                      </span>
                      <span className="font-bold shrink-0">{fmtPrice(it.price * it.quantity, lang)}</span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-4 justify-between text-sm">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {zone ? (lang === 'ar' ? zone.nameAr : zone.nameEn) : o.zone}</span>
                    <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {o.deliveryFee === 0 ? t('free') : fmtPrice(o.deliveryFee, lang)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('total')}</span>
                    <span className="font-black text-base">{fmtPrice(o.total, lang)}</span>
                  </div>
                </div>

                {/* progress timeline */}
                {o.status !== 'cancelled' && (
                  <div className="flex items-center gap-1 pt-1">
                    {ORDER_STATUSES.filter((s) => s !== 'cancelled' && s !== 'pending').map((s, i) => {
                      const idx = ORDER_STATUSES.indexOf(o.status as any)
                      const active = idx >= ORDER_STATUSES.indexOf(s)
                      return (
                        <div key={s} className="flex-1 flex items-center gap-1">
                          <span className={`h-1.5 flex-1 rounded-full ${active ? 'bg-primary' : 'bg-muted'}`} title={s} />
                          {i === 0 && null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AccountView() {
  const { t, user, lang } = useLang()
  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center gap-4 text-center">
        <p className="font-bold text-lg">{t('account_info')}</p>
        <Button onClick={() => go('/login')} className="rounded-xl font-bold">{t('login')}</Button>
      </div>
    )
  }
  return (
    <div className="max-w-2xl mx-auto w-full px-4 lg:px-6 py-8 pb-16">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">{t('account_info')}</h1>
      <Card className="p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl font-black">
            {(user.name || user.email)[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-black text-lg truncate">{user.name || user.email}</p>
            {user.isAdmin && <Badge className="bg-primary hover:bg-primary mb-1">{t('admin_panel')}</Badge>}
          </div>
        </div>
        <Separator />
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40">
            <Mail className="w-4.5 h-4.5 text-primary shrink-0" />
            <span className="truncate" dir="ltr">{user.email}</span>
          </div>
          {user.phone && (
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40">
              <Phone className="w-4.5 h-4.5 text-primary shrink-0" />
              <span dir="ltr">{user.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40 sm:col-span-2">
            <CalendarDays className="w-4.5 h-4.5 text-primary shrink-0" />
            {t('member_since')} {new Date().getFullYear()}
          </div>
        </div>
        <Button onClick={() => go('/orders')} className="rounded-2xl font-bold gap-2 mt-2">
          <Package className="w-4 h-4" /> {t('my_orders')}
        </Button>
      </Card>
    </div>
  )
}

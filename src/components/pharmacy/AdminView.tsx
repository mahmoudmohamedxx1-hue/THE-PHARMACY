'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, Package, ShoppingCart, Users, FileText, AlertTriangle, TrendingUp, Search, Loader2, Save, Pill, IndianRupee, Download, Filter } from 'lucide-react'
import { useLang } from './LangContext'
import { go } from '@/lib/router'
import { fmtPrice } from './ProductCard'
import { ORDER_STATUSES } from '@/lib/zones'
import { useToast } from '@/hooks/use-toast'

export function AdminView() {
  const { t, lang, user } = useLang()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [productSearch, setProductSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState<Record<string, { price: string; stock: string }>>({})

  const stats = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats')
      if (res.status === 403) throw new Error('forbidden')
      return res.json()
    },
    enabled: !!user?.isAdmin,
    refetchInterval: 30000,
  })

  const adminProducts = useQuery({
    queryKey: ['admin-products', productSearch, lowOnly],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products?q=${encodeURIComponent(productSearch)}&low=${lowOnly ? 1 : 0}`)
      return res.json()
    },
    enabled: !!user?.isAdmin,
  })

  const adminOrders = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const res = await fetch('/api/admin/orders')
      return res.json()
    },
    enabled: !!user?.isAdmin,
  })

  if (!user?.isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-4 text-center">
        <span className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7" />
        </span>
        <p className="font-bold text-lg">{t('admin_forbidden')}</p>
        <p className="text-sm text-muted-foreground font-mono">admin@thepharmacy.com / Admin@2026</p>
        <Button onClick={() => go('/login')} variant="outline" className="rounded-xl font-bold">{t('login')}</Button>
      </div>
    )
  }

  if (stats.isLoading) {
    return <div className="max-w-7xl mx-auto px-4 py-8 grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
  }

  const s = stats.data?.stats
  const prescriptions: any[] = adminOrders.data?.prescriptions || []
  const orders: any[] = adminOrders.data?.items || []
  const products: any[] = adminProducts.data?.items || []

  const saveProduct = async (p: any) => {
    const edit = editing[p.id]
    if (!edit) return
    const res = await fetch('/api/admin/products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, price: Number(edit.price), stock: Number(edit.stock) }),
    })
    if (res.ok) {
      toast({ description: t('a_save') + ' ✓' })
      setEditing((e) => { const n = { ...e }; delete n[p.id]; return n })
      adminProducts.refetch()
      stats.refetch()
    } else {
      toast({ description: t('error_generic') })
    }
  }

  const setStatus = async (id: string, status: string) => {
    const res = await fetch('/api/admin/orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) { qc.invalidateQueries({ queryKey: ['admin-orders'] }); stats.refetch() }
  }

  const statCards = [
    { icon: Package, label: t('a_products'), value: s?.products ?? 0, tint: 'text-primary bg-primary/10' },
    { icon: ShoppingCart, label: t('a_orders'), value: s?.orders ?? 0, tint: 'text-violet-600 bg-violet-50' },
    { icon: Users, label: t('a_customers'), value: s?.users ?? 0, tint: 'text-sky-600 bg-sky-50' },
    { icon: FileText, label: t('a_prescriptions'), value: s?.prescriptions ?? 0, tint: 'text-amber-600 bg-amber-50' },
    { icon: AlertTriangle, label: t('a_low_stock'), value: s?.lowStock ?? 0, tint: 'text-red-500 bg-red-50' },
    { icon: TrendingUp, label: t('a_revenue'), value: fmtPrice(s?.revenue ?? 0, lang), tint: 'text-emerald-600 bg-emerald-50' },
  ]

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-8 pb-16 flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
          <LayoutDashboard className="w-5.5 h-5.5" />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('admin_title')}</h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {statCards.map((c, i) => (
          <Card key={i} className="p-4 flex flex-col gap-2.5">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.tint}`}>
              <c.icon className="w-4.5 h-4.5" />
            </span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{c.label}</span>
            <span className="text-xl font-black">{c.value}</span>
          </Card>
        ))}
      </div>

      {/* top products */}
      {s?.topProducts?.length > 0 && (
        <Card className="p-5">
          <h2 className="font-black mb-4 flex items-center gap-2"><Pill className="w-4.5 h-4.5 text-primary" /> {t('a_top_products')}</h2>
          <div className="flex flex-col gap-2.5">
            {s.topProducts.map((tp: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium line-clamp-1">{lang === 'ar' ? tp.nameAr : tp.nameEn}</span>
                <Badge variant="secondary" className="font-bold shrink-0 ms-3">{tp.qty}×</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* analytics — first-party funnel (last 30 days) */}
      {(() => {
        const a = stats.data?.analytics
        if (!a) return null
        const f = a.funnel || {}
        const stages = [
          { key: 'pageViews', label: t('a_page_views') },
          { key: 'itemViews', label: t('a_item_views') },
          { key: 'addToCart', label: t('a_add_to_cart') },
          { key: 'beginCheckout', label: t('a_begin_checkout') },
          { key: 'purchases', label: t('a_purchases') },
        ] as const
        const max = Math.max(1, ...stages.map((st) => f[st.key] || 0))
        const hasData = stages.some((st) => (f[st.key] || 0) > 0)
        return (
          <Card className="p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-black flex items-center gap-2"><TrendingUp className="w-4.5 h-4.5 text-primary" /> {t('a_analytics')}</h2>
              {hasData && (
                <Badge variant="outline" className="font-bold bg-primary/5">
                  {(((f.purchases || 0) / Math.max(1, f.pageViews || 1)) * 100).toFixed(1)}% {t('a_conversion')}
                </Badge>
              )}
            </div>
            {!hasData ? (
              <p className="text-sm text-muted-foreground">{t('a_no_analytics')}</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {/* funnel bars */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('a_funnel')}</h3>
                  {stages.map((st) => {
                    const v = f[st.key] || 0
                    return (
                      <div key={st.key} className="flex items-center gap-3">
                        <span className="text-xs font-semibold w-36 shrink-0 line-clamp-1">{st.label}</span>
                        <div className="flex-1 h-7 rounded-lg bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-lg bg-gradient-to-l from-primary to-teal-400 transition-all"
                            style={{ width: `${Math.max(2, (v / max) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-black w-10 text-end">{v}</span>
                      </div>
                    )
                  })}
                </div>
                {/* top pages + most viewed */}
                <div className="flex flex-col gap-5">
                  {(a.topPages?.length > 0) && (
                    <div className="flex flex-col gap-2">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('a_top_pages')}</h3>
                      {a.topPages.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-xs line-clamp-1" dir="ltr">{p.path}</span>
                          <Badge variant="secondary" className="font-bold shrink-0 ms-3">{p.views}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {(a.topViewed?.length > 0) && (
                    <div className="flex flex-col gap-2">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('a_most_viewed')}</h3>
                      {a.topViewed.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="font-medium line-clamp-1">{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                          <Badge variant="secondary" className="font-bold shrink-0 ms-3">{p.views}×</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })()}

      <Tabs defaultValue="orders">
        <TabsList className="rounded-xl h-11">
          <TabsTrigger value="orders" className="rounded-lg font-semibold gap-1.5"><ShoppingCart className="w-4 h-4" /> {t('a_manage_orders')}</TabsTrigger>
          <TabsTrigger value="products" className="rounded-lg font-semibold gap-1.5"><Package className="w-4 h-4" /> {t('a_manage_products')}</TabsTrigger>
          <TabsTrigger value="rx" className="rounded-lg font-semibold gap-1.5"><FileText className="w-4 h-4" /> {t('a_rx_requests')}</TabsTrigger>
        </TabsList>

        {/* orders tab */}
        <TabsContent value="orders" className="mt-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
              <span className="text-sm font-bold text-muted-foreground">{orders.length} / {adminOrders.data?.total ?? 0}</span>
              <Button asChild variant="outline" size="sm" className="rounded-lg font-bold gap-1.5">
                <a href="/api/admin/orders/export" download>
                  <Download className="w-4 h-4" /> {t('a_export_csv')}
                </a>
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">#</TableHead>
                    <TableHead className="font-bold">{t('a_customer')}</TableHead>
                    <TableHead className="font-bold">{t('order_items')}</TableHead>
                    <TableHead className="font-bold">{t('total')}</TableHead>
                    <TableHead className="font-bold">{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono font-bold text-primary whitespace-nowrap">{o.orderNumber}</TableCell>
                      <TableCell>
                        <span className="block text-sm font-medium truncate max-w-40">{o.user?.name || o.user?.email || t('a_guest')}</span>
                        <span className="block text-[11px] text-muted-foreground" dir="ltr">{o.phone}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm line-clamp-2 max-w-64">{o.items.map((it: any) => `${lang === 'ar' ? it.nameAr : it.nameEn} ×${it.quantity}`).join(', ')}</span>
                      </TableCell>
                      <TableCell className="font-black whitespace-nowrap">{fmtPrice(o.total, lang)}</TableCell>
                      <TableCell>
                        <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                          <SelectTrigger className="w-36 h-9 rounded-lg text-xs font-bold" aria-label={t('status')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map((st) => (
                              <SelectItem key={st} value={st} className="text-xs font-semibold">
                                {t(`st_${st}` as any)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* products tab */}
        <TabsContent value="products" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t('a_search_products')}
                className="ps-10 rounded-xl h-10"
              />
            </div>
            <Button
              variant={lowOnly ? 'default' : 'outline'}
              size="sm"
              className="rounded-lg font-bold gap-1.5 h-10"
              onClick={() => setLowOnly((v) => !v)}
            >
              <Filter className="w-4 h-4" />
              {lowOnly ? t('a_all') : t('a_low_stock_only')}
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg font-bold gap-1.5 h-10">
              <a href="/api/admin/products/export" download>
                <Download className="w-4 h-4" /> {t('a_export_csv')}
              </a>
            </Button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">{lang === 'ar' ? 'المنتج' : 'Product'}</TableHead>
                    <TableHead className="font-bold">{t('a_price_col')}</TableHead>
                    <TableHead className="font-bold">{t('a_stock_col')}</TableHead>
                    <TableHead className="font-bold w-14"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminProducts.isLoading ? (
                    <TableRow><TableCell colSpan={4}><Skeleton className="h-8 rounded-lg" /></TableCell></TableRow>
                  ) : products.map((p) => {
                    const edit = editing[p.id]
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="block text-sm font-semibold line-clamp-1 max-w-64">{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                          <span className="block text-[11px] text-muted-foreground">{p.brand} · {lang === 'ar' ? p.category?.nameAr : p.category?.nameEn}</span>
                        </TableCell>
                        <TableCell>
                          <Input
                            dir="ltr"
                            value={edit?.price ?? String(p.price)}
                            onChange={(e) => setEditing((ed) => ({ ...ed, [p.id]: { price: e.target.value, stock: edit?.stock ?? String(p.stock) } }))}
                            className="w-24 h-9 rounded-lg text-sm"
                            aria-label={t('a_price_col')}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              dir="ltr"
                              value={edit?.stock ?? String(p.stock)}
                              onChange={(e) => setEditing((ed) => ({ ...ed, [p.id]: { price: edit?.price ?? String(p.price), stock: e.target.value } }))}
                              className={`w-20 h-9 rounded-lg text-sm ${p.stock <= 10 ? 'border-red-300 text-red-600 font-bold' : ''}`}
                              aria-label={t('a_stock_col')}
                            />
                            {p.stock <= 10 && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="outline"
                            className="w-9 h-9 rounded-lg"
                            disabled={!edit}
                            onClick={() => saveProduct(p)}
                            aria-label={t('a_save')}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* prescriptions tab */}
        <TabsContent value="rx" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">{t('order_date')}</TableHead>
                    <TableHead className="font-bold">{t('a_customer')}</TableHead>
                    <TableHead className="font-bold">{t('rx_detected')}</TableHead>
                    <TableHead className="font-bold">{t('phone')}</TableHead>
                    <TableHead className="font-bold">{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.map((rx) => (
                    <TableRow key={rx.id}>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(rx.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</TableCell>
                      <TableCell className="text-sm">{rx.user?.email || t('a_guest')}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-72">
                          {(JSON.parse(rx.detectedMedicines || '[]') as string[]).slice(0, 4).map((m, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-semibold">{m}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm" dir="ltr">{rx.phone || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-bold bg-sky-50 text-sky-700 border-sky-200">{rx.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

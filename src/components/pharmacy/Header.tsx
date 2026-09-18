'use client'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Cross, Search, ShoppingCart, User, Menu, LogOut, Package, LayoutDashboard, Languages, Heart, Sparkles } from 'lucide-react'
import { useCart, useWishlist } from '@/lib/store'
import { useLang } from './LangContext'
import { go } from '@/lib/router'
import { useToast } from '@/hooks/use-toast'
import { fmtPrice } from './ProductCard'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InstallAppButton } from './InstallAppButton'

interface Suggestion {
  id: string; slug: string; nameEn: string; nameAr: string; price: number; brand: string; stock: number; imageUrl?: string | null
  category: { slug: string }
}

interface Cat { slug: string; nameEn: string; nameAr: string; productCount: number }

export function Header({ categories }: { categories: Cat[] }) {
  const { lang, setLang, t, user, setUser } = useLang()
  const items = useCart((s) => s.items)
  const openCart = useCart((s) => s.open)
  const wishlist = useWishlist()
  const wishCount = wishlist.ids.length
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSugg, setShowSugg] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const count = items.reduce((s, i) => s + i.qty, 0)

  useEffect(() => {
    const id = setTimeout(async () => {
      if (q.trim().length < 2) { setSuggestions([]); return }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      } catch { /* ignore */ }
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowSugg(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const doSearch = (term?: string) => {
    const query = (term ?? q).trim()
    if (!query) return
    setShowSugg(false)
    setQ(query)
    go(`/search/${encodeURIComponent(query)}`)
  }

  const onLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    toast({ description: t('logout') })
    go('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-border/70 shadow-[0_1px_20px_-12px_rgba(13,148,136,0.35)]">
      {/* promo strip (safe-top fills the iOS notch / status-bar area in standalone mode) */}
      <div className="bg-primary text-primary-foreground overflow-hidden safe-top">
        <div className="tp-marquee py-1.5 text-[11px] font-semibold whitespace-nowrap">
          {[0, 1].map((i) => (
            <span key={i} className="flex shrink-0">
              {[t('promo_1'), t('promo_2'), t('promo_3'), t('promo_4')].map((s, j) => (
                <span key={j} className="mx-6 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 opacity-80" /> {s}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-3 h-16">
          {/* logo */}
          <button onClick={() => go('/')} className="flex items-center gap-2.5 shrink-0 group" aria-label={t('a11y_home')}>
            <span className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-primary text-primary-foreground shadow-md group-hover:scale-105 transition-transform">
              <Cross className="w-5 h-5" strokeWidth={2.6} />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-none">
              <span className="font-black text-lg tracking-tight text-foreground">{t('brand')}</span>
              <span className="text-[10px] font-semibold text-primary/70">{t('tagline')}</span>
            </span>
          </button>

          {/* search */}
          <div ref={boxRef} className="relative flex-1 max-w-xl mx-auto hidden md:block">
            <form onSubmit={(e) => { e.preventDefault(); doSearch() }} className="relative">
              <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSugg(true) }}
                onFocus={() => setShowSugg(true)}
                placeholder={t('search_placeholder')}
                className="ps-10 pe-4 h-11 rounded-2xl bg-white border-border shadow-[0_1px_6px_rgba(16,40,55,0.06)] focus-visible:ring-primary/40 focus-visible:border-primary/50"
                aria-label={t('search_placeholder')}
              />
            </form>
            {showSugg && suggestions.length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-white rounded-2xl border shadow-xl overflow-hidden z-50">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setShowSugg(false); go(`/p/${s.slug}`) }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent/60 text-start transition-colors"
                  >
                    <span className="w-10 h-10 rounded-lg bg-muted/50 border border-border/40 overflow-hidden flex items-center justify-center shrink-0">
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt="" className="w-full h-full object-contain p-0.5" loading="lazy" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{lang === 'ar' ? s.nameAr : s.nameEn}</span>
                      <span className="block text-[11px] text-muted-foreground">{s.brand}</span>
                    </span>
                    <span className="text-xs font-bold text-primary shrink-0">{fmtPrice(s.price, lang)}</span>
                  </button>
                ))}
                <button
                  onClick={() => doSearch()}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-primary bg-accent/40 hover:bg-accent/70 border-t transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  {lang === 'ar' ? `عرض كل النتائج عن "${q}"` : `See all results for "${q}"`}
                </button>
              </div>
            )}
          </div>

          {/* actions */}
          <div className="flex items-center gap-1.5 ms-auto md:ms-0">
            <Button
              variant="ghost" size="icon"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-xl h-10 gap-1.5 px-3 text-xs font-bold"
              aria-label={t('a11y_toggle_lang')}
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </Button>

            {/* account */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl h-10" aria-label={t('account')}>
                  <User className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                {user ? (
                  <div className="flex flex-col gap-1">
                    <div className="px-3 py-2 border-b">
                      <p className="text-sm font-bold truncate">{user.name || user.email}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <button onClick={() => go('/orders')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-accent/60 text-sm font-medium transition-colors">
                      <Package className="w-4 h-4" /> {t('my_orders')}
                    </button>
                    <button onClick={() => go('/account')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-accent/60 text-sm font-medium transition-colors">
                      <User className="w-4 h-4" /> {t('account')}
                    </button>
                    {user.isAdmin && (
                      <button onClick={() => go('/admin')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-accent/60 text-sm font-medium text-primary transition-colors">
                        <LayoutDashboard className="w-4 h-4" /> {t('admin_panel')}
                      </button>
                    )}
                    <button onClick={onLogout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-red-50 text-sm font-medium text-red-600 transition-colors">
                      <LogOut className="w-4 h-4" /> {t('logout')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => go('/login')} className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      {t('login')}
                    </button>
                    <button onClick={() => go('/register')} className="w-full text-sm font-medium px-3 py-2.5 rounded-xl hover:bg-accent/60 transition-colors">
                      {t('register')}
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* wishlist */}
            <Button variant="ghost" size="icon" onClick={() => go('/wishlist')} className="relative rounded-xl h-10" aria-label={t('wishlist')}>
              <Heart className="w-5 h-5" />
              {wishCount > 0 && (
                <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1.5 text-[10px] font-bold bg-red-500 hover:bg-red-500 flex items-center justify-center">
                  {wishCount}
                </Badge>
              )}
            </Button>

            {/* cart */}
            <Button variant="ghost" size="icon" onClick={openCart} className="relative rounded-xl h-10" aria-label={t('cart')}>
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && (
                <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1.5 text-[10px] font-bold bg-red-500 hover:bg-red-500 flex items-center justify-center">
                  {count}
                </Badge>
              )}
            </Button>

            {/* mobile categories menu */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl h-10 md:hidden" aria-label={t('all_categories')}>
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-72 p-0">
                <SheetTitle className="sr-only">{t('all_categories')}</SheetTitle>
                <div className="p-4 border-b">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground">
                      <Cross className="w-4.5 h-4.5" strokeWidth={2.6} />
                    </span>
                    <span className="font-black">{t('brand')}</span>
                  </div>
                </div>
                <div className="overflow-y-auto h-[calc(100%-64px)] p-2">
                  <form
                    className="p-2"
                    onSubmit={(e) => { e.preventDefault(); setMenuOpen(false); doSearch((e.target as any).elements.q.value) }}
                  >
                    <Input name="q" placeholder={t('search_placeholder')} className="rounded-xl" />
                  </form>
                  {categories.map((c) => (
                    <button
                      key={c.slug}
                      onClick={() => { setMenuOpen(false); go(`/c/${c.slug}`) }}
                      className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/60 text-sm font-medium transition-colors"
                    >
                      <span>{lang === 'ar' ? c.nameAr : c.nameEn}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.productCount}</Badge>
                    </button>
                  ))}
                  <button onClick={() => { setMenuOpen(false); go('/prescription') }} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-accent/60 text-sm font-semibold text-primary transition-colors">
                    <Sparkles className="w-4 h-4" /> {t('ai_rx_title')}
                  </button>
                  <button onClick={() => { setMenuOpen(false); go('/assistant') }} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-accent/60 text-sm font-semibold text-primary transition-colors">
                    <Sparkles className="w-4 h-4" /> {t('ai_chat_title')}
                  </button>
                  <button onClick={() => { setMenuOpen(false); go('/interactions') }} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-accent/60 text-sm font-semibold text-primary transition-colors">
                    <Heart className="w-4 h-4" /> {t('ai_ddi_title')}
                  </button>
                  <div className="my-2 border-t" />
                  <InstallAppButton />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* mobile search */}
        <div className="md:hidden pb-3">
          <form onSubmit={(e) => { e.preventDefault(); doSearch() }} className="relative">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search_placeholder')}
              className="ps-10 pe-4 h-10 rounded-xl bg-muted/60"
              aria-label={t('search_placeholder')}
            />
          </form>
        </div>

        {/* desktop category nav */}
        <nav className="hidden md:flex items-center gap-0.5 pb-2 overflow-x-auto" aria-label={t('all_categories')}>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => go(`/c/${c.slug}`)}
              className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-muted-foreground hover:text-primary hover:bg-accent/60 whitespace-nowrap transition-colors"
            >
              {lang === 'ar' ? c.nameAr : c.nameEn}
            </button>
          ))}
          <span className="w-px h-4 bg-border mx-1.5" />
          <button
            onClick={() => go('/prescription')}
            className="px-3 py-1.5 rounded-full text-[13px] font-bold text-primary hover:bg-primary/10 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('ai_rx_title')}
          </button>
          <button
            onClick={() => go('/assistant')}
            className="px-3 py-1.5 rounded-full text-[13px] font-bold text-primary hover:bg-primary/10 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('ai_chat_title')}
          </button>
        </nav>
      </div>
    </header>
  )
}

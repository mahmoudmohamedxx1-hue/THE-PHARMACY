'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/lib/i18n'
import { trackEvent } from '@/lib/track'

export interface CartItem {
  productId: string
  slug: string
  nameEn: string
  nameAr: string
  price: number
  qty: number
  stock: number
  prescriptionRequired: boolean
  imageUrl?: string
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void
  remove: (productId: string) => void
  setQty: (productId: string, qty: number) => void
  clear: () => void
  open: () => void
  close: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      add: (item, qty = 1) => {
        // commerce analytics — fires wherever items are added (card / product page / cart)
        trackEvent('add_to_cart', { productId: item.slug, value: item.price * qty, name: item.nameEn })
        set((s) => {
          const existing = s.items.find((i) => i.productId === item.productId)
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, qty: Math.min(i.qty + qty, Math.max(1, item.stock), 20) }
                  : i
              ),
            }
          }
          return { items: [...s.items, { ...item, qty: Math.min(qty, Math.max(1, item.stock), 20) }] }
        })
      },
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      setQty: (productId, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.productId === productId ? { ...i, qty: Math.max(0, Math.min(qty, Math.min(i.stock, 20))) } : i))
            .filter((i) => i.qty > 0),
        })),
      clear: () => set({ items: [] }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
    }),
    { name: 'tp-cart' }
  )
)

interface WishlistState {
  ids: string[]
  toggle: (id: string) => boolean
  has: (id: string) => boolean
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const has = get().ids.includes(id)
        set((s) => ({ ids: has ? s.ids.filter((i) => i !== id) : [...s.ids, id] }))
        return !has
      },
      has: (id) => get().ids.includes(id),
    }),
    { name: 'tp-wishlist' }
  )
)

interface LangState {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({ lang: 'ar' as Lang, setLang: (l) => set({ lang: l }) }),
    { name: 'tp-lang' }
  )
)

interface RecentState {
  ids: string[]
  push: (id: string) => void
}

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      push: (id) => set((s) => ({ ids: [id, ...s.ids.filter((i) => i !== id)].slice(0, 10) })),
    }),
    { name: 'tp-recent' }
  )
)

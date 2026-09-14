'use client'
import type { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { CartDrawer } from './CartDrawer'
import { useCategories } from './hooks'

/**
 * App shell shared by every route: sticky header, main content and footer.
 * (The header applies iOS safe-area insets itself for standalone/PWA mode.)
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const { data: categories = [] } = useCategories()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header categories={categories} />
      <main className="flex-1 w-full">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  )
}

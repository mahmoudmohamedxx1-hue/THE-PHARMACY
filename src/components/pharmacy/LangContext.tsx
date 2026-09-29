'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLangStore } from '@/lib/store'
import type { Lang } from '@/lib/i18n'
import { t as translate, type TKey } from '@/lib/i18n'

export interface AuthUser {
  id: string; email: string; name: string | null; phone: string | null; isAdmin: boolean
  /** Real registration date (ISO) — powers the honest "Member since" display. */
  createdAt?: string
  /** True when the serverless deployment writes to ephemeral storage. */
  dbEphemeral?: boolean
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  refreshUser: () => Promise<void>
}

const Ctx = createContext<LangCtx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { lang, setLang: setStoreLang } = useLangStore()
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      setUser(data.user ? { ...data.user, dbEphemeral: data.dbEphemeral } : null)
    } catch {
      setUser(null)
    }
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { ...d.user, dbEphemeral: d.dbEphemeral } : null))
      .catch(() => setUser(null))
  }, [])

  return (
    <Ctx.Provider value={{
      lang,
      setLang: setStoreLang,
      t: (key: TKey) => translate(key, lang),
      user, setUser, refreshUser,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLang() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLang must be used within AppProvider')
  return ctx
}

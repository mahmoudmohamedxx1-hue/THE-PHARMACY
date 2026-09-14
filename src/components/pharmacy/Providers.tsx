'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { AppProvider } from './LangContext'
import { bindRouter, normalizePath } from '@/lib/router'
import { registerSW, initInstallPromptCapture } from '@/lib/pwa'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: fresh cache per request
    return makeQueryClient()
  }
  // Browser: reuse a single client across route changes
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  const router = useRouter()
  const didRedirect = useRef(false)

  // Expose the Next.js router to the imperative `go()` helper
  useEffect(() => {
    bindRouter((path, scroll) => router.push(path, { scroll: scroll !== false }))
    return () => bindRouter(() => {})
  }, [router])

  // Backward compatibility: redirect legacy hash URLs (#/p/x, #/c/x, ...)
  // to the new clean paths so previously shared links keep working.
  useEffect(() => {
    if (didRedirect.current) return
    didRedirect.current = true
    const hash = window.location.hash
    if (hash && hash.startsWith('#/') && hash.length > 2) {
      router.replace(normalizePath(hash))
    }
  }, [router])

  // PWA: register service worker + capture install prompt events
  useEffect(() => {
    registerSW()
    initInstallPromptCapture()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  )
}

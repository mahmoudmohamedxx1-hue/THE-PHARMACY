'use client'
// PWA helpers: service-worker registration, install-prompt capture and
// platform detection for the "Add to Home Screen" flow.
import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Subscribe to install-availability changes. Returns an unsubscribe fn. */
export function onInstallabilityChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function canInstall() {
  return deferredPrompt !== null
}

/** Native install prompt (Android / Chrome / Edge desktop). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  emit()
  return outcome
}

/** Wire up browser install events (called once from Providers). */
export function initInstallPromptCapture() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

/** Register the app-shell service worker. */
export function registerSW() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  const register = () =>
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* SW is a progressive enhancement — ignore failures */
    })
  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register, { once: true })
  }
}

/** True when running as an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** iOS Safari detection (incl. iPadOS 13+ which masquerades as macOS). */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iphone|ipad|ipod/i.test(ua) || ipadOS
}

/* ---- React hooks (browser-only values, SSR-safe via useSyncExternalStore) ---- */

const noopSubscribe = () => () => {}

/** True when the browser fired the native install prompt (Android/Chrome). */
export function useInstallable(): boolean {
  return useSyncExternalStore(onInstallabilityChange, canInstall, () => false)
}

/** True when running as an installed PWA (standalone display mode). */
export function useStandalone(): boolean {
  return useSyncExternalStore(noopSubscribe, isStandalone, () => false)
}

/** True on iPhone / iPad Safari. */
export function useIOS(): boolean {
  return useSyncExternalStore(noopSubscribe, isIOS, () => false)
}

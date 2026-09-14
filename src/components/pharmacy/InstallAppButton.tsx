'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Smartphone, Download, Share, PlusSquare, CheckCircle2, Compass } from 'lucide-react'
import { useLang } from './LangContext'
import { promptInstall, useInstallable, useStandalone, useIOS } from '@/lib/pwa'
import { useToast } from '@/hooks/use-toast'

/**
 * "Install App" button.
 * - Android/Chrome: triggers the native install prompt.
 * - iOS/Safari: opens step-by-step "Add to Home Screen" instructions.
 * - Hidden when already running as an installed app.
 */
export function InstallAppButton({ variant = 'menu' }: { variant?: 'menu' | 'footer' }) {
  const { t } = useLang()
  const { toast } = useToast()
  const installable = useInstallable()
  const standalone = useStandalone()
  const ios = useIOS()
  const [open, setOpen] = useState(false)

  // Already installed — hide the entry point entirely
  if (standalone) return null

  const onInstall = async () => {
    if (installable) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') toast({ description: t('install_success') })
    } else {
      setOpen(true)
    }
  }

  const steps = ios
    ? [
        { icon: Compass, text: t('install_ios_1') },
        { icon: Share, text: t('install_ios_2') },
        { icon: PlusSquare, text: t('install_ios_3') },
        { icon: CheckCircle2, text: t('install_ios_4') },
      ]
    : [
        { icon: Smartphone, text: t('install_app_sub') },
      ]

  if (variant === 'footer') {
    return (
      <>
        <button
          onClick={onInstall}
          className="inline-flex items-center gap-1.5 hover:text-primary transition-colors text-start"
        >
          <Smartphone className="w-4 h-4" /> {t('install_app')}
        </button>
        <InstallDialog open={open} onOpenChange={setOpen} steps={steps} ios={ios} onInstall={onInstall} />
      </>
    )
  }

  return (
    <>
      <button
        onClick={onInstall}
        className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-accent/60 text-sm font-semibold text-primary transition-colors"
      >
        <Download className="w-4 h-4" /> {t('install_app')}
      </button>
      <InstallDialog open={open} onOpenChange={setOpen} steps={steps} ios={ios} onInstall={onInstall} />
    </>
  )
}

function InstallDialog({
  open, onOpenChange, steps, ios, onInstall,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  steps: { icon: typeof Share; text: string }[]
  ios: boolean
  onInstall: () => void
}) {
  const { t } = useLang()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>{ios ? t('install_ios_h') : t('install_android_h')}</DialogTitle>
          <DialogDescription className="sr-only">{t('install_app_sub')}</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3 py-1">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <s.icon className="w-4 h-4" />
              </span>
              <span className="text-sm leading-relaxed pt-1.5">{s.text}</span>
            </li>
          ))}
        </ol>
        {!ios && (
          <Button onClick={onInstall} className="rounded-xl font-bold w-full">
            {t('install_now')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

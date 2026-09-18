'use client'
import { Cross, Mail, Phone, MapPin, Sparkles, Heart, ShieldCheck, MessageCircle } from 'lucide-react'
import { useLang } from './LangContext'
import { go } from '@/lib/router'
import { InstallAppButton } from './InstallAppButton'

// Real support channels are deployment-specific — expose them as build-time
// env vars so production never shows placeholder-looking numbers.
// Rows simply disappear when the value is unset (honest empty > fake number).
const SUPPORT_PHONE = (process.env.NEXT_PUBLIC_SUPPORT_PHONE || '').trim()
const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').trim()

export function Footer() {
  const { t, lang } = useLang()

  return (
    <footer className="mt-auto bg-foreground text-white/80 safe-bottom">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-primary text-primary-foreground">
              <Cross className="w-5 h-5" strokeWidth={2.6} />
            </span>
            <div className="leading-none">
              <p className="font-black text-lg text-white">{t('brand')}</p>
              <p className="text-[10px] font-semibold text-primary/80 mt-1">{t('tagline')}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-white/60">{t('footer_about')}</p>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>{t('trust_genuine_d')}</span>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">{t('quick_links')}</h3>
          <div className="flex flex-col gap-2.5 text-sm">
            <button onClick={() => go('/')} className="hover:text-primary transition-colors text-start">{lang === 'ar' ? 'الرئيسية' : 'Home'}</button>
            <button onClick={() => go('/prescription')} className="hover:text-primary transition-colors text-start">{t('ai_rx_title')}</button>
            <button onClick={() => go('/assistant')} className="hover:text-primary transition-colors text-start">{t('ai_chat_title')}</button>
            <button onClick={() => go('/interactions')} className="hover:text-primary transition-colors text-start">{t('ai_ddi_title')}</button>
            <button onClick={() => go('/orders')} className="hover:text-primary transition-colors text-start">{t('my_orders')}</button>
            <InstallAppButton variant="footer" />
          </div>
        </div>

        <div>
          <h3 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">{t('contact_us')}</h3>
          <div className="flex flex-col gap-3 text-sm text-white/70">
            {SUPPORT_PHONE && (
              <span className="flex items-center gap-2.5"><Phone className="w-4 h-4 text-primary" /> <span dir="ltr">{SUPPORT_PHONE}</span></span>
            )}
            <span className="flex items-center gap-2.5"><Mail className="w-4 h-4 text-primary" /> care@thepharmacy.com</span>
            <span className="flex items-center gap-2.5"><MapPin className="w-4 h-4 text-primary" /> {lang === 'ar' ? 'القاهرة، مصر' : 'Cairo, Egypt'}</span>
            {SUPPORT_WHATSAPP && (
              <span className="flex items-center gap-2.5"><MessageCircle className="w-4 h-4 text-primary" /> WhatsApp <span dir="ltr">{SUPPORT_WHATSAPP}</span></span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-white mb-1 text-sm uppercase tracking-wider">{t('trust_ai')}</h3>
          <div className="grid grid-cols-1 gap-2.5 text-sm text-white/70">
            <span className="flex items-center gap-2.5"><Sparkles className="w-4 h-4 text-primary" /> {t('ai_rx_desc')}</span>
            <span className="flex items-center gap-2.5"><Heart className="w-4 h-4 text-primary" /> {t('ai_ddi_desc')}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
          <span>© {new Date().getFullYear()} {t('brand')} — {t('rights')}</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {t('built_note')}</span>
        </div>
      </div>
    </footer>
  )
}

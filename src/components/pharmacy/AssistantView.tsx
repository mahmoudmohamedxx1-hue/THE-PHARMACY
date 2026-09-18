'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Sparkles, Send, Loader2, Cross, ShoppingCart, ShieldAlert } from 'lucide-react'
import { useLang } from './LangContext'
import { useCart } from '@/lib/store'
import { fmtPrice } from './ProductCard'
import { ProductImage } from './ProductImage'
import { go } from '@/lib/router'
import { useToast } from '@/hooks/use-toast'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  products?: any[]
}

const QUICK_EN = ['I have a headache', 'Vitamin D deficiency?', 'Best sunscreen for oily skin?', 'Baby diaper rash', 'I have a cough and sore throat']
const QUICK_AR = ['عندي صداع', 'نقص فيتامين د؟', 'أفضل واقي شمس للبشرة الدهنية؟', 'تسلخات الحفاض', 'عندي كحة والتهاب في الحلق']

export function AssistantView() {
  const { t, lang } = useLang()
  const add = useCart((s) => s.add)
  const { toast } = useToast()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages([{ role: 'assistant', content: t('chat_welcome') }])
  }, [lang])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m) => m.content !== t('chat_welcome')).map((m) => ({ role: m.role, content: m.content })),
          lang,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages([...next, { role: 'assistant', content: t('ai_error') }])
        return
      }
      setMessages([...next, { role: 'assistant', content: data.reply, products: data.products }])
    } catch {
      setMessages([...next, { role: 'assistant', content: t('error_generic') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 lg:px-6 py-8 pb-16 flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 420px)' }}>
      <div className="flex flex-col gap-2 text-center">
        <Badge className="w-fit mx-auto gap-1.5 bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20 px-3.5 py-1.5 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5 tp-pulse" /> {t('hero_badge')}
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('assistant_title')}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">{t('assistant_sub')}</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-[420px]">
        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 bg-muted/20">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 max-w-[88%] ${m.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}>
              {m.role === 'assistant' && (
                <Avatar className="w-9 h-9 bg-primary text-primary-foreground border-2 border-white shadow shrink-0">
                  <Cross className="w-4 h-4" strokeWidth={2.5} />
                </Avatar>
              )}
              <div className="flex flex-col gap-2.5">
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-ee-md' : 'bg-white border rounded-es-md'}`}>
                  {m.content}
                </div>
                {m.products && m.products.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{t('suggested_products')}</span>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {m.products.map((p: any) => (
                        <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border hover:border-primary/40 transition-colors">
                          <button onClick={() => go(`/p/${p.slug}`)} className="shrink-0" aria-label={t('a11y_view_product')}>
                            <ProductImage slug={p.slug} category="pill" brand={p.brand || ''} imageUrl={p.imageUrl} alt={lang === 'ar' ? p.nameAr : p.nameEn} className="w-14 h-14 rounded-lg" rounded="rounded-lg" sizes="56px" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <button onClick={() => go(`/p/${p.slug}`)} className="text-start">
                              <p className="text-xs font-bold line-clamp-1 hover:text-primary transition-colors">{lang === 'ar' ? p.nameAr : p.nameEn}</p>
                            </button>
                            <span className="text-xs font-black text-primary">{fmtPrice(p.price, lang)}</span>
                          </div>
                          <Button
                            size="icon"
                            className="w-8 h-8 rounded-lg shrink-0"
                            disabled={p.stock <= 0}
                            onClick={() => {
                              add({ productId: p.id, slug: p.slug, nameEn: p.nameEn, nameAr: p.nameAr, price: p.price, stock: p.stock, prescriptionRequired: p.prescriptionRequired, imageUrl: p.imageUrl })
                              toast({ description: t('added_to_cart') })
                            }}
                            aria-label={t('add_to_cart')}
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 self-start">
              <Avatar className="w-9 h-9 bg-primary text-primary-foreground border-2 border-white shadow shrink-0">
                <Cross className="w-4 h-4" strokeWidth={2.5} />
              </Avatar>
              <div className="bg-white border rounded-2xl rounded-es-md px-4 py-3.5 flex items-center gap-1.5 shadow-sm">
                <span className="tp-dot w-2 h-2 rounded-full bg-primary inline-block" />
                <span className="tp-dot w-2 h-2 rounded-full bg-primary inline-block" />
                <span className="tp-dot w-2 h-2 rounded-full bg-primary inline-block" />
              </div>
            </div>
          )}
        </div>

        {/* quick chips */}
        {messages.length <= 1 && (
          <div className="px-4 sm:px-6 py-2.5 flex gap-2 overflow-x-auto border-t bg-white">
            {(lang === 'ar' ? QUICK_AR : QUICK_EN).map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="shrink-0 px-3.5 py-1.5 rounded-full border text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send() }}
          className="p-3 sm:p-4 border-t bg-white flex gap-2.5"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('assistant_placeholder')}
            className="rounded-2xl h-11 flex-1"
            disabled={loading}
            aria-label={t('assistant_placeholder')}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} className="w-11 h-11 rounded-2xl shrink-0" aria-label={t('send')}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 flip-x rtl:rotate-180" />}
          </Button>
        </form>
      </Card>

      <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 text-center">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500" /> {t('assistant_disclaimer')}
      </p>
    </div>
  )
}

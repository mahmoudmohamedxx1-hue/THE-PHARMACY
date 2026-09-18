'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScanText, Upload, ImageIcon, Loader2, CheckCircle2, ShoppingCart, FileText, AlertTriangle, Sparkles, RotateCcw, Phone, MapPin } from 'lucide-react'
import { useLang } from './LangContext'
import { useCart } from '@/lib/store'
import { go } from '@/lib/router'
import { fmtPrice } from './ProductCard'
import { ProductImage } from './ProductImage'
import { useToast } from '@/hooks/use-toast'

interface Match {
  medicine: string; productId: string; nameEn: string; nameAr: string; price: number
  stock: number; confidence: number; prescriptionRequired: boolean; brand: string; slug: string
  imageUrl: string
}

interface RxResult {
  id: string; extractedText: string; medicines: string[]
  dosages: string; doctorNotes: string
  matches: Match[]; unmatched: string[]
}

export function PrescriptionView() {
  const { t, lang, user } = useLang()
  const add = useCart((s) => s.add)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState('')
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RxResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(lang === 'ar' ? 'اختر صورة' : 'Please select an image file')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(lang === 'ar' ? 'حجم الصورة أكبر من 8 ميجابايت' : 'Image is larger than 8MB')
      return
    }
    setError('')
    // downscale for speed
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setPreview(dataUrl)
        setResult(null)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const analyze = async () => {
    if (!preview) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: preview, phone, address }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error === 'ai_error' ? t('ai_error') : t('error_generic'))
        return
      }
      setResult(data)
    } catch {
      setError(t('error_generic'))
    } finally {
      setLoading(false)
    }
  }

  const addAll = () => {
    if (!result) return
    let added = 0
    for (const m of result.matches) {
      if (m.stock > 0) {
        add({
          productId: m.productId, slug: m.slug, nameEn: m.nameEn, nameAr: m.nameAr,
          price: m.price, stock: m.stock, prescriptionRequired: m.prescriptionRequired,
          imageUrl: m.imageUrl,
        })
        added++
      }
    }
    toast({ description: `${added} ${lang === 'ar' ? 'منتج أُضيف للعربة' : 'items added to cart'}` })
    go('/checkout')
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 lg:px-6 py-8 pb-16">
      <div className="flex flex-col gap-2 mb-8 text-center">
        <Badge className="w-fit mx-auto gap-1.5 bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20 px-3.5 py-1.5 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5 tp-pulse" /> {t('hero_badge')}
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('rx_title')}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">{t('rx_sub')}</p>
      </div>

      {/* upload zone */}
      {!result && (
        <Card className="p-6 sm:p-8 flex flex-col gap-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f) }}
            className={`relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed p-10 cursor-pointer transition-all ${dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-accent/40'}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            />
            {preview ? (
              <div className="relative w-full max-w-sm">
                <img src={preview} alt="Prescription preview" className="w-full rounded-2xl border shadow-lg" />
                {loading && (
                  <div className="absolute inset-0 rounded-2xl bg-foreground/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-white">
                    <ScanText className="w-10 h-10 animate-pulse" />
                    <p className="font-bold text-sm">{t('rx_reading')}</p>
                    <div className="w-48">
                      <Progress value={70} className="h-1.5 bg-white/20" />
                    </div>
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute -top-3 -end-3 rounded-full w-9 h-9 shadow-lg"
                  onClick={(e) => { e.stopPropagation(); setPreview(''); setResult(null) }}
                  aria-label={t('a11y_remove')}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <span className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
                  <Upload className="w-7 h-7" />
                </span>
                <div className="text-center">
                  <p className="font-bold">{t('rx_drop')}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" /> {t('rx_formats')}
                  </p>
                </div>
              </>
            )}
          </div>

          {preview && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rx-phone" className="text-sm font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-primary" /> {t('phone')}
                  </Label>
                  <Input id="rx-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="rounded-xl h-11" placeholder="01012345678" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rx-address" className="text-sm font-semibold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" /> {t('address')}
                  </Label>
                  <Input id="rx-address" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-xl h-11" placeholder={t('address_hint')} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('rx_contact_info')}</p>

              {error && <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

              <Button size="lg" onClick={analyze} disabled={loading} className="h-13 rounded-2xl text-base font-bold gap-2 shadow-lg shadow-primary/25 py-3.5">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanText className="w-5 h-5" />}
                {loading ? t('rx_reading') : t('rx_upload_btn')}
              </Button>
            </>
          )}
          {!preview && error && <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-center">{error}</p>}
        </Card>
      )}

      {/* results */}
      {result && (
        <div className="flex flex-col gap-6">
          {/* detected medicines */}
          <Card className="p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </span>
              <h2 className="font-black text-lg">{t('rx_detected')}</h2>
              <Badge variant="secondary" className="ms-auto font-bold">{result.medicines.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.medicines.map((m, i) => (
                <Badge key={i} variant="outline" className="gap-1.5 font-semibold py-1.5 px-3">
                  <FileText className="w-3.5 h-3.5 text-primary" /> {m}
                </Badge>
              ))}
            </div>
            {result.dosages && result.dosages.toLowerCase() !== 'n/a' && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-3.5 leading-relaxed">{result.dosages}</p>
            )}
            {result.doctorNotes && result.doctorNotes.toLowerCase() !== 'n/a' && (
              <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <span className="font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                  <FileText className="w-4 h-4" /> {t('rx_doctor_notes')}
                </span>
                <p className="text-amber-900/80 leading-relaxed">{result.doctorNotes}</p>
              </div>
            )}
          </Card>

          {/* matched products */}
          {result.matches.length > 0 && (
            <Card className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5" />
                  </span>
                  <h2 className="font-black text-lg">{t('rx_matched')}</h2>
                </div>
                <Button onClick={addAll} className="rounded-xl font-bold gap-2">
                  <ShoppingCart className="w-4 h-4" /> {t('rx_add_all')}
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3.5">
                {result.matches.map((m) => (
                  <div key={m.productId} className="flex gap-3.5 p-3.5 rounded-2xl border hover:border-primary/40 transition-colors">
                    <ProductImage slug={m.slug} category="medications" brand={m.brand} imageUrl={m.imageUrl} alt={lang === 'ar' ? m.nameAr : m.nameEn} className="w-20 h-20 shrink-0 rounded-xl border-border/50" rounded="rounded-xl" sizes="80px" />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <button onClick={() => go(`/p/${m.slug}`)} className="text-start">
                        <p className="text-sm font-bold line-clamp-2 hover:text-primary transition-colors">{lang === 'ar' ? m.nameAr : m.nameEn}</p>
                      </button>
                      <p className="text-xs text-muted-foreground">{m.brand}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-primary">{fmtPrice(m.price, lang)}</span>
                        <Badge variant="secondary" className="text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          {Math.round(m.confidence * 100)}% {t('rx_confidence')}
                        </Badge>
                        {m.stock === 0 && <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600 hover:bg-red-50">{t('out_of_stock')}</Badge>}
                      </div>
                      <Button
                        size="sm"
                        variant={m.stock > 0 ? 'default' : 'outline'}
                        disabled={m.stock === 0}
                        onClick={() => {
                          add({
                            productId: m.productId, slug: m.slug, nameEn: m.nameEn, nameAr: m.nameAr,
                            price: m.price, stock: m.stock, prescriptionRequired: m.prescriptionRequired,
                            imageUrl: m.imageUrl,
                          })
                          toast({ description: lang === 'ar' ? 'تمت الإضافة للعربة' : 'Added to cart' })
                        }}
                        className="mt-auto w-fit rounded-lg h-8 text-xs font-bold gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" /> {t('add_to_cart')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* unmatched */}
          {result.unmatched.length > 0 && (
            <Card className="p-6 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <h2 className="font-black text-lg">{t('rx_unmatched')}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.unmatched.map((u, i) => (
                  <Badge key={i} variant="outline" className="font-semibold py-1.5 px-3 border-amber-200 bg-amber-50/50 text-amber-800">{u}</Badge>
                ))}
              </div>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setResult(null); setPreview('') }} className="rounded-xl font-bold gap-2">
              <RotateCcw className="w-4 h-4" /> {lang === 'ar' ? 'روشتة أخرى' : 'Another prescription'}
            </Button>
            <Button onClick={() => go('/checkout')} variant="secondary" className="rounded-xl font-bold">{t('checkout')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

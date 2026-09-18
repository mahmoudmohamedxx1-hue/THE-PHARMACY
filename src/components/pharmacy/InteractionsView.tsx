'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Pill, Plus, X, Loader2, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, Info } from 'lucide-react'
import { useLang } from './LangContext'
import { useToast } from '@/hooks/use-toast'

interface Interaction {
  drugs: string[]; severity: string; effect: string; recommendation: string
}
interface Analysis {
  overallRisk: string; summary: string; interactions: Interaction[]
  generalAdvice: string[]; disclaimer: string
}

const RISK_STYLE: Record<string, { icon: any; classes: string; badge: string }> = {
  low: { icon: ShieldCheck, classes: 'bg-emerald-50 border-emerald-200 text-emerald-800', badge: 'bg-emerald-500' },
  moderate: { icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-amber-800', badge: 'bg-amber-500' },
  high: { icon: ShieldX, classes: 'bg-red-50 border-red-200 text-red-800', badge: 'bg-red-500' },
}

const SEVERITY_STYLE: Record<string, string> = {
  minor: 'bg-sky-100 text-sky-800 border-sky-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  major: 'bg-red-100 text-red-700 border-red-200',
  contraindicated: 'bg-red-600 text-white border-red-700',
}

export function InteractionsView() {
  const { t, lang } = useLang()
  const { toast } = useToast()
  const [meds, setMeds] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState('')

  const addMed = () => {
    const v = input.trim()
    if (!v) return
    if (meds.length >= 10) { toast({ description: lang === 'ar' ? 'الحد الأقصى 10 أدوية' : 'Max 10 medicines' }); return }
    if (meds.some((m) => m.toLowerCase() === v.toLowerCase())) { setInput(''); return }
    setMeds([...meds, v]); setInput(''); setAnalysis(null)
  }

  const analyze = async () => {
    if (meds.length < 2) { setError(t('ddi_need_two')); return }
    setError(''); setLoading(true); setAnalysis(null)
    try {
      const res = await fetch('/api/ai/interactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicines: meds, lang }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error === 'need_two' ? t('ddi_need_two') : t('ai_error')); return }
      setAnalysis(data.analysis)
    } catch {
      setError(t('error_generic'))
    } finally {
      setLoading(false)
    }
  }

  const risk = analysis ? (RISK_STYLE[analysis.overallRisk] || RISK_STYLE.moderate) : null
  const RiskIcon = risk?.icon

  return (
    <div className="max-w-3xl mx-auto w-full px-4 lg:px-6 py-8 pb-16 flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <Badge className="w-fit mx-auto gap-1.5 bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20 px-3.5 py-1.5 text-xs font-bold">
          <ShieldAlert className="w-3.5 h-3.5 tp-pulse" /> {t('hero_badge')}
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('ddi_title')}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">{t('ddi_sub')}</p>
      </div>

      {/* input area */}
      <Card className="p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Pill className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMed() } }}
              placeholder={t('ddi_placeholder')}
              className="ps-10 rounded-xl h-11"
              aria-label={t('ddi_add_med')}
            />
          </div>
          <Button onClick={addMed} variant="outline" className="rounded-xl h-11 gap-1.5 font-bold">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('ddi_add_med')}</span>
          </Button>
        </div>

        {meds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {meds.map((m, i) => (
              <Badge key={i} variant="secondary" className="gap-1.5 py-1.5 px-3 text-sm font-semibold">
                <Pill className="w-3.5 h-3.5 text-primary" />
                {m}
                <button onClick={() => { setMeds(meds.filter((_, j) => j !== i)); setAnalysis(null) }} aria-label={t('a11y_remove')} className="hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {error && <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

        <Button
          size="lg"
          onClick={analyze}
          disabled={loading || meds.length < 2}
          className="h-12 rounded-2xl text-base font-bold gap-2 shadow-lg shadow-primary/20"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
          {loading ? t('ddi_analyzing') : t('ddi_analyze')}
        </Button>
      </Card>

      {/* results */}
      {loading && (
        <Card className="p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-bold text-sm text-muted-foreground">{t('ddi_analyzing')}</p>
        </Card>
      )}

      {analysis && risk && RiskIcon && (
        <div className="flex flex-col gap-5">
          {/* overall risk */}
          <div className={`rounded-3xl border-2 p-6 flex items-center gap-4 ${risk.classes}`}>
            <span className="w-14 h-14 rounded-2xl bg-white/70 flex items-center justify-center shrink-0">
              <RiskIcon className="w-7 h-7" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                {analysis.overallRisk === 'low' ? t('ddi_risk_low') : analysis.overallRisk === 'moderate' ? t('ddi_risk_moderate') : t('ddi_risk_high')}
              </p>
              <p className="font-bold leading-relaxed mt-1">{analysis.summary}</p>
            </div>
          </div>

          {/* interactions */}
          {analysis.interactions.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="font-black text-lg">{t('ddi_between')} {meds.length} {lang === 'ar' ? 'أدوية' : 'medicines'}</h2>
              {analysis.interactions.map((inter, i) => (
                <Card key={i} className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {inter.drugs.map((d, j) => (
                        <span key={j} className="flex items-center gap-2">
                          {j > 0 && <X className="w-3.5 h-3.5 text-red-400" />}
                          <Badge variant="outline" className="font-semibold py-1 px-2.5">{d}</Badge>
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className={`font-bold shrink-0 ${SEVERITY_STYLE[inter.severity?.toLowerCase()] || SEVERITY_STYLE.moderate}`}>
                      {t(`ddi_severity_${inter.severity?.toLowerCase()}` as any) || inter.severity}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed">{inter.effect}</p>
                  {inter.recommendation && (
                    <p className="text-sm bg-primary/5 border border-primary/20 rounded-xl p-3.5 leading-relaxed flex gap-2.5">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{inter.recommendation}</span>
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* general advice */}
          {analysis.generalAdvice?.length > 0 && (
            <Card className="p-5 flex flex-col gap-2.5">
              <h3 className="font-black">{t('ddi_advice')}</h3>
              <ul className="flex flex-col gap-2">
                {analysis.generalAdvice.map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {a}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">{analysis.disclaimer}</p>
        </div>
      )}
    </div>
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { getZAI, aiUnavailablePayload } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const { medicines, lang } = await req.json()
    const meds = (Array.isArray(medicines) ? medicines : [medicines])
      .map((m: any) => String(m || '').trim())
      .filter(Boolean)
      .slice(0, 10)
    if (meds.length < 2) {
      return NextResponse.json({ error: 'need_two' }, { status: 400 })
    }
    const isArabic = lang === 'ar'

    const system = isArabic
      ? `أنت صيدلي إكلينيكي خبير متخصص في التفاعلات الدوائية. حلل قائمة الأدوية المقدمة ورد بـ JSON صالح فقط (بدون أي نص إضافي) بالبنية التالية:
{
 "overallRisk": "low" | "moderate" | "high",
 "summary": "ملخص بالعربية من 2-3 جمل",
 "interactions": [
   {"drugs": ["دواء1", "دواء2"], "severity": "minor"|"moderate"|"major"|"contraindicated", "effect": "وصف التفاعل بالعربية", "recommendation": "التوصية بالعربية"}
 ],
 "generalAdvice": ["نصيحة 1", "نصيحة 2"],
 "disclaimer": "هذا التحليل إرشادي ولا يغني عن استشارة الطبيب أو الصيدلي."
}
إذا لم توجد تفاعلات معروفة، أعد مصفوفة interactions فارغة و overallRisk = "low".`
      : `You are an expert clinical pharmacist specializing in drug-drug interactions. Analyze the given medication list and respond with VALID JSON ONLY (no extra text) following this structure:
{
 "overallRisk": "low" | "moderate" | "high",
 "summary": "2-3 sentence summary in English",
 "interactions": [
   {"drugs": ["drug1", "drug2"], "severity": "minor"|"moderate"|"major"|"contraindicated", "effect": "description of the interaction", "recommendation": "clinical recommendation"}
 ],
 "generalAdvice": ["advice 1", "advice 2"],
 "disclaimer": "This analysis is informational and does not replace consulting your doctor or pharmacist."
}
If no known interactions exist, return an empty interactions array and overallRisk "low".`

    const zai = await getZAI()
    if (!zai) return NextResponse.json(aiUnavailablePayload(lang), { status: 503 })
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: `Medications to analyze: ${meds.join(', ')}` },
      ],
      thinking: { type: 'disabled' },
    })
    let raw = completion.choices[0]?.message?.content || ''
    // strip possible markdown fences
    raw = raw.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim()

    let analysis: any = null
    try {
      analysis = JSON.parse(raw)
    } catch {
      // attempt to extract a JSON object
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
      if (s !== -1 && e > s) {
        try { analysis = JSON.parse(raw.slice(s, e + 1)) } catch { /* leave null */ }
      }
    }
    if (!analysis) {
      return NextResponse.json({ error: 'parse_error', raw: raw.slice(0, 500) }, { status: 502 })
    }
    return NextResponse.json({ analysis, medicines: meds })
  } catch (e: any) {
    console.error('interactions error', e)
    return NextResponse.json({ error: 'ai_error', message: String(e?.message || e).slice(0, 300) }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(req: NextRequest) {
  try {
    const { messages, lang } = await req.json()
    const history = Array.isArray(messages) ? messages.slice(-12) : []
    if (!history.length) return NextResponse.json({ error: 'no_messages' }, { status: 400 })
    const isArabic = lang === 'ar'

    // give the model a live snapshot of relevant catalog products
    const q = String(history[history.length - 1]?.content || '')
    const keywords = q.toLowerCase().split(/\s+/).filter((t) => t.length > 3).slice(0, 5)
    const products = await db.product.findMany({
      where: keywords.length
        ? { OR: keywords.flatMap((k) => [{ nameEn: { contains: k } }, { nameAr: { contains: k } }]) }
        : { isFeatured: true },
      take: 20, orderBy: { popularity: 'desc' },
      select: { nameEn: true, nameAr: true, brand: true, price: true, stock: true },
    })
    const fallback = products.length ? products : await db.product.findMany({
      take: 20, orderBy: { popularity: 'desc' },
      select: { nameEn: true, nameAr: true, brand: true, price: true, stock: true },
    })
    const catalog = fallback.map((p) => `- ${p.nameEn} | ${p.nameAr} | ${p.brand} | ${p.price} EGP`).join('\n')

    const system = isArabic
      ? `أنت "مساعد ذا فارميسي"، صيدلي افتراضي ودود لموقع صيدلية أونلاين في مصر. مهمتك: ساعد المستخدم في اختيار المنتجات المناسبة من الكاتالوج أدناه فقط، وقدم نصائح صحية عامة آمنة.
قواعد صارمة:
1) لا تشخص أمراضاً ولا تصف أدوية بروشتة (تذكره بسؤال الصيدلي أو رفع الروشتة).
2) في نهاية ردك اذكر قائمة المنتجات المقترحة من الكاتالوج فقط، بالتنسيق:
PRODUCTS: اسم المنتج 1; اسم المنتج 2
3) رد مختصر وودود بالعربية العامية المفهومة (max 6 جمل).
4) للحالات الطارئة أخبره بالتوجه للطوارئ فوراً.
الكاتالوج المتاح:
${catalog}`
      : `You are "The Pharmacy Assistant", a friendly virtual pharmacist for an Egyptian online pharmacy. Help the user pick suitable products ONLY from the catalog below and give safe general health tips.
Strict rules:
1) Never diagnose or prescribe prescription medicines - refer to our pharmacist or prescription upload.
2) End your reply with suggested catalog products in EXACT format:
PRODUCTS: Product Name 1; Product Name 2
3) Keep replies concise and friendly (max 6 sentences).
4) For emergencies, tell the user to seek immediate medical care.
Available catalog:
${catalog}`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        ...history.map((m: { role?: string; content?: string }) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: String(m.content || '').slice(0, 2000),
        })),
      ],
      thinking: { type: 'disabled' },
    })
    let reply = completion.choices[0]?.message?.content || ''

    // parse PRODUCTS: line
    let suggested: string[] = []
    const m = reply.match(/PRODUCTS:\s*(.+)/i)
    if (m) {
      suggested = m[1].split(/[;,\n]/).map((s) => s.replace(/^[-*\d\.\)\s]+/, '').trim()).filter((s) => s.length > 2).slice(0, 6)
      reply = reply.replace(m[0], '').trim()
    }

    // attach product cards for suggestions
    let products_out: any[] = []
    if (suggested.length) {
      const found = await db.product.findMany({
        where: { OR: suggested.flatMap((s) => [{ nameEn: { contains: s } }, { nameAr: { contains: s } }]) },
        take: 12,
      })
      // keep order of suggestions, dedupe
      const byName = new Map<string, any>()
      for (const p of found) {
        byName.set(p.nameEn.toLowerCase(), p)
        byName.set(p.nameAr, p)
      }
      products_out = suggested
        .map((s) => byName.get(s.toLowerCase()) || found.find((p) => p.nameEn.toLowerCase().includes(s.toLowerCase()) || p.nameAr.includes(s)))
        .filter((p, i, arr) => p && arr.findIndex((x) => x && x.id === p.id) === i)
        .slice(0, 6)
    }

    return NextResponse.json({ reply, products: products_out })
  } catch (e: any) {
    console.error('assistant error', e)
    return NextResponse.json({ error: 'ai_error', message: String(e?.message || e).slice(0, 300) }, { status: 502 })
  }
}

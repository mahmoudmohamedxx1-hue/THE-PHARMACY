import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

// ---- fuzzy medicine-to-product matching ----
function norm(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['the', 'and', 'for', 'with', 'mg', 'mcg', 'ml', 'g'].includes(t))
}

function score(medicineTokens: string[], nameTokens: string[]): number {
  if (!medicineTokens.length || !nameTokens.length) return 0
  let hits = 0
  for (const t of medicineTokens) {
    if (nameTokens.some((n) => n === t || (n.length > 4 && t.startsWith(n)) || (t.length > 4 && n.startsWith(t)))) hits++
  }
  return hits / medicineTokens.length
}

async function matchMedicines(names: string[]) {
  const meds = names.map((n) => n.trim()).filter((n) => n.length > 2).slice(0, 12)
  if (!meds.length) return []
  const products = await db.product.findMany({
    where: { OR: meds.flatMap((m) => [{ nameEn: { contains: m } }, { nameAr: { contains: m } }, { brand: { contains: m } }]) },
    take: 200,
  })
  const all = products.length >= 6 ? products : await db.product.findMany({ take: 500, orderBy: { popularity: 'desc' } })

  const results: { medicine: string; productId: string; nameEn: string; nameAr: string; price: number; stock: number; confidence: number; prescriptionRequired: boolean; brand: string; slug: string; imageUrl: string }[] = []
  for (const med of meds) {
    const mt = norm(med)
    let best: (typeof all)[0] | null = null
    let bestScore = 0
    for (const p of all) {
      const s = Math.max(score(mt, norm(p.nameEn)), score(mt, norm(p.brand + ' ' + p.nameEn)))
      if (s > bestScore) { bestScore = s; best = p }
    }
    if (best && bestScore >= 0.5) {
      results.push({
        medicine: med, productId: best.id, nameEn: best.nameEn, nameAr: best.nameAr,
        price: best.price, stock: best.stock, confidence: Math.round(Math.min(0.99, bestScore + 0.15) * 100) / 100,
        prescriptionRequired: best.prescriptionRequired, brand: best.brand, slug: best.slug, imageUrl: best.imageUrl,
      })
    }
  }
  return results
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    const { image, address, phone, notes } = await req.json()
    const dataUrl = String(image || '')
    if (!dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'invalid_image' }, { status: 400 })
    }
    if (dataUrl.length > 8_000_000) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 })
    }

    // 1) VLM reads the prescription
    const zai = await ZAI.create()
    // SDK type demands `model`, but the vision endpoint selects its default
    // vision model when the field is omitted (verified working in E2E) —
    // cast keeps the wire payload identical to production behavior.
    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'You are a pharmacist assistant reading a prescription image. Extract ALL medication names with their dosage and frequency if visible. Respond in this exact format (plain text, no extra commentary):\nMEDICATIONS: name1; name2; name3\nDOSAGES: dose info per medication separated by ;\nNOTES: any doctor instructions or patient details visible',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    } as Parameters<typeof zai.chat.completions.createVision>[0])
    const extracted = completion.choices[0]?.message?.content || ''

    // 2) parse medication names
    const medsLine = extracted.split('\n').find((l) => l.toLowerCase().startsWith('medications:')) || ''
    const names = medsLine.replace(/^medications:/i, '').split(/[;,\n]/).map((s) => s.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean)
    const dosagesLine = extracted.split('\n').find((l) => l.toLowerCase().startsWith('dosages:')) || ''
    const notesLine = extracted.split('\n').find((l) => l.toLowerCase().startsWith('notes:')) || ''

    // 3) match against catalog
    const matches = await matchMedicines(names)

    // 4) persist
    const record = await db.prescription.create({
      data: {
        userId: user?.id || null,
        imageData: dataUrl,
        extractedText: extracted.slice(0, 4000),
        detectedMedicines: JSON.stringify(matches.map((m) => m.medicine)),
        status: 'submitted',
        address: String(address || '').slice(0, 300),
        phone: String(phone || '').slice(0, 20),
        notes: String(notes || '').slice(0, 500),
      },
    })

    return NextResponse.json({
      id: record.id,
      extractedText: extracted,
      medicines: names,
      dosages: dosagesLine.replace(/^dosages:/i, '').trim(),
      doctorNotes: notesLine.replace(/^notes:/i, '').trim(),
      matches,
      unmatched: names.filter((n) => !matches.some((m) => m.medicine === n)),
    })
  } catch (e: any) {
    console.error('prescription OCR error', e)
    return NextResponse.json({ error: 'ai_error', message: String(e?.message || e).slice(0, 300) }, { status: 502 })
  }
}

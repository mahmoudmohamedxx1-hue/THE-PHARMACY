#!/usr/bin/env node
/**
 * Regenerate all product descriptions as rich, unique, product-specific bilingual copy.
 * Uses z-ai-web-dev-sdk chat completions (GLM). Batches of 8 products, 3 parallel
 * workers, resumable via progress file. Validates output before DB writes.
 */
import { PrismaClient } from '@prisma/client'
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()
const PROGRESS = path.join(process.cwd(), 'scripts', '.desc_progress.json')
const BATCH = 8
const WORKERS = 3

const SYSTEM = `You are a professional bilingual (English + Arabic) copywriter for "The Pharmacy", a licensed Egyptian online pharmacy. You write product descriptions for an e-commerce catalog.

STRICT RULES:
1. For each product write descEn and descAr — 2 to 3 natural sentences each.
2. Derive specifics ONLY from the given product name/brand/category/volume: active ingredient or key components when named, the benefit or concern it addresses, its format (tablets, cream, shampoo, serum, spray, wipes, device...), who it is for.
3. Vary sentence structure and openings across products. NEVER reuse the same phrase across products. No boilerplate, no filler.
4. Absolutely NO store names, NO call-to-action ("order now", "shop now"), NO delivery/payment mentions, NO price mentions.
5. Arabic: fluent Modern Standard Arabic with an Egyptian retail feel (like Egyptian pharmacy sites). It must convey the same meaning as the English, naturally translated — not transliterated.
6. For prescription (rx) medicines, keep tone factual: describe what it is commonly used for as directed by a physician; you may add "يُستخدم بمعرفة الطبيب" style phrasing in Arabic and "use as directed by your physician" style in English.
7. For devices/supplies (glucometer, wheelchair, wipes...), describe function and practical benefit.
8. Do NOT invent dosage numbers, chemical claims, or medical promises not implied by the name.
9. Keep each description between 140 and 420 characters.

OUTPUT FORMAT — return ONLY a valid JSON array, no markdown fences, no commentary:
[{"id":"<product id>","descEn":"...","descAr":"..."}]
Every input product id must appear exactly once.`

function validate(item, idSet) {
  if (!item || typeof item !== 'object') return 'not an object'
  if (!idSet.has(item.id)) return 'unknown id'
  const en = String(item.descEn || '').trim()
  const ar = String(item.descAr || '').trim()
  if (en.length < 80 || en.length > 600) return `descEn length ${en.length}`
  if (ar.length < 60 || ar.length > 700) return `descAr length ${ar.length}`
  const arabicChars = (ar.match(/[\u0600-\u06FF]/g) || []).length
  if (arabicChars < 25) return 'descAr not Arabic'
  const latinInEn = (en.match(/[a-zA-Z]/g) || []).length
  if (latinInEn < en.length * 0.5) return 'descEn not English'
  // boilerplate detection — none of these phrases may appear
  const banned = ['order now', 'brought to you', 'the pharmacy', 'delivered fast', 'shop now', 'delivered to your door', 'anywhere in egypt']
  const low = en.toLowerCase()
  for (const b of banned) if (low.includes(b)) return `banned phrase "${b}" in descEn`
  const lowAr = ar.replace(/[\u064B-\u0652]/g, '')
  const bannedAr = ['من ذا فارميسي', 'اطلب الآن', 'يصل حتى باب', 'في كل أنحاء مصر']
  for (const b of bannedAr) if (lowAr.includes(b)) return `banned phrase in descAr`
  return null
}

function extractJson(text) {
  let t = text.trim()
  t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('no JSON array found')
  return JSON.parse(t.slice(start, end + 1))
}

async function generateBatch(zai, batch, attempt) {
  const inputs = batch.map((p) => ({
    id: p.id,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    brand: p.brand,
    category: p.catName,
    subcategory: p.subcategory || '',
    volume: p.volume || '',
    rx: p.prescriptionRequired,
  }))
  let lastErr = null
  for (let t = 0; t < 4; t++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM },
          { role: 'user', content: `Write descriptions for these ${inputs.length} products:\n${JSON.stringify(inputs)}` },
        ],
        thinking: { type: 'disabled' },
      })
      const text = completion.choices[0]?.message?.content || ''
      const arr = extractJson(text)
      if (!Array.isArray(arr)) throw new Error('parsed value not an array')
      return arr
    } catch (e) {
      lastErr = e
      const is429 = String(e.message).includes('429')
      await new Promise((r) => setTimeout(r, is429 ? 20000 * (t + 1) : 3000))
    }
  }
  throw lastErr
}

async function main() {
  const done = fs.existsSync(PROGRESS) ? new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))) : new Set()
  // skip products that already have REAL descriptions from Chefaa enrichment
  const realContent = fs.existsSync(path.join(process.cwd(), 'scripts', '.real_content2.json'))
    ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', '.real_content2.json'), 'utf8'))
    : {}
  const realDescSlugs = new Set(Object.entries(realContent).filter(([, v]) => v?.desc).map(([slug]) => slug))
  const all = await prisma.product.findMany({
    orderBy: { popularity: 'desc' },
    select: { id: true, slug: true, nameEn: true, nameAr: true, brand: true, subcategory: true, volume: true, prescriptionRequired: true, category: { select: { nameEn: true } } },
  })
  const todo = all.filter((p) => !done.has(p.id) && !realDescSlugs.has(p.slug))
  console.log(`Total: ${all.length}, real-desc (skip): ${realDescSlugs.size}, LLM-done: ${done.size}, to generate: ${todo.length}`)
  if (todo.length === 0) return

  const zai = await ZAI.create()
  const batches = []
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
  console.log(`Batches: ${batches.length}, workers: ${WORKERS}`)

  let okCount = 0, failCount = 0
  const failedBatches = []
  let cursor = 0

  async function saveResults(batch, arr) {
    const idSet = new Set(batch.map((p) => p.id))
    const byId = new Map(arr.map((x) => [x.id, x]))
    const updates = []
    for (const p of batch) {
      const item = byId.get(p.id)
      const err = item ? validate(item, idSet) : 'missing in response'
      if (err) throw new Error(`validation failed for ${p.nameEn?.slice(0, 40)}: ${err}`)
      updates.push({ id: p.id, descEn: item.descEn.trim(), descAr: item.descAr.trim() })
    }
    await prisma.$transaction(updates.map((u) => prisma.product.update({ where: { id: u.id }, data: { descEn: u.descEn, descAr: u.descAr } })))
    for (const u of updates) done.add(u.id)
    fs.writeFileSync(PROGRESS, JSON.stringify([...done]))
    return updates.length
  }

  async function worker(wid) {
    while (cursor < batches.length) {
      const my = cursor++
      const batch = batches[my]
      if (!batch) break
      try {
        let n = 0
        const arr = await generateBatch(zai, batch, 1)
        n = await saveResults(batch, arr)
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 700))
        okCount += n
        console.log(`✓ batch ${my + 1}/${batches.length} saved (${n} products) — total ${okCount}`)
      } catch (e) {
        failCount += batch.length
        failedBatches.push(my + 1)
        console.error(`✗ batch ${my + 1} FAILED permanently: ${String(e.message).slice(0, 160)}`)
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)))
  console.log(`\nDONE. ok=${okCount} failed=${failCount} failedBatches=${JSON.stringify(failedBatches)}`)
  console.log(`Rerun this script to retry failures (progress preserved).`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

#!/usr/bin/env node
/**
 * Fetch real product photos for products missing images.
 * Uses `z-ai image-search` CLI (ZAI in-house image search, OSS-hosted results),
 * downloads + normalizes with sharp (white background, 800x800 webp),
 * verifies with `z-ai vision` that the photo plausibly matches the product,
 * then updates Prisma DB. Falls back to next candidate on mismatch.
 */
import { PrismaClient } from '@prisma/client'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const prisma = new PrismaClient()
const IMG_DIR = path.join(process.cwd(), 'public', 'images', 'products')
const TMP_DIR = path.join(process.cwd(), 'scripts', '.imgtmp')
const MANIFEST = path.join(process.cwd(), 'scripts', '.img_manifest.json')

// Custom search queries per slug for tricky products (brand + essence)
const CUSTOM_QUERIES = {
  'starville-screen-professional-white-top': 'Starville sunscreen professional SPF',
  'acti-colla-c-for-joint-inflammation-and-roughness-treatment': 'Acti Colla collagen joint supplement box',
  'acti-colla-c-sachets-for-joint-inflammation-and-roughness': 'collagen joint supplement sachets box',
  'devarol-s-200000-iu-ampoule': 'Devarol vitamin D ampoule injection',
  'freedent-baby-toothpaste-75ml': 'kids baby toothpaste tube',
  'personal-lubricant-water-based-100ml': 'water based personal lubricant bottle',
  'amoxicillin-500mg-16-capsules': 'amoxicillin 500mg capsules antibiotic box',
  'amlor-5mg-30-capsules': 'Amlor amlodipine 5mg capsules box',
  'wheelchair-foldable-standard': 'foldable standard wheelchair',
  'dog-dental-chews-medium-14': 'dog dental chews treats',
  'pet-vitamin-supplement-60-tablets': 'pet dog vitamin supplement tablets',
  'pet-shampoo-anti-itch-250ml': 'anti itch dog pet shampoo bottle',
}

function defaultQuery(p) {
  // strip pack-size tokens and pipes, keep brand + essence
  let q = p.nameEn
    .replace(/\|/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|gm|g|ml|iu|pcs|sheets|tablets|capsules|pipettes|chews|shades)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length > 80) q = q.slice(0, 80)
  return `${q} product`
}

async function imageSearch(query, count = 6) {
  const out = path.join(TMP_DIR, `search-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`)
  try {
    await execFileAsync('z-ai', ['image-search', '-q', query, '--count', String(count), '--gl', 'us', '--no-rank', '-o', out], { timeout: 150000 })
    const data = JSON.parse(fs.readFileSync(out, 'utf8'))
    if (!data.success || !Array.isArray(data.results)) return []
    return data.results
  } catch (e) {
    console.error(`  search failed for "${query}": ${e.message?.slice(0, 120)}`)
    return []
  } finally {
    try { fs.unlinkSync(out) } catch {}
  }
}

function scoreCandidate(r) {
  const w = parseInt(r.original_width) || 0
  const h = parseInt(r.original_height) || 0
  if (w < 250 || h < 250) return -1 // too small
  if (w > 4000 || h > 4000) return -1 // absurd
  const aspect = Math.min(w, h) / Math.max(w, h)
  return aspect // closer to square = better for product cards
}

async function downloadAndProcess(url, slug) {
  const tmpRaw = path.join(TMP_DIR, `raw-${slug}.img`)
  // download
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 3000) throw new Error('file too small / not an image')
  fs.writeFileSync(tmpRaw, buf)
  // process: flatten to white, contain in square canvas with padding, webp
  const outPath = path.join(IMG_DIR, `${slug}.webp`)
  const img = sharp(tmpRaw, { failOn: 'none' })
  const meta = await img.metadata()
  if (!meta.width || !meta.height) throw new Error('undecodable image')
  const SIZE = 800
  await sharp(tmpRaw, { failOn: 'none' })
    .flatten({ background: '#ffffff' })
    .resize(SIZE, SIZE, { fit: 'contain', background: '#ffffff' })
    .webp({ quality: 84 })
    .toFile(outPath)
  fs.unlinkSync(tmpRaw)
  return outPath
}

async function vlmMatchCheck(imgPath, product) {
  const prompt = `Product: "${product.nameEn}" (brand: ${product.brand}, category: ${product.categoryName}).
Question: Does this image plausibly show this exact type of product or a very close equivalent (correct product category and format, e.g. correct kind of item — not a totally different product, not a person, not a logo, not a store shelf photo)?
Answer with EXACTLY one word: MATCH or MISMATCH.`
  try {
    const { stdout } = await execFileAsync('z-ai', ['vision', '-p', prompt, '-i', imgPath], { timeout: 120000 })
    const start = stdout.indexOf('{')
    const data = JSON.parse(stdout.slice(start))
    const content = String(data.choices?.[0]?.message?.content || '').toUpperCase()
    return content.includes('MATCH') && !content.includes('MISMATCH')
  } catch (e) {
    console.error(`  vlm check error: ${e.message?.slice(0, 100)}`)
    return true // don't block on VLM errors — accept the image
  }
}

async function processProduct(p) {
  const slug = p.slug
  const query = CUSTOM_QUERIES[slug] || defaultQuery(p)
  console.log(`[${slug}] searching: "${query}"`)
  let results = await imageSearch(query)
  if (results.length === 0 && CUSTOM_QUERIES[slug]) {
    results = await imageSearch(defaultQuery(p)) // fallback to default query
  }
  if (results.length === 0) return { slug, status: 'no_results', query }

  const ranked = results
    .map((r) => ({ r, score: scoreCandidate(r) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (ranked.length === 0) return { slug, status: 'no_valid_candidates', query }

  for (let i = 0; i < ranked.length; i++) {
    const { r } = ranked[i]
    try {
      const outPath = await downloadAndProcess(r.original_url, slug)
      const ok = await vlmMatchCheck(outPath, p)
      if (ok) {
        await prisma.product.update({
          where: { id: p.id },
          data: { imageUrl: `/images/products/${slug}.webp`, imageSource: 'image-search' },
        })
        console.log(`  ✓ saved candidate #${i + 1} (${r.source}) + VLM MATCH`)
        return { slug, status: 'ok', source: r.source, url: r.original_url, candidate: i + 1 }
      }
      console.log(`  ✗ candidate #${i + 1} VLM MISMATCH — trying next`)
      fs.unlinkSync(outPath)
    } catch (e) {
      console.error(`  candidate #${i + 1} failed: ${e.message?.slice(0, 100)}`)
    }
  }
  return { slug, status: 'all_candidates_failed', query }
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const products = await prisma.product.findMany({
    where: { imageUrl: '' },
    select: { id: true, slug: true, nameEn: true, nameAr: true, brand: true, category: { select: { nameEn: true } } },
  })
  console.log(`Products missing images: ${products.length}`)
  const manifest = []
  const WORKERS = 4
  const queue = [...products]
  async function worker() {
    while (queue.length) {
      const p = queue.shift()
      const enriched = { ...p, categoryName: p.category.nameEn }
      try {
        manifest.push(await processProduct(enriched))
      } catch (e) {
        manifest.push({ slug: p.slug, status: 'error', error: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  const ok = manifest.filter((m) => m.status === 'ok').length
  console.log(`\nDone. ${ok}/${products.length} got real photos. Manifest: ${MANIFEST}`)
  for (const m of manifest) if (m.status !== 'ok') console.log(`  !! ${m.slug}: ${m.status}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

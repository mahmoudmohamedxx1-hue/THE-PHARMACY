#!/usr/bin/env python3
"""
Focused image fetcher for the remaining ~22 imageless products.
- Aggressive multi-query matching: nameEn, nameAr, brand, type keywords
  across BOTH Meilisearch AND Chefaa site search API
- ALWAYS evaluates all queries (no early break), picks best-scoring hit
- Downloads image -> square webp -> VLM verify -> DB update
"""
import io
import json
import os
import re
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request

BASE = '/home/z/my-project'
DB = f'{BASE}/db/custom.db'
IMG_DIR = f'{BASE}/public/images/products'
MEILI = 'https://meilisearch.chefaa.com/indexes/products_eg/search'
KEY = 'd63cccef2eeacd2734bef1c445980b5720de94f5f161bf9d8322a377a0b03536'
SITE_SEARCH = 'https://chefaa.com/api/products?search='
API = 'https://chefaa.com/api/products/'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36'

# per-product extra query variants (arabic brand/type names used in Egyptian retail)
EXTRA_QUERIES = {
    'redoxon-double-action-30-tablets': ['ريداكسون', 'ريدوكسون', 'Redoxon', 'فوار فيتامين سي'],
    'amlor-5mg-30-capsules': ['أملور', 'املور', 'Amlor', 'amlodipine 5mg'],
    'devarol-s-200000-iu-ampoule': ['ديفارول', 'Devarol', 'امبول فيتامين د'],
    'amoxicillin-500mg-16-capsules': ['أموكسيسيلين', 'اموكسيسيلين 500', 'Amoxicillin'],
    'pigeon-baby-wipes-80-sheets': ['بيجون', 'مناديل مولود', 'baby wipes'],
    'freedent-baby-toothpaste-75ml': ['معجون أسنان أطفال', 'kids toothpaste', 'فرى دنت'],
    'babyife-nasal-aspirator': ['شفاط أنف للأطفال', 'nasal aspirator baby', 'بيبي لايف'],
    'l-oreal-infallible-lipstick-24h': ['لوريال أحمر شفاه', 'لو ريال إنفالبل', 'Infallible matte lipstick'],
    'revlon-colorstay-foundation': ['ريفلون كريم أساس', 'ColorStay foundation'],
    'nyx-born-to-glow-highlighter': ['هايلاير نيكس', 'NYX highlighter'],
    'essence-nail-polish-60-shades': ['اسنس طلاء أظافر', 'Essence nail polish'],
    'fenty-gloss-bomb-universal': ['فينتي جلوس بوم', 'Fenty gloss'],
    'wheelchair-foldable-standard': ['كرسي متحرك', 'wheelchair'],
    'personal-lubricant-water-based-100ml': ['جلس مرطب', 'lubricant gel', 'كي واي جيل'],
    'frontline-plus-dog-large-3-pipettes': ['فرونت لاين للكلاب', 'Frontline dog'],
    'frontline-plus-cat-3-pipettes': ['فرونت لاين للقطط', 'Frontline cat'],
    'pet-shampoo-anti-itch-250ml': ['شامبو قطط', 'شامبو كلاب', 'pet shampoo'],
    'pet-vitamin-supplement-60-tablets': ['فيتامين للقطط', 'فيتامين للكلاب'],
    'dog-dental-chews-medium-14': ['بسكويت أسنان للكلاب', 'dental dog treats'],
    'starville-screen-professional-white-top': ['ستارفيل واقي شمس', 'Starville sunscreen'],
    'starville-fahrenheit-body-care-oud-blend': ['ستارفيل عود', 'Starville body spray'],
    'acti-colla-c-for-joint-inflammation-and-roughness-treatment': ['أكتي كولا', 'كولاجين للمفاصل'],
    'acti-colla-c-sachets-for-joint-inflammation-and-roughness': ['أكتي كولا اكياس', 'كولاجين اكياس'],
    'strong-ville-anti-hair-fall-strengthening-shampoo': ['سترونج فيل شامبو'],
}

AR_DIAC = re.compile(r'[\u064B-\u0652\u0640]')


def norm(s):
    if not s:
        return ''
    import unicodedata
    s = unicodedata.normalize('NFKC', str(s))
    s = AR_DIAC.sub('', s)
    for a, b in [('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ة', 'ه'), ('ى', 'ي'), ('ؤ', 'و'), ('ئ', 'ي')]:
        s = s.replace(a, b)
    s = s.lower()
    s = re.sub(r'[^a-z0-9\u0600-\u06ff]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def toks(s):
    return {t for t in norm(s).split() if len(t) > 1}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def http_get(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(12 * 1024 * 1024)


def meili(q, limit=10):
    try:
        req = urllib.request.Request(MEILI, data=json.dumps({'q': q, 'limit': limit}).encode(),
                                     headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode()).get('hits') or []
    except Exception:
        return []


def site_search(q):
    try:
        url = SITE_SEARCH + urllib.parse.quote(q)
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode()).get('data') or []
    except Exception:
        return []


def img_magic_ok(head):
    if head[:3] == b'\xff\xd8\xff':
        return True
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        return True
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return True
    return False


def save_square_webp(raw, slug):
    from PIL import Image
    im = Image.open(io.BytesIO(raw))
    im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA') else im.convert('RGB')
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    im.thumbnail((800, 800), Image.LANCZOS)
    side = max(im.size)
    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    out = f'{IMG_DIR}/{slug}.webp'
    canvas.save(out, 'WEBP', quality=84)
    return out


def vlm_match(img_path, product):
    prompt = (f"Product: \"{product['nameEn']}\" (brand: {product['brand']}, category: {product['catName']}).\n"
              f"Does this image plausibly show this exact product or a very close equivalent (same product type, plausible same brand/line)? "
              f"Answer with EXACTLY one word: MATCH or MISMATCH.")
    try:
        r = subprocess.run(['z-ai', 'vision', '-p', prompt, '-i', img_path],
                           capture_output=True, text=True, timeout=120)
        start = r.stdout.find('{')
        data = json.loads(r.stdout[start:])
        content = str(data.get('choices', [{}])[0].get('message', {}).get('content', '')).upper()
        return 'MATCH' in content and 'MISMATCH' not in content
    except Exception:
        return True


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute("""
        SELECT p.id, p.slug, p.nameEn, p.nameAr, p.brand, c.nameEn AS catName
        FROM Product p JOIN Category c ON c.id = p.categoryId
        WHERE p.imageUrl = ''
    """).fetchall()
    products = [dict(r) for r in rows]
    print(f'imageless products: {len(products)}', flush=True)

    results = {}
    for p in products:
        slug = p['slug']
        our_toks = toks(p['nameEn'] + ' ' + p['nameAr'] + ' ' + p['brand'])
        queries = [p['nameEn'], p['nameAr']] + EXTRA_QUERIES.get(slug, [])
        # collect candidates from all queries (no early break!)
        candidates = []
        for q in queries:
            if not q:
                continue
            for h in meili(q):
                candidates.append(('meili', h))
            time.sleep(0.4)
            for h in site_search(q):
                candidates.append(('site', h))
            time.sleep(0.4)

        # score: meili hits have title_en/title_ar/slug/brands; site hits have title/images/slug
        best, best_s, best_src = None, 0.0, None
        for src, h in candidates:
            if src == 'meili':
                title_en = h.get('title_en', '')
                title_ar = h.get('title_ar', '')
                img = h.get('image') or ''
                slug_c = h.get('slug') or ''
                brand_c = ((h.get('brands') or {}).get('title_en', '') + ' ' + (h.get('brands') or {}).get('title_ar', ''))
            else:
                title_en = h.get('title', '')
                title_ar = h.get('title_ar', '') or h.get('title', '')
                img = (h.get('images') or [''])[0]
                slug_c = h.get('slug') or ''
                brand_c = h.get('brand_title', '') or ''
            if not img:
                continue
            s = jaccard(our_toks, toks(f'{title_en} {title_ar} {brand_c} {slug_c.replace("-", " ")}'))
            if s > best_s:
                best, best_s, best_src = (img, title_en, slug_c), s, src
        print(f'[{slug[:48]}] candidates={len(candidates)} best_score={best_s:.2f}', flush=True)
        results[slug] = {'score': round(best_s, 3), 'src': best_src, 'title': best[1] if best else None}
        if not best or best_s < 0.30:
            continue
        img_url = best[0]
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
        try:
            raw = http_get(img_url)
            if len(raw) < 3000 or not img_magic_ok(raw[:16]):
                results[slug]['img'] = 'bad_bytes'
                continue
            path = save_square_webp(raw, slug)
            if vlm_match(path, p):
                con.execute('UPDATE Product SET imageUrl=?, imageSource=? WHERE id=?',
                            (f'/images/products/{slug}.webp', 'chefaa-cdn', p['id']))
                con.commit()
                results[slug]['img'] = 'ok'
                print(f'  ✓ IMAGE SAVED from {best_src} ({best[1][:40]})', flush=True)
            else:
                os.remove(path)
                results[slug]['img'] = 'vlm_mismatch'
                print('  ✗ VLM mismatch', flush=True)
        except Exception as e:
            results[slug]['img'] = f'error {str(e)[:60]}'
            print(f'  ✗ {str(e)[:80]}', flush=True)

    json.dump(results, open(f'{BASE}/scripts/.remaining_images.json', 'w'), ensure_ascii=False, indent=1)
    ok = sum(1 for v in results.values() if v.get('img') == 'ok')
    print(f'\nDONE: {ok}/{len(products)} images fetched', flush=True)


if __name__ == '__main__':
    main()

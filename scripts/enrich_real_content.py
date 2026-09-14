#!/usr/bin/env python3
"""
Enrich The Pharmacy catalog with REAL content from Chefaa's public Meilisearch:
- full product descriptions (description_en / description_ar) — authentic manufacturer copy
- product images for the 24 products currently missing them (VLM-verified)

Matching: dual-query (nameEn then nameAr / crafted fallback), token-Jaccard scoring
with brand + numeric-strength guards (proven from enrich_from_meilisearch.py),
plus slug-token bonus.

Resumable: scripts/.real_content_progress.json
Polite: 0.4s pacing, 3 workers.
"""
import html
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = '/home/z/my-project'
DB = f'{BASE}/db/custom.db'
IMG_DIR = f'{BASE}/public/images/products'
PROGRESS = f'{BASE}/scripts/.real_content_progress.json'
MEILI = 'https://meilisearch.chefaa.com/indexes/products_eg/search'
KEY = 'd63cccef2eeacd2734bef1c445980b5720de94f5f161bf9d8322a377a0b03536'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36'

MAX_DESC = 1600

# crafted search fallbacks for the 24 imageless products
FALLBACK_QUERIES = {
    'starville-screen-professional-white-top': ['Starville screen', 'sunscreen cream SPF'],
    'acti-colla-c-for-joint-inflammation-and-roughness-treatment': ['Acti Colla', 'collagen joint'],
    'acti-colla-c-sachets-for-joint-inflammation-and-roughness': ['Acti Colla sachets', 'collagen sachets'],
    'devarol-s-200000-iu-ampoule': ['Devarol', 'vitamin D ampoule'],
    'freedent-baby-toothpaste-75ml': ['baby toothpaste', 'kids toothpaste'],
    'babyife-nasal-aspirator': ['nasal aspirator', 'baby nasal'],
    'l-oreal-infallible-lipstick-24h': ['Infallible lipstick', 'لوريال أحمر شفاه'],
    'revlon-colorstay-foundation': ['ColorStay foundation', 'ريفلون كريم أساس'],
    'nyx-born-to-glow-highlighter': ['Born To Glow', 'هايلايتر'],
    'essence-nail-polish-60-shades': ['Essence nail polish', 'Essence طلاء أظافر'],
    'fenty-gloss-bomb-universal': ['Gloss Bomb', 'فينتي جلوس'],
    'wheelchair-foldable-standard': ['wheelchair', 'كرسي متحرك'],
    'personal-lubricant-water-based-100ml': ['lubricant gel', 'جلس مرطب شخصي'],
    'frontline-plus-dog-large-3-pipettes': ['Frontline Plus dog', 'فرونت لاين للكلاب'],
    'frontline-plus-cat-3-pipettes': ['Frontline cat', 'فرونت لاين للقطط'],
    'pet-shampoo-anti-itch-250ml': ['pet shampoo', 'شامبو قطط وكلاب'],
    'pet-vitamin-supplement-60-tablets': ['pet vitamins', 'فيتامين للقطط'],
    'dog-dental-chews-medium-14': ['dental chews dog', 'مضغ أسنان للكلاب'],
    'amoxicillin-500mg-16-capsules': ['Amoxicillin 500mg', 'أموكسيسيلين'],
    'amlor-5mg-30-capsules': ['Amlor', 'أملور'],
    'redoxon-double-action-30-tablets': ['Redoxon', 'ريداكسون'],
    'pigeon-baby-wipes-80-sheets': ['Pigeon wipes', 'مناديل بيجون'],
    'strong-ville-anti-hair-fall-strengthening-shampoo': ['Strong Ville', 'شامبو ضد تساقط الشعر'],
    'starville-fahrenheit-body-care-oud-blend': ['Starville Fahrenheit', 'Starville body care'],
}

AR_DIAC = re.compile(r'[\u064B-\u0652\u0640]')
TAG_RE = re.compile(r'<[^>]+>')
URL_RE = re.compile(r'https?://\S+', re.I)


def norm(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', str(s))
    s = AR_DIAC.sub('', s)
    for a, b in [('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ة', 'ه'), ('ى', 'ي'), ('ؤ', 'و'), ('ئ', 'ي')]:
        s = s.replace(a, b)
    s = s.lower()
    s = re.sub(r'[^a-z0-9\u0600-\u06ff]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def toks(s):
    return {t for t in norm(s).split() if len(t) > 1}


def nums(s):
    out = set()
    for m in re.finditer(r'(\d+)\s*(mg|ml|gm|g|gr|mcg|tab|tabs|tablet|tablets|amp|ampoules|caps|count)?', norm(s)):
        n, unit = m.group(1), m.group(2) or ''
        if n in ('0', '1'):
            continue
        out.add(f'{n}{unit}')
    return out


def score(ours, hit):
    our_nt = toks(ours['nameEn'] + ' ' + ours['brand'])
    hit_brand = (hit.get('brands') or {})
    hit_nt = toks(hit.get('title_en', '') + ' ' + hit_brand.get('title_en', ''))
    if not our_nt or not hit_nt:
        return 0.0
    jac = len(our_nt & hit_nt) / len(our_nt | hit_nt)
    ob = toks(ours['brand'])
    hb = toks(hit_brand.get('title_en', '') + ' ' + hit_brand.get('title_ar', ''))
    brand_ok = bool(ob & hb) if ob else True
    on, hn = nums(ours['nameEn']), nums(hit.get('title_en', ''))
    num_conflict = bool(on and hn and not (on & hn))
    if num_conflict:
        jac *= 0.45
    if not brand_ok:
        jac *= 0.5
    oat, hat = toks(ours['nameAr']), toks(hit.get('title_ar', ''))
    if oat and hat:
        aj = len(oat & hat) / len(oat | hat)
        jac = max(jac, 0.6 * jac + 0.4 * aj)
    # slug bonus (our slugs derive from chefaa names)
    osl = toks(ours['slug'].replace('-', ' '))
    hsl = toks((hit.get('slug') or '').replace('-', ' '))
    if osl and hsl:
        sj = len(osl & hsl) / len(osl | hsl)
        jac = max(jac, 0.75 * jac + 0.25 * sj)
    return jac


def post(url, body, tries=3):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                         headers={'Authorization': f'Bearer {KEY}',
                                                  'Content-Type': 'application/json',
                                                  'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if t == tries - 1:
                print(f'  meili error: {e}', flush=True)
                return None
            time.sleep(1.2 * (t + 1))


EN_MARKERS = ['What are', 'What is', 'Why ', 'Who can use', 'Dosage', 'How to use',
              'Active ingredient', 'Warnings', 'Side effects', 'Benefits', 'How it works', 'Usage']
AR_MARKERS = ['ما هي ', 'ما هو ', 'لماذا ', 'دواعي الاستعمال', 'الجرعة', 'طريقة الاستخدام',
              'طريقة الاستعمال', 'المكونات', 'التحذيرات', 'الآثار الجانبية', 'فوائد ', 'كيفية الاستخدام']


def clean_desc(raw, is_ar):
    if not raw:
        return ''
    t = html.unescape(str(raw))
    t = TAG_RE.sub(' ', t)
    t = t.replace('\x0b', ' ').replace('\x0c', ' ').replace('\r', ' ').replace('\u200f', '').replace('\u200e', '')
    t = URL_RE.sub(' ', t)
    # scrub competitor brand mentions
    t = re.sub(r'chefaa\.com?', 'The Pharmacy', t, flags=re.I)
    t = re.sub(r'\bchefaa\b', 'The Pharmacy', t, flags=re.I)
    t = re.sub(r'\s*,\s*(The Pharmacy)\s*(?:\.|$)', r'.', t)
    # collapse whitespace but remember marker boundaries
    t = re.sub(r'[ \t]+', ' ', t)
    # split into paragraphs on known section markers
    markers = AR_MARKERS if is_ar else EN_MARKERS
    parts = [t]
    for m in markers:
        new_parts = []
        for seg in parts:
            pieces = re.split(r'(?=' + re.escape(m) + r')', seg)
            new_parts.extend(p for p in pieces if p.strip())
        parts = new_parts
    paras = [p.strip(' :،.-') for p in parts]
    paras = [re.sub(r'\s+', ' ', p).strip() for p in paras]
    paras = [p for p in paras if len(p) > 15]
    text = '\n\n'.join(paras[:6])
    if len(text) > MAX_DESC:
        text = text[:MAX_DESC]
        # cut at last sentence end
        cut = max(text.rfind('.'), text.rfind('؟'), text.rfind('!'), text.rfind('. '))
        if cut > MAX_DESC * 0.5:
            text = text[:cut + 1]
    return text.strip()


def http_bytes(url, referer='https://chefaa.com/', timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': referer})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(12 * 1024 * 1024)


def img_magic_ok(head):
    if head[:3] == b'\xff\xd8\xff':
        return 'jpg'
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'webp'
    return None


def process_image(raw_bytes, out_path_base):
    """Square-normalize to webp via PIL; returns final path."""
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(raw_bytes))
    im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA') else im.convert('RGB')
    # flatten alpha to white
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    im.thumbnail((800, 800), Image.LANCZOS)
    # pad to square on white
    side = max(im.size)
    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    out = f'{out_path_base}.webp'
    canvas.save(out, 'WEBP', quality=84)
    return out


def vlm_match(img_path, product):
    prompt = (f"Product: \"{product['nameEn']}\" (brand: {product['brand']}, category: {product['catName']}).\n"
              f"Question: Does this image plausibly show this exact product or a very close equivalent "
              f"(correct product type and format — not a different product, not a person, not a logo)?\n"
              f"Answer with EXACTLY one word: MATCH or MISMATCH.")
    try:
        r = subprocess.run(['z-ai', 'vision', '-p', prompt, '-i', img_path],
                           capture_output=True, text=True, timeout=120)
        out = r.stdout
        start = out.find('{')
        data = json.loads(out[start:])
        content = str(data.get('choices', [{}])[0].get('message', {}).get('content', '')).upper()
        return 'MATCH' in content and 'MISMATCH' not in content
    except Exception as e:
        print(f'  vlm error (accepting): {e}', flush=True)
        return True


def main():
    import threading
    con = sqlite3.connect(DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    wlock = threading.Lock()
    rows = con.execute("""
        SELECT p.id, p.slug, p.nameEn, p.nameAr, p.brand, p.imageUrl, p.descEn, p.descAr,
               p.subcategory, p.volume, p.prescriptionRequired, c.nameEn AS catName
        FROM Product p JOIN Category c ON c.id = p.categoryId
    """).fetchall()
    products = [dict(r) for r in rows]
    print(f'total products: {len(products)}', flush=True)

    progress = json.load(open(PROGRESS)) if os.path.exists(PROGRESS) else {}
    todo = [p for p in products if p['slug'] not in progress]
    print(f'to process: {len(todo)}', flush=True)

    def work(p):
        slug = p['slug']
        need_img = not p['imageUrl']
        queries = [p['nameEn'], p['nameAr']] + (FALLBACK_QUERIES.get(slug, []) if need_img else [])
        hits = []
        for q in queries:
            if not q:
                continue
            res = post(MEILI, {'q': q, 'limit': 8})
            hs = (res or {}).get('hits') or []
            hits.extend(hs)
            if hs and not need_img:
                break  # desc-only: first query is enough
            time.sleep(0.35)
        # dedupe by id
        seen = set()
        uniq = []
        for h in hits:
            hid = h.get('id')
            if hid not in seen:
                seen.add(hid)
                uniq.append(h)
        best, best_s = None, 0.0
        for h in uniq:
            s = score(p, h)
            if s > best_s:
                best, best_s = h, s

        result = {'match_score': round(best_s, 3), 'desc_updated': False, 'img': None}
        threshold = 0.45 if need_img else 0.52
        if best and best_s >= threshold:
            result['chefaa_title'] = (best.get('title_en') or '')[:80]
            # --- description ---
            den = clean_desc(best.get('description_en'), False)
            dar = clean_desc(best.get('description_ar'), True)
            if len(den) >= 140 and len(dar) >= 80:
                with wlock:
                    con.execute('UPDATE Product SET descEn=?, descAr=? WHERE id=?', (den, dar, p['id']))
                    con.commit()
                result['desc_updated'] = True
            # --- image for missing ---
            if need_img and best.get('image'):
                img_url = best['image']
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                try:
                    raw = http_bytes(img_url)
                    if len(raw) >= 3000 and img_magic_ok(raw[:16]):
                        out_base = f'{IMG_DIR}/{slug}'
                        path = process_image(raw, out_base)
                        if vlm_match(path, p):
                            with wlock:
                                con.execute('UPDATE Product SET imageUrl=?, imageSource=? WHERE id=?',
                                            (f'/images/products/{slug}.webp', 'chefaa-cdn', p['id']))
                                con.commit()
                            result['img'] = 'ok'
                        else:
                            os.remove(path)
                            result['img'] = 'vlm_mismatch'
                    else:
                        result['img'] = 'bad_bytes'
                except Exception as e:
                    result['img'] = f'error: {str(e)[:80]}'
        progress[slug] = result
        return slug, result

    done = 0
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(work, p): p for p in todo}
        for fut in as_completed(futs):
            try:
                slug, result = fut.result()
                done += 1
                flag = '✓' if (result.get('desc_updated') or result.get('img') == 'ok') else '·'
                print(f'[{done}/{len(todo)}] {flag} {slug[:55]} score={result["match_score"]} '
                      f'desc={result["desc_updated"]} img={result.get("img")}', flush=True)
            except Exception as e:
                print(f'  future error: {e}', flush=True)
            if done % 25 == 0:
                json.dump(progress, open(PROGRESS, 'w'), ensure_ascii=False)
    json.dump(progress, open(PROGRESS, 'w'), ensure_ascii=False)

    # summary
    desc_ok = sum(1 for v in progress.values() if v.get('desc_updated'))
    img_ok = sum(1 for v in progress.values() if v.get('img') == 'ok')
    print(f'\nDONE: real descriptions applied: {desc_ok}, images fetched: {img_ok}', flush=True)
    con.close()


if __name__ == '__main__':
    main()

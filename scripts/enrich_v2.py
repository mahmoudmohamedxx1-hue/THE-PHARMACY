#!/usr/bin/env python3
"""
Enrichment v2 — REAL bilingual content from Chefaa:
  1. Match product via Meilisearch (dual query, Jaccard+slug scoring) -> chefaa_slug
  2. GET /api/products/<slug>        -> full EN description (HTML) + images[] + need_prescription
  3. GET /eg-ar/nowProduct/<slug>    -> full AR description (SSR HTML, "عن هذا المنتج" section)
  4. Clean (strip tags, scrub chefaa mentions, cut price section, sentence-boundary trim)
  5. Update DB descEn/descAr; for imageless products download images[0] + VLM verify
Progress: scripts/.real_content2.json (stores chefaa slug + image urls for later gallery step)
"""
import html
import io
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
import unicodedata
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = '/home/z/my-project'
DB = f'{BASE}/db/custom.db'
IMG_DIR = f'{BASE}/public/images/products'
PROGRESS = f'{BASE}/scripts/.real_content2.json'
MEILI = 'https://meilisearch.chefaa.com/indexes/products_eg/search'
KEY = 'd63cccef2eeacd2734bef1c445980b5720de94f5f161bf9d8322a377a0b03536'
API = 'https://chefaa.com/api/products/'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36'
MAX_DESC = 1600

FALLBACK_QUERIES = {
    'starville-screen-professional-white-top': ['Starville screen', 'sunscreen cream'],
    'acti-colla-c-for-joint-inflammation-and-roughness-treatment': ['Acti Colla', 'collagen joint'],
    'acti-colla-c-sachets-for-joint-inflammation-and-roughness': ['Acti Colla sachets', 'collagen sachets'],
    'devarol-s-200000-iu-ampoule': ['Devarol', 'vitamin D ampoule'],
    'freedent-baby-toothpaste-75ml': ['baby toothpaste', 'kids toothpaste'],
    'babyife-nasal-aspirator': ['nasal aspirator', 'baby nasal aspirator'],
    'l-oreal-infallible-lipstick-24h': ['Infallible lipstick', 'لوريال أحمر شفاه'],
    'revlon-colorstay-foundation': ['ColorStay foundation', 'ريفلون كريم أساس'],
    'nyx-born-to-glow-highlighter': ['Born To Glow', 'هايلايتر'],
    'essence-nail-polish-60-shades': ['Essence nail polish', 'Essence طلاء أظافر'],
    'fenty-gloss-bomb-universal': ['Gloss Bomb', 'فينتي جلوس'],
    'wheelchair-foldable-standard': ['wheelchair', 'كرسي متحرك'],
    'personal-lubricant-water-based-100ml': ['lubricant gel', 'جلس مرطب'],
    'frontline-plus-dog-large-3-pipettes': ['Frontline Plus dog', 'فرونت لاين للكلاب'],
    'frontline-plus-cat-3-pipettes': ['Frontline cat', 'فرونت لاين للقطط'],
    'pet-shampoo-anti-itch-250ml': ['pet shampoo', 'شامبو حيوانات'],
    'pet-vitamin-supplement-60-tablets': ['pet vitamins', 'فيتامين قطط'],
    'dog-dental-chews-medium-14': ['dental chews dog', 'أسنان كلاب'],
    'amoxicillin-500mg-16-capsules': ['Amoxicillin 500mg', 'أموكسيسيلين'],
    'amlor-5mg-30-capsules': ['Amlor', 'أملور'],
    'redoxon-double-action-30-tablets': ['Redoxon', 'ريداكسون'],
    'pigeon-baby-wipes-80-sheets': ['Pigeon wipes', 'مناديل بيجون'],
    'strong-ville-anti-hair-fall-strengthening-shampoo': ['Strong Ville', 'شامبو ضد تساقط'],
    'starville-fahrenheit-body-care-oud-blend': ['Starville Fahrenheit', 'Starville oud'],
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
    hb = hit.get('brands') or {}
    hit_nt = toks(hit.get('title_en', '') + ' ' + hb.get('title_en', ''))
    if not our_nt or not hit_nt:
        return 0.0
    jac = len(our_nt & hit_nt) / len(our_nt | hit_nt)
    ob = toks(ours['brand'])
    hbt = toks(hb.get('title_en', '') + ' ' + hb.get('title_ar', ''))
    brand_ok = bool(ob & hbt) if ob else True
    on, hn = nums(ours['nameEn']), nums(hit.get('title_en', ''))
    if on and hn and not (on & hn):
        jac *= 0.45
    if not brand_ok:
        jac *= 0.5
    oat, hat = toks(ours['nameAr']), toks(hit.get('title_ar', ''))
    if oat and hat:
        aj = len(oat & hat) / len(oat | hat)
        jac = max(jac, 0.6 * jac + 0.4 * aj)
    osl = toks(ours['slug'].replace('-', ' '))
    hsl = toks((hit.get('slug') or '').replace('-', ' '))
    if osl and hsl:
        sj = len(osl & hsl) / len(osl | hsl)
        jac = max(jac, 0.75 * jac + 0.25 * sj)
    return jac


def http_get(url, accept_json=False, timeout=25):
    headers = {'User-Agent': UA}
    if accept_json:
        headers['Accept'] = 'application/json'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(15 * 1024 * 1024)


def meili_search(q, limit=8):
    for t in range(3):
        try:
            req = urllib.request.Request(MEILI, data=json.dumps({'q': q, 'limit': limit}).encode(),
                                         headers={'Authorization': f'Bearer {KEY}',
                                                  'Content-Type': 'application/json',
                                                  'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode()).get('hits') or []
        except Exception:
            if t == 2:
                return []
            time.sleep(1.0)


def ar_ratio(s):
    if not s:
        return 0.0
    ar = sum(1 for c in s if '\u0600' <= c <= '\u06FF')
    letters = sum(1 for c in s if c.isalpha())
    return ar / letters if letters else 0.0


def clean_html_text(raw, is_ar):
    """HTML -> clean paragraphs."""
    if not raw:
        return ''
    t = html.unescape(str(raw))
    # drop the trailing price section (AR pages) before stripping
    if is_ar:
        t = re.split(r'<h2[^>]*>\s*سعر', t)[0]
    # structural breaks -> newlines
    t = re.sub(r'</(?:li|p|h1|h2|h3|h4|div|tr)>', '\n', t, flags=re.I)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = TAG_RE.sub(' ', t)
    t = t.replace('\x0b', ' ').replace('\x0c', ' ').replace('\r', ' ').replace('\u200f', '').replace('\u200e', '')
    t = URL_RE.sub(' ', t)
    t = re.sub(r'chefaa\.com?', ' ', t, flags=re.I)
    t = re.sub(r'\bchefaa\b', ' ', t, flags=re.I)
    # lines
    lines = [re.sub(r'\s+', ' ', ln).strip(' \u2022·:،-') for ln in t.split('\n')]
    lines = [ln for ln in lines if ln]
    # merge tiny orphan lines into the next one
    merged = []
    for ln in lines:
        if merged and (len(ln) < 12 or len(merged[-1]) < 12):
            merged[-1] = merged[-1] + ' ' + ln
        else:
            merged.append(ln)
    text = '\n\n'.join(merged[:7])
    if len(text) > MAX_DESC:
        text = text[:MAX_DESC]
        cut = max(text.rfind('.'), text.rfind('؟'), text.rfind('!'))
        if cut > MAX_DESC * 0.5:
            text = text[:cut + 1]
    return text.strip()


AR_ABOUT = '<h2 class="header-extra">عن هذا المنتج</h2>'


def extract_ar_desc(page_html):
    if not page_html:
        return ''
    try:
        s = page_html.index(AR_ABOUT) + len(AR_ABOUT)
    except ValueError:
        return ''
    rest = page_html[s:]
    # end at next header-extra section (e.g. المواصفات) if present
    m = re.search(r'<h2 class="header-extra">', rest)
    seg = rest[:m.start()] if m else rest[:20000]
    return clean_html_text(seg, True)


def img_magic_ok(head):
    if head[:3] == b'\xff\xd8\xff':
        return 'jpg'
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'webp'
    return None


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
              f"Does this image plausibly show this exact product or a very close equivalent? "
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


def process(p, con, wlock):
    slug = p['slug']
    need_img = not p['imageUrl']
    result = {'score': 0.0, 'desc': False, 'img': None, 'chefaa_slug': None, 'api_images': []}

    # 1) meilisearch match
    queries = [p['nameEn'], p['nameAr']] + (FALLBACK_QUERIES.get(slug, []) if need_img else [])
    hits = []
    for q in queries:
        if not q:
            continue
        hs = meili_search(q)
        hits.extend(hs)
        if hs:
            break
    seen, uniq = set(), []
    for h in hits:
        if h.get('id') not in seen:
            seen.add(h.get('id'))
            uniq.append(h)
    best, best_s = None, 0.0
    for h in uniq:
        s = score(p, h)
        if s > best_s:
            best, best_s = h, s
    result['score'] = round(best_s, 3)
    threshold = 0.45 if need_img else 0.52
    if not best or best_s < threshold:
        return result
    cslug = best.get('slug') or ''
    full_url = (best.get('full_url') or '').strip()
    if not cslug and not full_url:
        return result
    result['chefaa_slug'] = cslug

    # 2) product API -> EN description + images
    api_desc = ''
    api_images = []
    if cslug:
        try:
            data = json.loads(http_get(API + cslug, accept_json=True).decode('utf-8', 'replace')).get('data') or {}
            api_desc = data.get('description') or ''
            api_images = [u for u in (data.get('images') or []) if isinstance(u, str) and u]
            api_images = [('https:' + u if u.startswith('//') else u) for u in api_images]
            result['api_images'] = api_images[:6]
        except Exception as e:
            result['api_err'] = str(e)[:80]
    time.sleep(0.25)

    # 3) AR page -> AR description
    ar_desc = ''
    if full_url:
        try:
            page = http_get(full_url).decode('utf-8', 'replace')
            ar_desc = extract_ar_desc(page)
        except Exception as e:
            result['page_err'] = str(e)[:80]
    time.sleep(0.25)

    # language sanity: api description might be arabic
    en_desc, ar_desc2 = api_desc, ar_desc
    if ar_ratio(api_desc) > 0.5:
        # api desc is arabic; use as AR if page extraction empty
        if not ar_desc2:
            ar_desc2 = api_desc
            en_desc = ''

    en_clean = clean_html_text(en_desc, False)
    ar_clean = clean_html_text(ar_desc2, True)
    # fallbacks to meilisearch 500-char crops
    if len(en_clean) < 140:
        men = clean_html_text(best.get('description_en'), False)
        if len(men) >= 140:
            en_clean = men
    if len(ar_clean) < 100:
        mar = clean_html_text(best.get('description_ar'), True)
        if len(mar) >= 100:
            ar_clean = mar

    if len(en_clean) >= 140 and len(ar_clean) >= 80:
        with wlock:
            con.execute('UPDATE Product SET descEn=?, descAr=? WHERE id=?', (en_clean, ar_clean, p['id']))
            con.commit()
        result['desc'] = True
        result['desc_len'] = [len(en_clean), len(ar_clean)]

    # 4) image for imageless products
    if need_img and api_images:
        try:
            raw = http_get(api_images[0])
            if len(raw) >= 3000 and img_magic_ok(raw[:16]):
                path = save_square_webp(raw, slug)
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
            result['img'] = f'error {str(e)[:60]}'
    return result


def main():
    con = sqlite3.connect(DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    wlock = threading.Lock()
    rows = con.execute("""
        SELECT p.id, p.slug, p.nameEn, p.nameAr, p.brand, p.imageUrl, p.descEn, p.descAr,
               p.subcategory, p.volume, p.prescriptionRequired, c.nameEn AS catName
        FROM Product p JOIN Category c ON c.id = p.categoryId
        ORDER BY p.popularity DESC
    """).fetchall()
    products = [dict(r) for r in rows]
    progress = json.load(open(PROGRESS)) if os.path.exists(PROGRESS) else {}
    todo = [p for p in products if p['slug'] not in progress]
    print(f'total={len(products)} done={len(progress)} todo={len(todo)}', flush=True)

    plock = threading.Lock()
    done_ct = [0]

    def work(p):
        try:
            r = process(p, con, wlock)
        except Exception as e:
            r = {'fatal': str(e)[:120]}
        with plock:
            progress[p['slug']] = r
            done_ct[0] += 1
            n = done_ct[0]
            if n % 10 == 0:
                json.dump(progress, open(PROGRESS, 'w'), ensure_ascii=False)
            flag = '✓' if (r.get('desc') or r.get('img') == 'ok') else '·'
            print(f'[{n}/{len(todo)}] {flag} {p["slug"][:52]} s={r.get("score")} desc={r.get("desc")} img={r.get("img")}', flush=True)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(work, p) for p in todo]
        for f in as_completed(futs):
            f.result()

    json.dump(progress, open(PROGRESS, 'w'), ensure_ascii=False)
    desc_ok = sum(1 for v in progress.values() if v.get('desc'))
    img_ok = sum(1 for v in progress.values() if v.get('img') == 'ok')
    matched = sum(1 for v in progress.values() if v.get('chefaa_slug'))
    print(f'\nDONE matched={matched} real_desc={desc_ok} imgs={img_ok}', flush=True)


if __name__ == '__main__':
    main()

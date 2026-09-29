#!/usr/bin/env python3
"""Deep DB quality audit — round 2. Hunts small/junk/fake data the first pass missed."""
import sqlite3, re, json, unicodedata
from collections import Counter

db = sqlite3.connect('db/custom.db')
db.row_factory = sqlite3.Row
P = lambda q: db.execute(q).fetchall()

issues = Counter()
details = {}

def add(name, key=None):
    issues[name] += 1
    if name not in details: details[name] = []
    if key and len(details[name]) < 6: details[name].append(str(key)[:110])

def invisible_chars(s):
    """Find zero-width / BOM / control chars in text."""
    if s is None: return []
    bad = []
    for i, ch in enumerate(s):
        if ch in ('\ufeff', '\u200b', '\u200c', '\u200d', '\u2060', '\u00ad') or (unicodedata.category(ch) == 'Cc' and ch not in '\n\t\r'):
            bad.append((i, hex(ord(ch))))
    return bad

def has_arabic(s): return bool(s and re.search(r'[\u0600-\u06FF]', s))

rows = P("SELECT * FROM Product")
print(f"products: {len(rows)}")

for r in rows:
    d = dict(r)
    slug = d.get('slug')
    for f in ('nameEn','nameAr','descEn','descAr','brand','subcategory'):
        v = d.get(f)
        bad = invisible_chars(v)
        if bad: add(f'invisible_chars[{f}]', f"{slug}: {bad[:3]} len={len(v or '')}")
        if v and v != v.strip(): add(f'whitespace_edges[{f}]', f"{slug}")
        if v and re.search(r'(.)\1{4,}', v): add(f'repeat_chars[{f}]', f"{slug}: {v[:60]}")
    # leading BOM-like blank content (the Raw African case)
    if d.get('descEn','').startswith('\ufeff') or d.get('descEn','').lstrip().startswith('\ufeff'):
        add('descEn_starts_BOM', slug)
    # Arabic field containing mostly English
    de, da = d.get('descEn') or '', d.get('descAr') or ''
    if da and not has_arabic(da): add('descAr_no_arabic', slug)
    if de and has_arabic(de) and len(de) > 200: add('descEn_contains_arabic', slug)
    if not da or not da.strip(): add('descAr_empty', slug)
    if not de or not de.strip(): add('descEn_empty', slug)
    # transliterated Arabic names (arabic letters but clearly translit brand echo)
    na = d.get('nameAr') or ''
    if has_arabic(na) and de and re.search(r'\b(the|and|with|for|plus|care|skin|hair|action)\b', na, re.I):
        add('nameAr_latin_words_mixed', slug)
    # price sanity
    price = d.get('price') or 0
    if price is not None and (price <= 0): add('price_le_0', f"{slug}={price}")
    if price and price > 5000: add('price_gt_5000', f"{slug}={price}")
    stock = d.get('stock')
    if stock is None or stock < 0: add('stock_negative_or_null', f"{slug}={stock}")
    # volume field sanity
    vol = d.get('volume') or ''
    if vol and not re.search(r'\d', vol): add('volume_no_digits', f"{slug}='{vol}'")
    # imageUrl
    img = d.get('imageUrl') or ''
    if not img: add('imageUrl_empty', slug)
    elif not img.startswith('http'): add('imageUrl_not_http', f"{slug}={img[:60]}")
    # images JSON
    imgs = d.get('images')
    if imgs:
        try:
            arr = json.loads(imgs)
            if not isinstance(arr, list) or any(not isinstance(x, str) or not x for x in arr): add('images_bad_json', slug)
        except Exception: add('images_unparseable', slug)
    # desc too short to be real
    if de and 0 < len(de.strip()) < 25: add('descEn_stub', f"{slug}: '{de.strip()}'")
    if da and 0 < len(da.strip()) < 15: add('descAr_stub', f"{slug}: '{da.strip()}'")

# duplicate products by normalized nameEn+brand
names = Counter()
for r in rows:
    k = re.sub(r'\s+', ' ', (r['nameEn'] or '').strip().lower()) + '|' + (r['brand'] or '').strip().lower()
    names[k] += 1
for k, c in names.items():
    if c > 1: add('duplicate_nameEn_brand', f"{k[:80]} x{c}")

# category consistency
cats = P("SELECT * FROM Category")
print(f"categories: {len(cats)}")
for c in cats:
    cnt = db.execute("SELECT COUNT(*) FROM Product WHERE categoryId=?", (c['id'],)).fetchone()[0]
    if cnt == 0: add('category_empty', c['slug'])

# createdAt spread
cd = [str(r['createdAt']) for r in rows]
print(f"createdAt distinct: {len(set(cd))} e.g. {sorted(set(cd))[:2]}")

# users / orders / events current state
for t in ('User','Order','AnalyticsEvent','Session','Prescription'):
    try:
        n = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t}: {n}")
    except Exception as e:
        print(f"{t}: ERR {e}")

print("\n===== ISSUES =====")
for k, v in sorted(issues.items(), key=lambda x: -x[1]):
    print(f"{v:4d}  {k}")
print("\n===== SAMPLES =====")
for k in details:
    print(f"--- {k} ---")
    for s in details[k][:6]: print("   ", s)

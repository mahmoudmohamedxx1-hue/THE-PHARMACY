#!/usr/bin/env python3
"""Round-2 data quality fixes (idempotent):
1. Zero fabricated popularity scores (all products)
2. movelex: descEn was Arabic -> proper English; descAr exaggerated claim softened
3. Strip BOM / zero-width chars from text fields (7 products)
4. clary nameAr: remove trailing English echo
5. volume 'Not specified'/'Not visible' -> NULL (77 products)
"""
import sqlite3, re

db = sqlite3.connect('db/custom.db')
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
cur = db.cursor()
report = {}

def strip_invisible(s):
    if s is None: return s
    out = ''.join(ch for ch in s if ch not in '\ufeff\u200b\u200c\u200d\u2060\u00ad')
    out = re.sub(r'[ \t]+', ' ', out)          # collapse doubled spaces left by removals
    out = re.sub(r' ?\n ?', '\n', out)
    return out.strip()

# ---- 1. popularity zeroed ----
n = cur.execute("UPDATE Product SET popularity=0 WHERE popularity IS NOT NULL AND popularity<>0").rowcount
report['popularity_zeroed'] = n

# ---- 2. movelex ----
MOVELEX_EN = ("Movelex Cream is a topical cream specialized in relieving multiple types of pain, "
 "including muscle tension, bone and joint pain, and bruises.\n\nIngredients: Peppermint oil "
 "(as menthol) - Eucalyptus oil - Camphor - Tocopherol (vitamin E) - Omega 3 - Omega 6.")
MOVELEX_AR = ("موڤليكس كريم متخصص في تسكين آلام متعددة مثل: الشد العضلي وآلام العظام والمفاصل والكدمات.\n\n"
 "سريع الامتصاص. المكونات: زيت النعناع - زيت الأوكالبتوس - زيت الكافور - فيتامين هـ - أوميجا 3 و6.")
cur.execute("UPDATE Product SET descEn=?, descAr=? WHERE slug='movelex-cream-120gm'", (MOVELEX_EN, MOVELEX_AR))
report['movelex_fixed'] = cur.rowcount

# ---- 3. BOM/zero-width strip on all text fields ----
fixed_bom = 0
for r in cur.execute("SELECT id, nameEn, nameAr, descEn, descAr, brand, subcategory, volume FROM Product").fetchall():
    vals = {f: strip_invisible(r[f]) for f in ('nameEn','nameAr','descEn','descAr','brand','subcategory','volume')}
    if any(vals[f] != r[f] for f in vals):
        cur.execute("UPDATE Product SET nameEn=?, nameAr=?, descEn=?, descAr=?, brand=?, subcategory=?, volume=? WHERE id=?",
                    (vals['nameEn'], vals['nameAr'], vals['descEn'], vals['descAr'], vals['brand'], vals['subcategory'], vals['volume'], r['id']))
        fixed_bom += 1
report['invisible_chars_stripped'] = fixed_bom

# ---- 4. clary nameAr ----
cur.execute("UPDATE Product SET nameAr=? WHERE slug='clary-hair-serum-for-dry-and-damaged-hair'", ('سيرم كلاري للشعر الجاف والتالف',))
report['clary_nameAr'] = cur.rowcount

# ---- 5. junk volume -> '' (column is NOT NULL; empty renders nothing) ----
n = cur.execute("UPDATE Product SET volume='' WHERE TRIM(LOWER(COALESCE(volume,''))) IN ('not specified','not visible','-','n/a','na','none')").rowcount
report['volume_nullified'] = n

db.commit()
db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
ok = db.execute('PRAGMA integrity_check').fetchone()[0]
print('report:', report)
print('integrity:', ok)

# verify
left = cur.execute("SELECT COUNT(*) FROM Product WHERE popularity<>0").fetchone()[0]
bom = cur.execute("SELECT COUNT(*) FROM Product WHERE descEn LIKE '%'||char(0xfeff)||'%' OR descAr LIKE '%'||char(0xfeff)||'%' OR descEn LIKE '%'||char(0x200b)||'%'").fetchone()[0]
mv = db.execute("SELECT descEn FROM Product WHERE slug='movelex-cream-120gm'").fetchone()[0]
cl = db.execute("SELECT nameAr FROM Product WHERE slug='clary-hair-serum-for-dry-and-damaged-hair'").fetchone()[0]
print(f'verify: popularity<>0 -> {left} | bom -> {bom} | movelex EN starts: {mv[:40]!r} | clary: {cl!r}')

#!/usr/bin/env python3
"""Task 17 audit: fake-data deep scan of db/custom.db (read-only)."""
import sqlite3, sys

con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()

print('== SEED ORDERS ==')
cur.execute('SELECT orderNumber, userId, status, subtotal, total, zone, phone, substr(address,1,50), createdAt FROM "Order"')
orders = cur.fetchall()
for r in orders: print(' ', r)
cur.execute('SELECT COUNT(*) FROM OrderItem')
print(' order items:', cur.fetchone()[0])
cur.execute('PRAGMA table_info(OrderItem)')
print(' OrderItem cols:', [r[1] for r in cur.fetchall()])
cur.execute('SELECT * FROM OrderItem LIMIT 5')
for r in cur.fetchall(): print('  item:', r)

print('\n== ANALYTICS ==')
cur.execute('PRAGMA table_info(AnalyticsEvent)')
acols = [r[1] for r in cur.fetchall()]
print(' cols:', acols)
cur.execute('SELECT type, COUNT(*), MIN(createdAt), MAX(createdAt) FROM AnalyticsEvent GROUP BY type')
for r in cur.fetchall(): print(' ', r)
sess = [c for c in acols if 'session' in c.lower()]
if sess:
    cur.execute(f'SELECT COUNT(DISTINCT {sess[0]}) FROM AnalyticsEvent')
    print(' distinct sessions:', cur.fetchone()[0])

print('\n== FAKE RATINGS ==')
cur.execute('SELECT COUNT(*) FROM Product WHERE rating > 0 AND reviewCount = 0')
print(' products w/ fake rating & 0 reviews:', cur.fetchone()[0])

print('\n== FAKE DISCOUNT ANCHORS ==')
cur.execute('SELECT COUNT(*) FROM Product WHERE compareAtPrice IS NOT NULL AND compareAtPrice > price')
print(' discount anchors:', cur.fetchone()[0])
cur.execute('SELECT ROUND(compareAtPrice/price, 3), COUNT(*) FROM Product WHERE compareAtPrice > price GROUP BY 1 ORDER BY 2 DESC LIMIT 10')
for r in cur.fetchall(): print('  ratio', r)

print('\n== POPULARITY ==')
cur.execute('SELECT MIN(popularity), MAX(popularity), AVG(popularity), COUNT(DISTINCT popularity) FROM Product')
print(' ', cur.fetchone())

print('\n== MEDICAL CLAIM WORDS IN DESCRIPTIONS ==')
for kw in ['cure', 'miracle', 'guaranteed results', 'treats all', 'شفاء نهائي', 'معجزة']:
    cur.execute("SELECT COUNT(*) FROM Product WHERE lower(descEn) LIKE ? OR descAr LIKE ?", (f'%{kw}%', f'%{kw}%'))
    c = cur.fetchone()[0]
    if c: print(f'  "{kw}": {c}')
cur.execute("SELECT slug, substr(descEn,1,150) FROM Product WHERE lower(descEn) LIKE '%cure%'")
for r in cur.fetchall(): print('  cure-product:', r)

print('\n== PRICE SANITY ==')
cur.execute('SELECT COUNT(*) FROM Product WHERE price <= 0'); print(' price<=0:', cur.fetchone()[0])
cur.execute('SELECT MIN(price), MAX(price) FROM Product'); print(' price range:', cur.fetchone())
cur.execute('SELECT COUNT(*) FROM Product WHERE stock < 0'); print(' stock<0:', cur.fetchone()[0])

print('\n== SESSIONS ==')
cur.execute('SELECT COUNT(*) FROM Session'); print(' sessions:', cur.fetchone()[0])

print('\n== IMAGE PATHS ==')
cur.execute("SELECT COUNT(*) FROM Product WHERE imageUrl IS NOT NULL AND imageUrl != ''")
total_img = cur.fetchone()[0]
print(' products w/ imageUrl:', total_img)
con.close()

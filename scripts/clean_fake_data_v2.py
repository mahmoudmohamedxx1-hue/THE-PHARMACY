#!/usr/bin/env python3
"""Task 17 — purge ALL fake data from db/custom.db (idempotent).

Fake-data inventory (found in the deep audit):
  1. 496 fabricated ratings (3.8-4.9) with 0 real reviews  -> zeroed
  2. 140 fabricated compareAtPrice discount anchors        -> NULLed (never a real our-price)
  3. 2 seed/test orders ("E2E test address" / Abbas El Akkad, guest, pending)
     + their items                                         -> deleted, stock restored
  4. 54 analytics events (E2E artifacts, fake funnel/conversion in admin) -> deleted
  5. 8 stale sessions                                      -> deleted
  6. Sudocrem AR description medical claim "تسريع الشفاء"  -> softened
"""
import sqlite3

DB = '/home/z/my-project/db/custom.db'
con = sqlite3.connect(DB, isolation_level=None)
cur = con.cursor()
cur.execute('PRAGMA foreign_keys=ON')

# --- 1. zero fake ratings (keep any real ones when reviewCount > 0) ---
cur.execute('UPDATE Product SET rating = 0 WHERE reviewCount = 0 AND rating > 0')
print('ratings zeroed:', cur.rowcount)

# --- 2. drop fake discount anchors ---
cur.execute('UPDATE Product SET compareAtPrice = NULL WHERE compareAtPrice IS NOT NULL')
print('discount anchors removed:', cur.rowcount)

# --- 3. delete seed/test orders + items, restore stock ---
FAKE_ORDERS = ('TP-3873878838', 'TP-1583394900')
cur.execute("SELECT id FROM \"Order\" WHERE orderNumber IN (?, ?)", FAKE_ORDERS)
ids = [r[0] for r in cur.fetchall()]
if ids:
    for oid in ids:
        cur.execute("SELECT productId, quantity FROM OrderItem WHERE orderId = ?", (oid,))
        for pid, qty in cur.fetchall():
            cur.execute('UPDATE Product SET stock = stock + ? WHERE id = ?', (qty, pid))
        cur.execute('DELETE FROM OrderItem WHERE orderId = ?', (oid,))
    qmarks = ','.join('?' * len(ids))
    cur.execute(f'DELETE FROM "Order" WHERE id IN ({qmarks})', ids)
print('seed/test orders deleted:', len(ids))

# --- 4. delete analytics artifacts (fake funnel/conversion) ---
cur.execute('DELETE FROM AnalyticsEvent')
print('analytics events deleted:', cur.rowcount)

# --- 5. delete stale sessions ---
cur.execute('DELETE FROM Session')
print('sessions deleted:', cur.rowcount)

# --- 6. soften the Sudocrem AR healing claim ---
cur.execute(
    "UPDATE Product SET descAr = REPLACE(descAr, 'لتسريع الشفاء وتهدئة التهيج', 'لدعم تعافي البشرة وتهدئة التهيج') WHERE slug = 'sudocrem-antiseptic-60g'")
print('sudocrem claim softened:', cur.rowcount)

# --- verify ---
print('\n== POST-CLEAN STATE ==')
cur.execute('SELECT COUNT(*) FROM Product WHERE rating > 0 AND reviewCount = 0'); print('fake ratings left:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM Product WHERE compareAtPrice IS NOT NULL'); print('compareAtPrice left:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM "Order"'); print('orders:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM OrderItem'); print('order items:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM AnalyticsEvent'); print('analytics:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM Session'); print('sessions:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM User'); print('users:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM Product'); print('products:', cur.fetchone()[0])

# checkpoint WAL + integrity
cur.execute('PRAGMA wal_checkpoint(TRUNCATE)')
cur.execute('PRAGMA integrity_check')
print('integrity:', cur.fetchone()[0])
con.close()
print('DONE')

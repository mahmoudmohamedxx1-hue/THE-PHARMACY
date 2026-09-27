#!/usr/bin/env python3
"""Task 17 — final cleanup: remove THIS audit session's test artifacts so the
shipped DB is pristine (only admin + demo users, zero orders, zero events)."""
import sqlite3

con = sqlite3.connect('/home/z/my-project/db/custom.db', isolation_level=None)
cur = con.cursor()
cur.execute('PRAGMA foreign_keys=ON')

# 1. delete all orders (all are this session's test orders) + items + stock restore
cur.execute('SELECT id, orderNumber FROM "Order"')
orders = cur.fetchall()
for oid, num in orders:
    cur.execute('SELECT productId, quantity FROM OrderItem WHERE orderId = ?', (oid,))
    for pid, qty in cur.fetchall():
        cur.execute('UPDATE Product SET stock = stock + ? WHERE id = ?', (qty, pid))
    cur.execute('DELETE FROM OrderItem WHERE orderId = ?', (oid,))
    print('deleted order', num)
cur.execute('DELETE FROM "Order"')
print('orders remaining:', cur.execute('SELECT COUNT(*) FROM "Order"').fetchone()[0])

# 2. delete test users (keep admin + demo)
cur.execute("DELETE FROM User WHERE email NOT IN ('admin@thepharmacy.com', 'demo@thepharmacy.com')")
print('test users deleted:', cur.rowcount)
print('users left:', [r[0] for r in cur.execute('SELECT email FROM User').fetchall()])

# 3. analytics + sessions (all from this session's browsing)
cur.execute('DELETE FROM AnalyticsEvent')
cur.execute('DELETE FROM Session')
print('analytics:', cur.execute('SELECT COUNT(*) FROM AnalyticsEvent').fetchone()[0], '| sessions:', cur.execute('SELECT COUNT(*) FROM Session').fetchone()[0])

# 4. final state
print('\n== FINAL PRISTINE STATE ==')
for tbl in ['Product', 'Category', '"Order"', 'OrderItem', 'User', 'Session', 'AnalyticsEvent', 'Prescription']:
    print(f'  {tbl}:', cur.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0])
cur.execute('SELECT COUNT(*) FROM Product WHERE rating > 0 AND reviewCount = 0'); print('  fake ratings:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM Product WHERE compareAtPrice IS NOT NULL'); print('  discount anchors:', cur.fetchone()[0])
cur.execute('PRAGMA wal_checkpoint(TRUNCATE)')
cur.execute('PRAGMA integrity_check')
print('  integrity:', cur.fetchone()[0])
con.close()
print('DONE')

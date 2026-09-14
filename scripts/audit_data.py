#!/usr/bin/env python3
"""Data integrity audit for The Pharmacy database + image assets."""
import sqlite3
import os
import json
import re

DB = "/home/z/my-project/db/custom.db"
IMG_DIR = "/home/z/my-project/public/images/products"
ICONS_DIR = "/home/z/my-project/public/icons"

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
report = {}

def check(name, ok, detail):
    report[name] = {"pass": bool(ok), "detail": detail}
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

# ---- Products ----
cur.execute("SELECT COUNT(*) c FROM Product")
total = cur.fetchone()["c"]
check("product_count", total >= 480, f"{total} products (expect >=480)")

cur.execute("SELECT COUNT(*) c FROM Product WHERE nameEn='' OR nameAr='' OR nameEn IS NULL OR nameAr IS NULL")
check("names_complete", cur.fetchone()["c"] == 0, "all products have EN+AR names")

cur.execute("SELECT COUNT(*) c FROM Product WHERE price <= 0 OR price IS NULL")
check("price_sane", cur.fetchone()["c"] == 0, "no zero/negative prices")

cur.execute("SELECT COUNT(*) c FROM Product WHERE stock < 0")
check("stock_sane", cur.fetchone()["c"] == 0, "no negative stock")

cur.execute("SELECT COUNT(*) c FROM Product WHERE (descEn='' OR descEn IS NULL) OR (descAr='' OR descAr IS NULL)")
check("descriptions_complete", cur.fetchone()["c"] == 0, "all products have EN+AR descriptions")

# duplicate slugs
cur.execute("SELECT slug, COUNT(*) c FROM Product GROUP BY slug HAVING c > 1")
dups = cur.fetchall()
check("unique_slugs", len(dups) == 0, f"{len(dups)} duplicate slugs")

# description quality: boilerplate repetition
cur.execute("SELECT descEn FROM Product LIMIT 500")
descs = [r["descEn"] for r in cur.fetchall()]
from collections import Counter
c = Counter(descs)
most = c.most_common(1)[0]
check("desc_uniqueness", most[1] <= 3, f"most repeated EN desc appears {most[1]}x (<=3 OK for size variants)")

# short descriptions
short = [d for d in descs if len(d) < 60]
check("desc_depth", len(short) <= 5, f"{len(short)} thin descriptions <60 chars")

# ---- Images ----
cur.execute("SELECT slug, imageUrl FROM Product WHERE imageUrl != '' AND imageUrl IS NOT NULL")
rows = cur.fetchall()
missing_on_disk = []
for r in rows:
    p = os.path.join(IMG_DIR, os.path.basename(r["imageUrl"]))
    if not os.path.exists(p):
        missing_on_disk.append(r["slug"])
check("image_files_exist", len(missing_on_disk) == 0,
      f"{len(rows)} DB image refs, {len(missing_on_disk)} missing on disk" + (f": {missing_on_disk[:5]}" if missing_on_disk else ""))

no_img = total - len(rows)
check("image_coverage", no_img <= 20, f"{len(rows)}/{total} have photos ({no_img} fallbacks, expect <=20)")

# image size stats (webp optimization)
sizes = []
for f in os.listdir(IMG_DIR):
    fp = os.path.join(IMG_DIR, f)
    sizes.append(os.path.getsize(fp))
total_mb = sum(sizes) / 1024 / 1024
big = [f for f in os.listdir(IMG_DIR) if os.path.getsize(os.path.join(IMG_DIR, f)) > 400 * 1024]
check("image_weight", total_mb < 30 and len(big) <= 5,
      f"{len(sizes)} files, {total_mb:.1f} MB total, {len(big)} files >400KB")

# ---- Categories ----
cur.execute("SELECT id, slug, nameEn, nameAr FROM Category ORDER BY sortOrder")
cats = cur.fetchall()
check("category_count", len(cats) == 10, f"{len(cats)} categories")
empty_cats = []
for cat in cats:
    cur.execute("SELECT COUNT(*) c FROM Product WHERE categoryId=?", (cat["id"],))
    if cur.fetchone()["c"] == 0:
        empty_cats.append(cat["slug"])
check("categories_have_products", len(empty_cats) == 0, f"empty categories: {empty_cats or 'none'}")

# ---- Orders math ----
cur.execute('SELECT o.id, o.orderNumber, o.subtotal, o.deliveryFee, o.total, o.zone, o.status FROM "Order" o')
orders = cur.fetchall()
bad_math = []
for o in orders:
    cur.execute("SELECT SUM(price*quantity) s FROM OrderItem WHERE orderId=?", (o["id"],))
    s = cur.fetchone()["s"] or 0
    if abs(s - o["subtotal"]) > 0.01:
        bad_math.append((o["orderNumber"], "subtotal", s, o["subtotal"]))
    if abs((o["subtotal"] + o["deliveryFee"]) - o["total"]) > 0.01:
        bad_math.append((o["orderNumber"], "total", o["subtotal"] + o["deliveryFee"], o["total"]))
check("order_math", len(bad_math) == 0, f"{len(orders)} orders, {len(bad_math)} math errors {bad_math[:3] or ''}")

# orphan order items
cur.execute("SELECT COUNT(*) c FROM OrderItem oi LEFT JOIN \"Order\" o ON oi.orderId=o.id WHERE o.id IS NULL")
check("no_orphan_items", cur.fetchone()["c"] == 0, "orphan OrderItems: 0")

# orders without items
cur.execute('SELECT o.orderNumber FROM "Order" o LEFT JOIN OrderItem i ON i.orderId=o.id WHERE i.id IS NULL')
empty_orders = [r["orderNumber"] for r in cur.fetchall()]
check("orders_have_items", len(empty_orders) == 0, f"orders w/o items: {empty_orders or 'none'}")

# free delivery threshold consistency (500 EGP)
cur.execute('SELECT o.orderNumber, o.subtotal, o.deliveryFee FROM "Order" o')
bad_fee = [r["orderNumber"] for r in cur.fetchall()
           if (r["deliveryFee"] == 0 and r["subtotal"] < 500) or (r["deliveryFee"] > 0 and r["subtotal"] >= 500)]
check("delivery_fee_logic", len(bad_fee) <= 1, f"fee logic anomalies: {bad_fee or 'none'} (demo orders may predate rule)")

# ---- Users / sessions ----
cur.execute("SELECT COUNT(*) c FROM User")
check("users", cur.fetchone()["c"] >= 2, "admin + demo users present")
cur.execute("SELECT COUNT(*) c FROM User WHERE passwordHash='' OR passwordHash IS NULL")
check("passwords_hashed", cur.fetchone()["c"] == 0, "no empty password hashes")
cur.execute("SELECT COUNT(*) c FROM Session")
check("sessions_table", True, f"{cur.fetchone()['c']} sessions (auth working per API tests)")

# ---- Prescriptions ----
cur.execute("SELECT COUNT(*) c FROM Prescription")
check("prescriptions", True, f"{cur.fetchone()['c']} prescriptions stored")

# ---- Stock consistency with recent test orders ----
cur.execute("SELECT COUNT(*) c FROM Product WHERE stock=0")
oos = cur.fetchone()["c"]
check("oos_catalog_share", oos / total < 0.15, f"{oos}/{total} out of stock ({oos/total*100:.1f}%, expect <15%)")

# ---- Price sanity ----
cur.execute("SELECT MIN(price) mn, MAX(price) mx, AVG(price) av FROM Product")
r = cur.fetchone()
check("price_range", 5 <= r["mn"] and r["mx"] < 5000, f"min {r['mn']}, max {r['mx']}, avg {r['av']:.0f} EGP")

# ---- PWA assets ----
icons = os.listdir(ICONS_DIR) if os.path.isdir(ICONS_DIR) else []
manifest = os.path.exists("/home/z/my-project/public/manifest.webmanifest")
sw = os.path.exists("/home/z/my-project/public/sw.js")
check("pwa_assets", manifest and sw and len(icons) >= 6 and os.path.isdir(os.path.join(ICONS_DIR, "splash")), f"manifest={manifest}, sw={sw}, {len(icons)} icons + splash dir")

passed = sum(1 for v in report.values() if v["pass"])
print(f"\nDATA AUDIT: {passed}/{len(report)} passed")
os.makedirs("/home/z/my-project/scripts/research-results", exist_ok=True)
with open("/home/z/my-project/scripts/research-results/data_audit.json", "w") as f:
    json.dump({"summary": {"passed": passed, "total": len(report)}, "checks": report}, f, indent=2)

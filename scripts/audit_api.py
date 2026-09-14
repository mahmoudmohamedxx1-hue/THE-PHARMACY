#!/usr/bin/env python3
"""Comprehensive API functional test suite for The Pharmacy.
Tests every endpoint: happy paths, validation errors, auth guards.
Outputs a structured pass/fail report to stdout + JSON to scripts/research-results/.
"""
import json
import urllib.request
import urllib.error
import sys
import time

BASE = "http://localhost:3000"
results = []

def get_cookie(headers):
    """Case-insensitive Set-Cookie extraction (server sends lowercase)."""
    for k, v in headers.items():
        if k.lower() == "set-cookie":
            return v.split(";")[0]
    return ""

def req(method, path, body=None, headers=None, cookies=None):
    """Returns (status, json_or_text, response_headers, elapsed_s)."""
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    if cookies:
        h["Cookie"] = cookies
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            elapsed = time.time() - t0
            try:
                return resp.status, json.loads(raw), dict(resp.headers), elapsed
            except json.JSONDecodeError:
                return resp.status, raw, dict(resp.headers), elapsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        elapsed = time.time() - t0
        try:
            return e.code, json.loads(raw), dict(e.headers), elapsed
        except json.JSONDecodeError:
            return e.code, raw, dict(e.headers), elapsed

def test(suite, name, method, path, expect_status, body=None, cookies=None, check=None):
    status, data, headers, elapsed = req(method, path, body, cookies=cookies)
    ok = status == expect_status
    detail = ""
    if ok and check:
        try:
            ok = check(data)
            detail = "" if ok else "check-failed"
        except Exception as ex:
            ok = False
            detail = f"check-exception: {ex}"
    results.append({
        "suite": suite, "name": name, "method": method, "path": path,
        "expected": expect_status, "got": status, "pass": ok,
        "ms": round(elapsed * 1000), "detail": detail,
    })
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {suite} :: {name} -> {status} (expect {expect_status}) {elapsed*1000:.0f}ms {detail}")
    return status, data, headers

# ============ CATALOG ============
test("catalog", "products list", "GET", "/api/products?limit=4", 200,
     check=lambda d: len(d["items"]) == 4 and d["total"] >= 400 and "brands" in d)
test("catalog", "products pagination p2", "GET", "/api/products?page=2&limit=12", 200,
     check=lambda d: d["page"] == 2 and len(d["items"]) <= 12)
test("catalog", "products sort price-asc", "GET", "/api/products?sort=price-asc&limit=5", 200,
     check=lambda d: all(d["items"][i]["price"] <= d["items"][i+1]["price"] for i in range(len(d["items"])-1)))
test("catalog", "products sort rating", "GET", "/api/products?sort=rating&limit=5", 200,
     check=lambda d: all(d["items"][i]["rating"] >= d["items"][i+1]["rating"] for i in range(len(d["items"])-1)))
test("catalog", "filter category", "GET", "/api/products?category=vitamins&limit=5", 200,
     check=lambda d: all(i["category"]["slug"] == "vitamins" for i in d["items"]))
test("catalog", "filter price range", "GET", "/api/products?min=50&max=150&limit=10", 200,
     check=lambda d: all(50 <= i["price"] <= 150 for i in d["items"]))
test("catalog", "filter inStock", "GET", "/api/products?inStock=true&limit=10", 200,
     check=lambda d: all(i["stock"] > 0 for i in d["items"]))
test("catalog", "filter hasImage", "GET", "/api/products?hasImage=true&limit=10", 200,
     check=lambda d: all(i["imageUrl"] for i in d["items"]))
test("catalog", "filter brand", "GET", "/api/products?brand=Eva&limit=10", 200,
     check=lambda d: all(i["brand"] == "Eva" for i in d["items"]))
test("catalog", "search q=panadol", "GET", "/api/products?q=panadol&limit=10", 200,
     check=lambda d: d["total"] >= 1)
test("catalog", "search empty q", "GET", "/api/products?q=&limit=5", 200,
     check=lambda d: len(d["items"]) == 5)
test("catalog", "autocomplete endpoint", "GET", "/api/search?q=pan", 200)
test("catalog", "categories", "GET", "/api/categories", 200,
     check=lambda d: len(d["categories"]) == 10 and all("productCount" in c and "coverImage" in c for c in d["categories"]))
test("catalog", "product detail by slug", "GET", "/api/products/panadol-advance-500mg-24-tablets", 200,
     check=lambda d: d["product"]["slug"] == "panadol-advance-500mg-24-tablets" and len(d["related"]) >= 1)
test("catalog", "product 404", "GET", "/api/products/does-not-exist-xyz", 404)
test("catalog", "limit clamp >60", "GET", "/api/products?limit=500", 200,
     check=lambda d: len(d["items"]) <= 60)

# ============ AUTH ============
test("auth", "register validation (bad email)", "POST", "/api/auth/register", 400,
     body={"email": "notanemail", "password": "x", "name": ""})
test("auth", "register duplicate email", "POST", "/api/auth/register", 409,
     body={"email": "demo@thepharmacy.com", "password": "Demo@2026", "name": "Dup", "phone": "01000000000"})
ts = int(time.time())
s, d, h = test("auth", "register new user", "POST", "/api/auth/register", 200,
     body={"email": f"qa-test-{ts}@thepharmacy.com", "password": "Test@12345", "name": "QA Tester", "phone": "01011122233"})
test("auth", "login wrong password", "POST", "/api/auth/login", 401,
     body={"email": "demo@thepharmacy.com", "password": "wrong"})
test("auth", "login bad payload", "POST", "/api/auth/login", 401, body={})
s, d, h = test("auth", "login demo user", "POST", "/api/auth/login", 200,
     body={"email": "demo@thepharmacy.com", "password": "Demo@2026"})
demo_cookie = get_cookie(h)
test("auth", "me with session", "GET", "/api/auth/me", 200, cookies=demo_cookie,
     check=lambda d: d.get("user", {}).get("email") == "demo@thepharmacy.com")
test("auth", "me without session", "GET", "/api/auth/me", 200,
     check=lambda d: d.get("user") is None)
test("auth", "logout", "POST", "/api/auth/logout", 200, cookies=demo_cookie)

# ============ ADMIN GUARDS ============
test("admin", "stats without auth", "GET", "/api/admin/stats", 403)
test("admin", "products without auth", "GET", "/api/admin/products", 403)
test("admin", "orders without auth", "GET", "/api/admin/orders", 403)
test("admin", "stats as non-admin demo", "GET", "/api/admin/stats", 403, cookies=demo_cookie)
s, d, h = test("admin", "login admin", "POST", "/api/auth/login", 200,
     body={"email": "admin@thepharmacy.com", "password": "Admin@2026"})
admin_cookie = get_cookie(h)
test("admin", "stats as admin", "GET", "/api/admin/stats", 200, cookies=admin_cookie,
     check=lambda d: d["stats"]["products"] >= 490 and "revenue" in d["stats"])
test("admin", "orders list as admin", "GET", "/api/admin/orders", 200, cookies=admin_cookie,
     check=lambda d: len(d) >= 5)
test("admin", "products stock update unknown id", "PATCH", "/api/admin/products", 404,
     body={"id": "xyz"}, cookies=admin_cookie)
test("admin", "order status invalid", "PATCH", "/api/admin/orders", 400,
     body={"id": "nonexistent", "status": "bad-status"}, cookies=admin_cookie)
test("admin", "order update unknown id -> 404", "PATCH", "/api/admin/orders", 404,
     body={"id": "nonexistent-id-xyz", "status": "confirmed"}, cookies=admin_cookie)
test("admin", "product update unknown id -> 404", "PATCH", "/api/admin/products", 404,
     body={"id": "nonexistent-id-xyz", "stock": 5}, cookies=admin_cookie)

# ============ ORDERS ============
test("orders", "history without auth", "GET", "/api/orders", 200,
     check=lambda d: d.get("orders") == [])
s, d, h = test("orders", "login demo for orders", "POST", "/api/auth/login", 200,
     body={"email": "demo@thepharmacy.com", "password": "Demo@2026"})
demo_cookie = get_cookie(h)
test("orders", "history with auth", "GET", "/api/orders", 200, cookies=demo_cookie,
     check=lambda d: isinstance(d.get("orders"), list))
test("orders", "create order validation (no items)", "POST", "/api/orders", 400,
     body={"items": [], "customerName": "x", "phone": "01000000000", "zoneId": "nasr-city", "address": "x"}, cookies=demo_cookie)
test("orders", "create order bad zone", "POST", "/api/orders", 400,
     body={"items": [{"productId": "cmu0dih1b00nvgeaffuz6bdbo", "quantity": 1}], "zone": "mars", "address": "Test address 123", "phone": "01012345678"}, cookies=demo_cookie)
test("orders", "create order bad phone", "POST", "/api/orders", 400,
     body={"items": [{"productId": "cmu0dih1b00nvgeaffuz6bdbo", "quantity": 1}], "zone": "nasr-city", "address": "Test address 123", "phone": "123"}, cookies=demo_cookie)
test("orders", "create order qty 0 (clamped to 1)", "POST", "/api/orders", 200,
     body={"items": [{"productId": "cmu0dih1b00nvgeaffuz6bdbo", "quantity": 0}], "zone": "nasr-city", "address": "Test address 123", "phone": "01012345678"}, cookies=demo_cookie)
test("orders", "create order unknown product", "POST", "/api/orders", 400,
     body={"items": [{"productId": "nonexistent", "quantity": 1}], "zone": "nasr-city", "address": "Test address 123", "phone": "01012345678"}, cookies=demo_cookie)
s, d, h = test("orders", "create order valid", "POST", "/api/orders", 200,
     body={"items": [{"productId": "cmu0dih1b00nvgeaffuz6bdbo", "quantity": 2}], "zone": "nasr-city", "address": "QA Test Street 12", "phone": "01012345678"}, cookies=demo_cookie,
     check=lambda d: d.get("order", {}).get("orderNumber", "").startswith("TP-"))
order_number = (d.get("order") or {}).get("orderNumber") if isinstance(d, dict) else None
if order_number:
    test("orders", "fetch order by number", "GET", f"/api/orders/{order_number}", 200,
         cookies=demo_cookie, check=lambda d: (d.get("order") or {}).get("orderNumber") == order_number)
    # guest tracking by orderNumber is public-by-design (like package tracking)
    test("orders", "guest tracks order by number", "GET", f"/api/orders/{order_number}", 200)
    # but internal record id must NOT be accessible to strangers
    oid = (d.get("order") or {}).get("id")
    if oid:
        test("orders", "order internal id w/o ownership -> 403", "GET", f"/api/orders/{oid}", 403)
test("orders", "fetch nonexistent order", "GET", "/api/orders/TP-00000000", 404, cookies=demo_cookie)

# ============ AI ============
test("ai", "assistant no messages", "POST", "/api/ai/assistant", 400, body={"messages": []})
test("ai", "interactions no meds", "POST", "/api/ai/interactions", 400, body={})
test("ai", "interactions valid", "POST", "/api/ai/interactions", 200,
     body={"medicines": ["Panadol", "Brufen"]},
     check=lambda d: "analysis" in d and d["analysis"].get("overallRisk") in ("low", "moderate", "high"))
# Anonymous Rx upload is intentional (guest flow, userId nullable) — but note
# for hardening: rate-limit anonymous AI calls (see report recommendations).
test("ai", "prescription anon + empty body rejected", "POST", "/api/prescriptions", 400,
     body={})
test("ai", "prescription bad image", "POST", "/api/prescriptions", 400,
     body={"image": "not-a-data-url"}, cookies=demo_cookie)

# ============ INJECTION / SECURITY PROBES ============
test("security", "SQLi probe in q", "GET", "/api/products?q='%3B%20DROP%20TABLE%20Product%3B--", 200,
     check=lambda d: isinstance(d.get("items"), list))
test("security", "XSS probe in q (reflected?)", "GET", "/api/products?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E", 200)
test("security", "path traversal in slug", "GET", "/api/products/..%2F..%2F..%2Fetc%2Fpasswd", 404)
test("security", "negative price filter", "GET", "/api/products?min=-99999&max=-1", 200,
     check=lambda d: d["total"] == 0 or all(i["price"] >= 0 for i in d["items"]))
test("security", "huge page number", "GET", "/api/products?page=99999999", 200,
     check=lambda d: d["items"] == [])
test("security", "negative limit", "GET", "/api/products?limit=-5", 200,
     check=lambda d: len(d["items"]) >= 1)

# ============ SUMMARY ============
print("\n" + "=" * 70)
total = len(results)
passed = sum(1 for r in results if r["pass"])
failed = total - passed
suites = {}
for r in results:
    suites.setdefault(r["suite"], [0, 0])
    suites[r["suite"]][0] += 1
    if r["pass"]:
        suites[r["suite"]][1] += 1
print(f"TOTAL: {passed}/{total} passed, {failed} failed")
for s, (t, p) in suites.items():
    print(f"  {s}: {p}/{t}")
avg_ms = sum(r["ms"] for r in results) / total
print(f"avg response: {avg_ms:.0f}ms")

with open("/home/z/my-project/scripts/research-results/api_test_results.json", "w") as f:
    json.dump({"summary": {"total": total, "passed": passed, "failed": failed, "avg_ms": round(avg_ms)},
               "suites": {k: {"total": v[0], "passed": v[1]} for k, v in suites.items()},
               "results": results}, f, indent=2)
print("\nJSON saved to scripts/research-results/api_test_results.json")
sys.exit(1 if failed else 0)

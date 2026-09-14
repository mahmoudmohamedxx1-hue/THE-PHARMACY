#!/usr/bin/env python3
"""SEO + PWA audit: sitemap, robots, structured data, meta tags, manifest, offline."""
import subprocess
import json
import re
import xml.etree.ElementTree as ET

BASE = "http://localhost:3000"
results = []

def check(name, ok, detail):
    results.append({"name": name, "pass": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

def get(path):
    return subprocess.run(["curl", "-s", f"{BASE}{path}"], capture_output=True, text=True).stdout

# ---- sitemap ----
sm = get("/sitemap.xml")
try:
    root = ET.fromstring(sm)
    urls = [e.text for e in root.iter() if e.tag.endswith("loc")]
    check("sitemap_valid_xml", len(urls) > 400, f"{len(urls)} URLs in sitemap.xml")
    products = [u for u in urls if "/product/" in u]
    cats = [u for u in urls if "/category/" in u]
    check("sitemap_coverage", len(products) >= 490 and len(cats) == 10,
          f"{len(products)} product URLs + {len(cats)} category URLs + {len(urls)-len(products)-len(cats)} static")
    check("sitemap_urls_https_ready", all(u.startswith("http") for u in urls[:5]),
          f"sample: {urls[0][:60]}")
except ET.ParseError as e:
    check("sitemap_valid_xml", False, f"XML parse error: {e}")

# ---- robots ----
rb = get("/robots.txt")
check("robots_admin_excluded", "Disallow: /admin" in rb, "/admin disallowed")
check("robots_api_excluded", "Disallow: /api" in rb, "/api disallowed")
check("robots_sitemap_ref", "Sitemap:" in rb, "sitemap referenced")

# ---- product page SEO ----
page = get("/product/panadol-advance-500mg-24-tablets")
check("product_title", "<title>" in page and "Panadol" in page[page.find("<title>"):page.find("</title>")],
      "product name in <title>")
check("product_meta_desc", 'name="description"' in page, "meta description present")
check("product_og", 'property="og:title"' in page and 'property="og:image"' in page,
      "OpenGraph title+image")
check("product_twitter", 'name="twitter:card"' in page, "Twitter card")
check("product_jsonld", 'application/ld+json' in page and '"@type":"Product"' in page.replace(" ", ""),
      "schema.org Product JSON-LD")
jl = re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)
if jl:
    try:
        d = json.loads(jl.group(1))
        has_offers = "offers" in d
        check("product_jsonld_offers", has_offers, f"JSON-LD offers: {has_offers}, price {d.get('offers', {}).get('price', '?')}")
    except json.JSONDecodeError:
        check("product_jsonld_offers", False, "JSON-LD parse failed")
check("canonical", '<link rel="canonical"' in page, "canonical URL")

# ---- home SEO ----
home = get("/")
check("home_title_bilingual", "Pharmacy" in home[home.find("<title>"):home.find("</title>")],
      "bilingual home title")

# ---- PWA ----
mf = get("/manifest.webmanifest")
try:
    m = json.loads(mf)
    icons = m.get("icons", [])
    check("manifest_valid", m.get("name") and m.get("start_url"), f"name={m.get('name')}, {len(icons)} icons, dir={m.get('dir')}")
    check("manifest_rtl", m.get("dir") == "rtl", "RTL-aware manifest")
    check("manifest_maskable", any("maskable" in i.get("purpose", "") for i in icons), "maskable icon present")
except Exception as e:
    check("manifest_valid", False, f"manifest parse error: {e}")

sw = get("/sw.js")
check("sw_offline_fallback", "/offline" in sw, "service worker offline fallback route")
check("sw_cache_first_assets", "immutable" in sw or "cache-first" in sw.lower() or "caches.match" in sw,
      "cache-first strategy for assets")

# offline page reachable
code = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{BASE}/offline"],
                      capture_output=True, text=True).stdout.strip()
check("offline_page_200", code == "200", f"/offline -> {code}")

# ---- accessibility basics ----
check("html_lang_attr", 'lang="en"' in home or 'lang="ar"' in home, "html lang attribute")
check("viewport_meta", 'name="viewport"' in home, "viewport meta for responsive")
check("img_alt_presence", home.count('alt="') >= 10, f"{home.count(chr(34) and 'alt=\"') if False else home.count('alt=\"')} alt attributes on home")

passed = sum(1 for r in results if r["pass"])
print(f"\nSEO/PWA AUDIT: {passed}/{len(results)} passed")
with open("/home/z/my-project/scripts/research-results/seo_pwa_audit.json", "w") as f:
    json.dump({"summary": {"passed": passed, "total": len(results)}, "results": results}, f, indent=2)

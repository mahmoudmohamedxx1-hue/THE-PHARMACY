#!/usr/bin/env python3
"""Performance benchmark suite: TTFB, payload sizes, cache headers, cold/warm."""
import subprocess
import json
import statistics
import urllib.request

BASE = "http://localhost:3000"
ROUTES = [
    ("home", "/"),
    ("category", "/category/vitamins"),
    ("product", "/product/panadol-advance-500mg-24-tablets"),
    ("search", "/search/panadol"),
    ("cart", "/cart"),
    ("checkout", "/checkout"),
    ("login", "/login"),
    ("orders", "/orders"),
    ("assistant", "/assistant"),
    ("prescription", "/prescription"),
    ("interactions", "/interactions"),
    ("admin", "/admin"),
    ("offline", "/offline"),
    ("api products", "/api/products?limit=24"),
    ("api categories", "/api/categories"),
    ("sitemap", "/sitemap.xml"),
]

def curl_w(fmt, path, extra=None):
    args = ["curl", "-s", "-o", "/dev/null", "-w", fmt, f"{BASE}{path}"] + (extra or [])
    return subprocess.run(args, capture_output=True, text=True).stdout.strip()

results = {"routes": [], "payload": {}, "cache_headers": {}, "browser": {}}

print("=== Route latency (3 warm runs each, median) ===")
for name, path in ROUTES:
    # warm-up
    curl_w("%{http_code}", path)
    tt = []
    sizes = []
    for _ in range(3):
        out = curl_w("%{time_starttransfer} %{size_download}", path)
        t, s = out.split()
        tt.append(float(t) * 1000)
        sizes.append(int(s))
    med = statistics.median(tt)
    ok = med < 800
    results["routes"].append({"name": name, "path": path, "ttfb_ms": round(med, 1),
                              "size_kb": round(statistics.median(sizes) / 1024, 1), "ok": ok})
    print(f"  {name:16s} TTFB {med:7.1f}ms  {statistics.median(sizes)/1024:8.1f} KB")

# ---- payload analysis on home ----
print("\n=== Home page payload ===")
html = subprocess.run(["curl", "-s", f"{BASE}/"], capture_output=True, text=True).stdout
import re
scripts = re.findall(r'src="([^"]+\.js[^"]*)"', html)
total_js = 0
total_gz = 0
for s in scripts:
    raw = int(subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{size_download}", f"{BASE}{s}"],
              capture_output=True, text=True).stdout or 0)
    gz = int(subprocess.run(["curl", "-s", "-H", "Accept-Encoding: gzip", "-o", "/dev/null", "-w", "%{size_download}", f"{BASE}{s}"],
              capture_output=True, text=True).stdout or 0)
    total_js += raw
    total_gz += gz
results["payload"] = {
    "html_kb": round(len(html) / 1024, 1),
    "js_files": len(scripts),
    "js_kb": round(total_js / 1024, 1),
    "js_gz_kb": round(total_gz / 1024, 1),
    "ssr_imgs": html.count("<img"),
}
print(f"  HTML: {len(html)/1024:.1f} KB with {html.count('<img')} SSR images")
print(f"  JS: {len(scripts)} files, {total_js/1024:.0f} KB raw / {total_gz/1024:.0f} KB gzipped")

# ---- cache headers ----
print("\n=== Cache headers ===")
for name, path in [("images", "/images/products/panadol-advance-500mg-24-tablets.webp"),
                   ("icons", "/icons/icon-192.png"),
                   ("sw", "/sw.js"),
                   ("manifest", "/manifest.webmanifest")]:
    h = subprocess.run(["curl", "-s", "-D", "-", "-o", "/dev/null", f"{BASE}{path}"],
                       capture_output=True, text=True).stdout
    cc = next((l.split(":", 1)[1].strip() for l in h.split("\n") if l.lower().startswith("cache-control")), "MISSING")
    results["cache_headers"][name] = cc
    print(f"  {name:10s} {cc}")

# ---- cold cache: first-hit dynamic pages ----
print("\n=== Cold-hit dynamic routes (fresh URL) ===")
import time
for name, path in [("product cold", f"/product/vitamin-d3-5000-iu-60-capsules?cb={int(time.time())}"),
                   ("search cold", f"/search/vitamin?cb={int(time.time())}")]:
    t = curl_w("%{time_starttransfer}", path)
    print(f"  {name:16s} {float(t)*1000:.1f}ms")

with open("/home/z/my-project/scripts/research-results/perf_audit.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nsaved to scripts/research-results/perf_audit.json")

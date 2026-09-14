#!/usr/bin/env python3
"""Merge Template 07 cover + ReportLab body into the final report PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page

ASSETS = "/home/z/my-project/scripts/report-assets"
OUT = "/home/z/my-project/download/The_Pharmacy_QA_Audit_and_Strategy_Report.pdf"

writer = PdfWriter()
writer.add_page(normalize(PdfReader(f"{ASSETS}/cover.pdf").pages[0]))
for page in PdfReader(f"{ASSETS}/body.pdf").pages:
    writer.add_page(normalize(page))
writer.add_metadata({
    "/Title": "The Pharmacy QA Audit and Strategic Position Report",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Comprehensive quality audit, market position, and 90-day roadmap",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("merged:", OUT, "-", len(writer.pages), "pages")

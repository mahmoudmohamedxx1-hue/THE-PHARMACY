/**
 * Medication-name extraction from prescription OCR output.
 *
 * Strict: a "MEDICATIONS: a; b; c" line (the OCR prompt's requested format).
 * Loose: some vision models answer narratively ("Based on the image…:
 * 1. **Panadol Extra**: 500mg…") — recover names from markdown-bold items
 * and "N. Name:" numbered lines so those answers still match the catalog.
 */

function clean(s: string): string {
  // trim first: items after "MEDICATIONS:" or ", " separators carry a leading
  // space which would break the ^-anchored numbering strip
  return s
    .trim()
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function parseMedicationNames(extracted: string): string[] {
  const medsLine =
    extracted.split("\n").find((l) => l.toLowerCase().startsWith("medications:")) || "";
  const strict = medsLine
    .replace(/^medications:/i, "")
    .split(/[;,\n]/)
    .map(clean)
    .filter(Boolean);
  if (strict.length) return strict.slice(0, 12);

  // loose #1: markdown bold names "**Panadol Extra**:" (bullets or headings)
  const bold: string[] = [];
  for (const m of extracted.matchAll(/\*\*([^*\n]{3,60})\*\*/g)) {
    const name = clean(m[1]);
    if (
      name &&
      !/^(?:based|here|image|prescription|medication|dosage|note)/i.test(name)
    ) {
      bold.push(name);
    }
  }
  if (bold.length) return bold.slice(0, 12);

  // loose #2: numbered/bulleted "1. Panadol Extra: 500mg" / "- Panadol — 1 tab"
  const numbered: string[] = [];
  for (const m of extracted.matchAll(
    /^\s*(?:\d+[\.\)]|[-•*])\s*([A-Za-z\u0600-\u06FF][^:\n]{2,60})\s*(?:[:—-]|$)/gm,
  )) {
    const name = clean(m[1]);
    // skip generic line-openers and pure dosage fragments
    if (
      name &&
      !/^(?:based|here|the image|image|above|following)$/i.test(name) &&
      !/^\d/.test(name)
    ) {
      numbered.push(name);
    }
  }
  return numbered.slice(0, 12);
}

// Pure checkout/order logic — extracted from the API route so it can be
// unit-tested (tests/*.test.ts) without spinning up a server or database.

import { FREE_DELIVERY_THRESHOLD, type Zone } from "@/lib/zones";

/** Egyptian mobile numbers: 010/011/012/015 + 8 digits, optional +20 prefix. */
export const EGYPT_PHONE_RE = /^(\+?2?01)[0-9]{9}$/;

export function normalizePhone(raw: unknown): string {
  return String(raw ?? "").replace(/[\s-]/g, "");
}

export function isValidEgyptPhone(raw: unknown): boolean {
  return EGYPT_PHONE_RE.test(normalizePhone(raw));
}

/** Clamp requested quantity into the shop-wide 1..20 range. */
export function clampQty(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

/** Free delivery above the threshold, otherwise the zone fee. */
export function computeDeliveryFee(subtotal: number, zone: Pick<Zone, "fee">): number {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : zone.fee;
}

/** Round to 2 decimals (money). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human-friendly order number: TP-XXXXXX-XXXX style suffixes. */
export function generateOrderNumber(): string {
  return `TP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 9000 + 1000)}`;
}

/** Minimal address sanity: at least 8 characters after trimming. */
export function isValidAddress(raw: unknown): boolean {
  return String(raw ?? "").trim().length >= 8;
}

/** CSV cell escaping (RFC 4180): quote-wrap when needed, double inner quotes. */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full CSV document: BOM (Excel-friendly Arabic) + CRLF rows. */
export function toCsv(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows.map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

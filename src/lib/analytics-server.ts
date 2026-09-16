// Server-side analytics recorder — writes first-party commerce events
// into the AnalyticsEvent table (see prisma/schema.prisma).

import { db } from "@/lib/db";

export const TRACK_TYPES = [
  "page_view",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
] as const;

export type TrackType = (typeof TRACK_TYPES)[number];

const RETENTION_DAYS = 90;
const PURGE_PROBABILITY = 0.01;

export interface TrackPayload {
  type: TrackType;
  path?: string;
  productId?: string | null;
  sessionId?: string | null;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget event write; must never throw into a request path. */
export async function recordEvent(p: TrackPayload): Promise<void> {
  try {
    let productId: string | null = null;
    if (p.productId) {
      // resolve by id OR slug — the client tracker knows slugs
      const prod = await db.product.findFirst({
        where: { OR: [{ id: p.productId }, { slug: p.productId }] },
        select: { id: true },
      });
      productId = prod?.id ?? null;
    }
    await db.analyticsEvent.create({
      data: {
        type: p.type,
        path: String(p.path ?? "").slice(0, 200),
        productId,
        sessionId: String(p.sessionId ?? "").slice(0, 64),
        meta: JSON.stringify(p.meta ?? {}).slice(0, 500),
      },
    });
    // opportunistic retention cleanup (keeps SQLite lean)
    if (Math.random() < PURGE_PROBABILITY) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
      db.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
    }
  } catch (e) {
    console.error("[analytics] record failed", e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { recordEvent, TRACK_TYPES, type TrackType } from "@/lib/analytics-server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// First-party analytics ingest. POST-only, rate-limited, no PII.
// The service worker never caches POSTs, so this is safe with the sw active.
export async function POST(req: NextRequest) {
  try {
    // generous per-IP cap: 120 events/min (a browsing burst should never hit it)
    if (!rateLimit(`an:${clientIp(req)}`, 120, 60_000)) {
      return new NextResponse(null, { status: 429 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new NextResponse(null, { status: 400 });
    }
    const { type, path, productId, sessionId, meta } = body as {
      type?: string;
      path?: string;
      productId?: string;
      sessionId?: string;
      meta?: Record<string, unknown>;
    };
    if (!TRACK_TYPES.includes(type as TrackType)) {
      return new NextResponse(null, { status: 400 });
    }
    // path must be a same-origin pathname
    const cleanPath = String(path ?? "/").startsWith("/")
      ? String(path).slice(0, 200)
      : "/";
    await recordEvent({
      type: type as TrackType,
      path: cleanPath,
      productId: productId || null,
      sessionId: sessionId || null,
      meta,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[analytics] ingest error", e);
    return new NextResponse(null, { status: 500 });
  }
}

// Client-side event tracker.
// Every commerce event fans out to three sinks (whichever are configured):
//   1. GA4 (gtag)        — when NEXT_PUBLIC_GA_ID is set
//   2. Meta Pixel (fbq)  — when NEXT_PUBLIC_META_PIXEL_ID is set
//   3. First-party store — POST /api/analytics (always on, powers the
//      admin dashboard funnel; anonymous localStorage id, no PII)

type TrackType =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase";

// Pixel wants its own standard event names
const PIXEL_MAP: Record<TrackType, string> = {
  page_view: "PageView",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** Stable anonymous browser id (localStorage, not auth — no PII). */
export function anonId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem("tp_aid");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem("tp_aid", id);
    }
    return id;
  } catch {
    return "";
  }
}

export function trackEvent(
  type: TrackType,
  opts: {
    path?: string;
    productId?: string;
    value?: number;
    orderId?: string;
    name?: string;
  } = {}
): void {
  if (typeof window === "undefined") return;
  const { gtag, fbq } = window;
  try {
    gtag?.("event", type, {
      path: opts.path,
      items: opts.productId ? [{ item_id: opts.productId }] : undefined,
      value: opts.value,
      currency: "EGP",
      transaction_id: opts.orderId,
    });
    fbq?.("track", PIXEL_MAP[type], {
      content_ids: opts.productId ? [opts.productId] : undefined,
      content_type: "product",
      value: opts.value,
      currency: "EGP",
    });
    // First-party store — sendBeacon survives page navigation
    const body = JSON.stringify({
      type,
      path: opts.path,
      productId: opts.productId,
      sessionId: anonId(),
      meta: {
        value: opts.value,
        orderId: opts.orderId,
        name: opts.name,
      },
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // analytics must never break the UX
  }
}

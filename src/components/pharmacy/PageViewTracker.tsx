"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/track";

/**
 * Fires a page_view on every route change (including the first render) to
 * GA4 / Meta Pixel / the first-party analytics store. Mounted once in the
 * root layout — usePathname re-renders it on client-side navigation.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    trackEvent("page_view", { path: pathname });
  }, [pathname]);

  return null;
}

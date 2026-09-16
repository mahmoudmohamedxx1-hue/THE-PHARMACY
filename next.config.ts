import type { NextConfig } from "next";

// Same deployment pattern as the other apps in this workspace family
// (netstream / egxdesk): `output: "standalone"` is unconditional — the
// sandbox/VPS runtime serves .next/standalone/server.js, while Vercel
// builds its own output and simply ignores the standalone folder.
const isDev = process.env.NODE_ENV !== "production";

// Analytics IDs are baked in at build time; CSP only needs to open the
// corresponding third-party origins when an ID is actually configured.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

const cspScriptExtra =
  (GA_ID ? " https://www.googletagmanager.com" : "") +
  (PIXEL_ID ? " https://connect.facebook.net" : "");
const cspImgExtra =
  (GA_ID ? " https://www.googletagmanager.com https://www.google-analytics.com" : "") +
  (PIXEL_ID ? " https://www.facebook.com" : "");
const cspConnectExtra =
  (GA_ID
    ? " https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com"
    : "") +
  (PIXEL_ID ? " https://www.facebook.com" : "");

// Pragmatic CSP: Next.js ships inline bootstrap scripts (hydration payload)
// so script-src needs 'unsafe-inline'; dev mode additionally requires eval
// for React Fast Refresh. Everything else is locked to same-origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${cspScriptExtra}`,
  // Tailwind + component-level inline styles
  "style-src 'self' 'unsafe-inline'",
  // local product photos, data: fallbacks, blob: file previews, analytics pixels
  `img-src 'self' data: blob:${cspImgExtra}`,
  // next/font serves fonts self-hosted from /_next/static
  "font-src 'self' data:",
  `connect-src 'self'${cspConnectExtra}`,
  // PWA service worker
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Allow our own origin + the sandbox preview embed; block everyone else
  "frame-ancestors 'self' https://*.space-z.ai",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Allow the preview proxy origin to access the dev server without warnings.
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
  // next/image on-the-fly optimization (avif/webp via sharp)
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
  },
  // Ship the committed SQLite catalog + prisma engine inside every serverless
  // function that reads the database (catalog APIs, SSR product pages, sitemap).
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/custom.db", "./node_modules/.prisma/**/*"],
    "/product/[slug]": ["./db/custom.db", "./node_modules/.prisma/**/*"],
    "/category/[slug]": ["./db/custom.db", "./node_modules/.prisma/**/*"],
    "/sitemap.xml": ["./db/custom.db", "./node_modules/.prisma/**/*"],
  },
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates land quickly
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // Product photos: filenames are stable — cache hard for repeat visits
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // PWA icons / splash screens
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // ---- Security headers on every route ----
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Legacy framing protection for older browsers; modern browsers honor
          // CSP frame-ancestors above (self + space-z.ai preview only).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

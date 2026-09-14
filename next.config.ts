import type { NextConfig } from "next";

// Same deployment pattern as the other apps in this workspace family
// (netstream / egxdesk): `output: "standalone"` is unconditional — the
// sandbox/VPS runtime serves .next/standalone/server.js, while Vercel
// builds its own output and simply ignores the standalone folder.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Allow the preview proxy origin to access the dev server without warnings.
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
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
    ];
  },
};

export default nextConfig;

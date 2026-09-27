/**
 * Canonical site-URL resolution shared by sitemap, robots, layout metadata
 * and per-route generateMetadata calls.
 *
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL — explicit override (custom domain, self-hosting).
 *   2. VERCEL_PROJECT_PRODUCTION_URL — auto-set by Vercel for the production
 *      domain (e.g. "the-pharmacy-two.vercel.app"), present at build AND
 *      runtime, so it also works for force-dynamic sitemap/robots.
 *   3. VERCEL_URL — auto-set per deployment (preview deployments get their
 *      own URL; correct canonicals for preview links).
 *   4. http://localhost:3000 — local dev / sandbox preview.
 *
 * Without the Vercel fallbacks every sitemap/robots/OG/canonical URL on a
 * Vercel deployment silently degraded to http://localhost:3000, which told
 * search engines and social crawlers the wrong origin.
 */

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit.startsWith("http") ? explicit : `https://${explicit}`);

  // Vercel injects these automatically — no project settings needed.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return vercelUrl.startsWith("http") ? stripTrailingSlash(vercelUrl) : `https://${vercelUrl}`;

  return "http://localhost:3000";
}

/** Resolved once per process — the value every SEO/OG surface uses. */
export const SITE_URL = resolveSiteUrl();

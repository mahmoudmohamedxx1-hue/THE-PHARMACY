import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZAI, getAIStatus } from "@/lib/ai";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Deployment health / configuration diagnostics.
 *
 * One glance tells you what is wired up on the current deployment:
 *   - database mode: the bundled SQLite catalog (read-only demo that resets
 *     on serverless cold starts) vs a persistent DATABASE_URL
 *   - AI features: enabled via .z-ai-config or ZAI_API_KEY, or off
 *   - transactional email: RESEND_API_KEY present or not
 *   - catalog size + resolved site URL (SEO/OG sanity)
 *
 * Deliberately exposes only booleans/counts/URLs — never values of secrets.
 */
export async function GET() {
  const [productCount, categoryCount] = await Promise.all([
    db.product.count(),
    db.category.count(),
  ]);

  const zai = await getZAI();

  // Persistent = an explicit DATABASE_URL that is NOT the bundled-file
  // fallback (db.ts falls back to a per-instance /tmp copy on serverless).
  const envUrl = process.env.DATABASE_URL || "";
  const dbMode = envUrl && !envUrl.startsWith("file:") ? "persistent" : "bundled-sqlite";

  return NextResponse.json({
    status: "ok",
    siteUrl: SITE_URL,
    database: {
      mode: dbMode,
      persistent: dbMode === "persistent",
      note:
        dbMode === "persistent"
          ? "DATABASE_URL is set — data survives restarts and is shared across instances."
          : "Using the bundled SQLite catalog. On serverless (Vercel) writes are per-instance and reset on cold start — set DATABASE_URL to a hosted database for durable orders/accounts.",
      products: productCount,
      categories: categoryCount,
    },
    ai: {
      ...getAIStatus(zai !== null),
      note:
        zai !== null
          ? "AI features are active via the GLM SDK (assistant, prescription reader, drug interactions), with a keyless free-model pool as fallback."
          : "AI features are active via the keyless free-model pool (Pollinations / Kilo / LLM7 — no credentials needed). Set ZAI_API_KEY to prefer GLM.",
    },
    email: {
      enabled: Boolean(process.env.RESEND_API_KEY),
      note: process.env.RESEND_API_KEY
        ? "Order-confirmation emails will be sent via Resend."
        : "Emails are skipped silently. Set RESEND_API_KEY (+ EMAIL_FROM) to send order confirmations.",
    },
  });
}

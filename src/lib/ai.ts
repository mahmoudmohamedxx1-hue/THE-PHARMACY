import ZAI from "z-ai-web-dev-sdk";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;

let cachedInstance: ZAIInstance | null | undefined;

/**
 * Returns the ZAI SDK instance, or null when AI is not configured on this
 * deployment. All AI routes degrade gracefully with a friendly bilingual
 * message instead of a 500.
 *
 * Configuration sources, in order:
 *
 *   1. A `.z-ai-config` JSON file in the project root / $HOME / /etc —
 *      this is what the z.ai sandbox provisiones automatically and what
 *      self-hosted deployments can commit. (SDK default discovery.)
 *
 *   2. Environment variables ZAI_API_KEY (+ optional ZAI_BASE_URL) — the
 *      right way for Vercel/serverless: set ZAI_API_KEY in the project's
 *      Environment Variables and every AI route lights up. Implemented by
 *      materialising a config file into a writable temp dir and pointing
 *      $HOME there just for the SDK's one-time create() discovery, then
 *      restoring $HOME (the SDK caches the config on the instance).
 *
 * To enable AI on any deployment either commit `.z-ai-config`
 *   {"baseUrl": "https://api.z.ai/v1", "apiKey": "<your key>"}
 * or set ZAI_API_KEY (and optionally ZAI_BASE_URL) in the environment.
 */
/**
 * Materialise a `.z-ai-config` file from ZAI_API_KEY (+ ZAI_BASE_URL) into a
 * fresh writable temp dir and return the dir path, or null when no key is
 * set. Exported for tests.
 */
export function zaiEnvBootstrapDir(): string | null {
  if (!process.env.ZAI_API_KEY) return null;
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "zai-cfg-"));
  fs.writeFileSync(
    path.join(cfgDir, ".z-ai-config"),
    JSON.stringify({
      baseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai/v1",
      apiKey: process.env.ZAI_API_KEY,
    }),
  );
  return cfgDir;
}

export async function getZAI(): Promise<ZAIInstance | null> {
  if (cachedInstance !== undefined) return cachedInstance;
  try {
    cachedInstance = await ZAI.create();
    return cachedInstance;
  } catch {
    // fall through to env-var bootstrap
  }

  const cfgDir = zaiEnvBootstrapDir();
  if (cfgDir) {
    try {
      // The SDK's config discovery checks $HOME/.z-ai-config. Point HOME at
      // our temp dir only during create() — the SDK reads the config once
      // into the instance, so restoring immediately afterwards is safe.
      const prevHome = process.env.HOME;
      process.env.HOME = cfgDir;
      try {
        cachedInstance = await ZAI.create();
        console.log("[ai] configured via ZAI_API_KEY environment variable");
      } finally {
        if (prevHome === undefined) delete process.env.HOME;
        else process.env.HOME = prevHome;
      }
    } catch {
      cachedInstance = null;
    }
  } else {
    cachedInstance = null;
  }
  return cachedInstance;
}

export const AI_UNAVAILABLE_AR =
  "خدمات الذكاء الاصطناعي غير مفعّلة على هذا النشر حالياً — يعمل باقي الموقع بشكل طبيعي. يمكن للمسؤول تفعيلها عبر متغير البيئة ZAI_API_KEY في إعدادات المنصة.";
export const AI_UNAVAILABLE_EN =
  "AI features are not enabled on this deployment yet — everything else on the site works normally. An admin can enable them by setting the ZAI_API_KEY environment variable in the hosting settings.";

export function isAiUnavailableResponse(status: number, body: unknown): boolean {
  return status === 503 && typeof body === "object" && body !== null && "error" in body &&
    (body as { error?: string }).error === "ai_unavailable";
}

export function aiUnavailablePayload(lang?: string) {
  const isArabic = lang === "ar";
  return { error: "ai_unavailable", message: isArabic ? AI_UNAVAILABLE_AR : AI_UNAVAILABLE_EN };
}

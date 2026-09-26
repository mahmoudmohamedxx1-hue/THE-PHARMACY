import ZAI from "z-ai-web-dev-sdk";

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;

let cachedInstance: ZAIInstance | null | undefined;

/**
 * Returns the ZAI SDK instance, or null when AI is not configured on this
 * deployment (e.g. Vercel: no .z-ai-config in cwd/home/etc). All AI routes
 * degrade gracefully with a friendly bilingual message instead of a 500.
 *
 * To enable AI on any deployment, add a .z-ai-config file at the project root:
 *   {"baseUrl": "https://api.z.ai/v1", "apiKey": "<your key>"}
 * (the sandbox preview gets one automatically; self-hosted/Vercel need it
 * committed or baked into the image).
 */
export async function getZAI(): Promise<ZAIInstance | null> {
  if (cachedInstance !== undefined) return cachedInstance;
  try {
    cachedInstance = await ZAI.create();
  } catch {
    cachedInstance = null;
  }
  return cachedInstance;
}

export const AI_UNAVAILABLE_AR =
  "خدمات الذكاء الاصطناعي غير مفعّلة على هذا النشر حالياً. يمكن للمسؤول تفعيلها بإضافة ملف .z-ai-config يحتوي على مفتاح API في جذر المشروع.";
export const AI_UNAVAILABLE_EN =
  "AI features are not enabled on this deployment yet. An admin can enable them by adding a .z-ai-config file with an API key at the project root.";

export function isAiUnavailableResponse(status: number, body: unknown): boolean {
  return status === 503 && typeof body === "object" && body !== null && "error" in body &&
    (body as { error?: string }).error === "ai_unavailable";
}

export function aiUnavailablePayload(lang?: string) {
  const isArabic = lang === "ar";
  return { error: "ai_unavailable", message: isArabic ? AI_UNAVAILABLE_AR : AI_UNAVAILABLE_EN };
}

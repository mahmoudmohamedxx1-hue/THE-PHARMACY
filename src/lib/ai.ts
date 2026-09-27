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
  "خدمات الذكاء الاصطناعي غير متاحة حالياً — يعمل باقي الموقع بشكل طبيعي. حاول مرة أخرى بعد قليل.";
export const AI_UNAVAILABLE_EN =
  "AI features are temporarily unavailable — everything else on the site works normally. Please try again in a moment.";

export function isAiUnavailableResponse(status: number, body: unknown): boolean {
  return status === 503 && typeof body === "object" && body !== null && "error" in body &&
    (body as { error?: string }).error === "ai_unavailable";
}

export function aiUnavailablePayload(lang?: string) {
  const isArabic = lang === "ar";
  return { error: "ai_unavailable", message: isArabic ? AI_UNAVAILABLE_AR : AI_UNAVAILABLE_EN };
}

// ---------------------------------------------------------------------------
// Unified chat completion: GLM SDK first, then a keyless free-model pool.
//
// The keyless pool mirrors the audited provider catalog of freellmpool
// (github.com/0xzr/freellmpool): public OpenAI-compatible endpoints that
// require NO API key (Pollinations, Kilo Gateway, LLM7). This lets every AI
// route work out of the box on any deployment — including Vercel — without
// credentials, while ZAI (GLM) remains the preferred primary provider when
// it is available (keyless inside the z.ai sandbox, ZAI_API_KEY elsewhere).
//
// Set FREE_LLM_POOL=off to disable the keyless fallbacks (ZAI only).
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  provider: string;
}

interface KeylessProvider {
  id: string;
  url: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

const KEYLESS_PROVIDERS: KeylessProvider[] = [
  {
    id: "pollinations",
    url: "https://text.pollinations.ai/openai/chat/completions",
    model: "openai-fast",
    maxTokens: 1024,
    timeoutMs: 15000,
  },
  {
    id: "kilo",
    url: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "stepfun/step-3.7-flash:free",
    maxTokens: 2048,
    timeoutMs: 15000,
  },
  {
    id: "llm7",
    url: "https://api.llm7.io/v1/chat/completions",
    model: "default",
    maxTokens: 1024,
    timeoutMs: 8000,
  },
];

// ---------------------------------------------------------------------------
// Response sanity guards.
//
// Free keyless endpoints route to rotating models, and two failure shapes
// look "successful" to a naive content check:
//   1. Safety-classifier outputs (Kilo `openrouter/free` currently routes to
//      nvidia/nemotron content-safety, which replies "User Safety: safe").
//   2. Bare refusals ("I'm sorry, but I can't help with that.").
// Both must be rejected so the chain falls through to the next provider
// instead of surfacing garbage as an assistant answer or OCR text.
// ---------------------------------------------------------------------------

/** Output of a content-safety classifier model — never a usable answer. */
export function isSafetyClassifierOutput(content: string): boolean {
  const t = content.trim();
  return t.length < 250 && /^(?:user|response|prompt)\s+safety\s*:/i.test(t);
}

/** A short, bare refusal with no substantive content. Longer answers that
 *  merely open apologetically ("I'm sorry to hear that — here is what…") are
 *  NOT caught, so genuine pharmacist-style replies always pass. */
export function isBareRefusal(content: string): boolean {
  const t = content.trim();
  if (t.length >= 200) return false;
  return /\b(?:i'?m sorry|i am sorry|sorry)[\s,]*\b|\b(?:can'?t|cannot|unable to)\s+(?:help|assist|comply|provide)\b/i.test(t) &&
    /sorry|can'?t|cannot|unable/i.test(t);
}

function usableContent(content: string): boolean {
  return content.trim().length > 0 && !isSafetyClassifierOutput(content) && !isBareRefusal(content);
}

/** ZAI model to request (the sandbox gateway accepts glm-5.3-flash). */
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-5.3-flash";

// Sticky routing: remember the last keyless provider that answered so
// subsequent requests try it first instead of re-walking the chain.
let stickyKeyless: string | null = null;
const keylessFailUntil = new Map<string, number>();
const FAIL_COOLDOWN_MS = 60_000;

function keylessPoolEnabled(): boolean {
  const v = (process.env.FREE_LLM_POOL || "").toLowerCase();
  return v !== "off" && v !== "false" && v !== "0";
}

function orderedKeylessProviders(): KeylessProvider[] {
  const now = Date.now();
  const alive = KEYLESS_PROVIDERS.filter(
    (p) => (keylessFailUntil.get(p.id) || 0) <= now,
  );
  if (!stickyKeyless) return alive;
  const sticky = alive.find((p) => p.id === stickyKeyless);
  if (!sticky) return alive;
  return [sticky, ...alive.filter((p) => p.id !== stickyKeyless)];
}

async function callKeyless(
  p: KeylessProvider,
  messages: ChatMessage[],
  temperature: number,
): Promise<string | null> {
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        messages,
        max_tokens: p.maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(p.timeoutMs),
    });
    if (!res.ok) {
      keylessFailUntil.set(p.id, Date.now() + FAIL_COOLDOWN_MS);
      return null;
    }
    const data: unknown = await res.json();
    const content =
      (data as { choices?: { message?: { content?: unknown } }[] })
        ?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !usableContent(content)) {
      // Reasoning models can burn the whole budget on chain-of-thought and
      // return null content; free pools can route to safety classifiers or
      // refuse. Treat all of these as failure so the chain moves on.
      keylessFailUntil.set(p.id, Date.now() + FAIL_COOLDOWN_MS);
      return null;
    }
    stickyKeyless = p.id;
    return content;
  } catch {
    keylessFailUntil.set(p.id, Date.now() + FAIL_COOLDOWN_MS);
    return null;
  }
}

async function callZAI(
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number,
): Promise<string | null> {
  const zai = await resolveZAI();
  if (!zai) return null;
  const base = {
    messages,
    thinking: { type: "disabled" as const },
  };
  const attempts = [
    { ...base, model: ZAI_MODEL },
    base, // default routing if the explicit model name is rejected
  ];
  for (const body of attempts) {
    try {
      const payload = maxTokens ? { ...body, max_tokens: maxTokens } : body;
      const completion = await zai.chat.completions.create(payload);
      const content = completion.choices?.[0]?.message?.content;
      if (typeof content === "string" && usableContent(content)) return content;
    } catch (e) {
      console.warn(`[ai] ZAI attempt failed: ${String((e as Error)?.message || e).slice(0, 160)}`);
    }
  }
  return null;
}

/**
 * Unified chat completion across the provider chain:
 *   1. ZAI SDK — GLM (keyless in the sandbox, ZAI_API_KEY elsewhere)
 *   2. Keyless pool — Pollinations / Kilo Gateway / LLM7 (no credentials)
 * Returns null only when EVERY provider fails; routes should then reply
 * with aiUnavailablePayload() (503) so the UI shows a friendly message.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatResult | null> {
  const temperature = opts.temperature ?? 0.4;

  const zaiContent = await callZAI(messages, temperature, opts.maxTokens);
  if (zaiContent !== null) return { content: zaiContent, provider: "zai" };

  if (keylessPoolEnabled()) {
    for (const p of orderedKeylessProviders()) {
      const content = await callKeyless(p, messages, temperature);
      if (content !== null) return { content, provider: p.id };
    }
  }
  return null;
}

/**
 * Vision completion (prescription OCR): ZAI createVision first, then a race
 * between the keyless vision-capable providers. Data URLs are accepted.
 *
 * Keyless vision providers (both verified reading real prescriptions):
 *   - OVHcloud AI Endpoints Qwen2.5-VL-72B — excellent format compliance but
 *     intermittently 429s; retried once after a short backoff.
 *   - Kilo Gateway nvidia/nemotron-3-nano-omni (free) — slower reasoning
 *     model, tolerant prompt format; a good second lane.
 *
 * The old Kilo `openrouter/free` vision fallback was removed: the pool now
 * routes that id to nvidia's content-safety classifier, which replies
 * "User Safety: safe" — the sanity guards reject such output.
 */
export async function visionComplete(
  text: string,
  imageDataUrl: string,
): Promise<ChatResult | null> {
  const zai = await resolveZAI();
  if (zai) {
    try {
      const completion = await zai.chat.completions.createVision({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      } as Parameters<typeof zai.chat.completions.createVision>[0]);
      const content = completion.choices?.[0]?.message?.content;
      if (typeof content === "string" && usableContent(content)) {
        return { content, provider: "zai-vision" };
      }
    } catch (e) {
      console.warn(`[ai] ZAI vision failed: ${String((e as Error)?.message || e).slice(0, 160)}`);
    }
  }

  if (!keylessPoolEnabled()) return null;

  const lanes: Promise<ChatResult | null>[] = [
    ovhVision(text, imageDataUrl),
    kiloOmniVision(text, imageDataUrl),
  ];
  return firstUsable(lanes);
}

/** OVHcloud Qwen2.5-VL-72B-Instruct — keyless OpenAI-compatible vision. */
async function ovhVision(text: string, imageDataUrl: string): Promise<ChatResult | null> {
  const url = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions";
  const body = JSON.stringify({
    model: "Qwen2.5-VL-72B-Instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        // Known intermittent rate limiting — one short backoff retry.
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        return null;
      }
      if (res.ok) {
        const data: unknown = await res.json();
        const content =
          (data as { choices?: { message?: { content?: unknown } }[] })
            ?.choices?.[0]?.message?.content;
        if (typeof content === "string" && usableContent(content)) {
          return { content, provider: "ovh-vision" };
        }
      }
      return null; // hard error (auth/404/bad request) — do not retry
    } catch {
      return null; // timeout — do not retry (keeps the race budget)
    }
  }
  return null;
}

/** Kilo Gateway free omni model — multimodal, accepts OpenAI-style images. */
async function kiloOmniVision(text: string, imageDataUrl: string): Promise<ChatResult | null> {
  try {
    const res = await fetch(
      "https://api.kilo.ai/api/gateway/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(50000),
      },
    );
    if (res.ok) {
      const data: unknown = await res.json();
      const content =
        (data as { choices?: { message?: { content?: unknown } }[] })
          ?.choices?.[0]?.message?.content;
      if (typeof content === "string" && usableContent(content)) {
        return { content, provider: "kilo-omni-vision" };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

/** Resolve to the first non-null usable result; null when all lanes fail. */
function firstUsable(lanes: Promise<ChatResult | null>[]): Promise<ChatResult | null> {
  return new Promise((resolve) => {
    let pending = lanes.length;
    let settled = false;
    const tick = () => {
      pending--;
      if (pending === 0 && !settled) resolve(null);
    };
    for (const lane of lanes) {
      lane
        .then((r) => {
          if (settled) return;
          if (r) {
            settled = true;
            resolve(r);
          } else {
            tick();
          }
        })
        .catch(() => {
          if (!settled) tick();
        });
    }
  });
}

// Test-only injection point so unit tests can force the ZAI path on/off
// deterministically (the sandbox always provisions a working /etc/.z-ai-config).
let zaiFactoryOverride: (() => Promise<ZAIInstance | null>) | null = null;

/**
 * Deployment diagnostics for /api/health: which AI providers are wired up.
 * "zai" = GLM SDK configured; "keyless-pool" = free providers usable with
 * zero credentials; "off" = nothing available (all routes 503).
 */
export function getAIStatus(zaiReady: boolean): {
  enabled: boolean;
  mode: "zai" | "keyless-pool" | "off";
  providers: string[];
} {
  const pool = keylessPoolEnabled()
    ? KEYLESS_PROVIDERS.map((p) => p.id)
    : [];
  // Vision lanes used by the prescription reader (OCR).
  const vision = keylessPoolEnabled() ? ["ovh-vision", "kilo-omni-vision"] : [];
  if (zaiReady) {
    return { enabled: true, mode: "zai", providers: ["zai", ...pool, ...vision] };
  }
  if (pool.length > 0) {
    return { enabled: true, mode: "keyless-pool", providers: [...pool, ...vision] };
  }
  return { enabled: false, mode: "off", providers: [] };
}

/** Test-only: reset module-level chain state (sticky routing, cooldowns, ZAI cache). */
export function __resetAIChainForTests(): void {
  stickyKeyless = null;
  keylessFailUntil.clear();
  cachedInstance = undefined;
}

/** Test-only: force the ZAI SDK instance (or null = unavailable) for unit tests. */
export function __setZAIFactoryForTests(
  factory: (() => Promise<ZAIInstance | null>) | null,
): void {
  zaiFactoryOverride = factory;
  cachedInstance = undefined;
}

async function resolveZAI(): Promise<ZAIInstance | null> {
  if (zaiFactoryOverride) return zaiFactoryOverride();
  return getZAI();
}

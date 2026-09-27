import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  chatComplete,
  visionComplete,
  getAIStatus,
  __resetAIChainForTests,
  __setZAIFactoryForTests,
} from "../../src/lib/ai";

// ---- test helpers ----------------------------------------------------------

type FetchCall = { url: string; body: any };
let calls: FetchCall[] = [];
let responsesByUrl: Record<
  string,
  { ok: boolean; json: () => Promise<unknown> } | Error
> = {};

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetAIChainForTests();
  // Force the ZAI SDK path OFF so the keyless pool is exercised (the sandbox
  // always provisions a working /etc/.z-ai-config, which would otherwise win).
  __setZAIFactoryForTests(async () => null);
  calls = [];
  responsesByUrl = {};
  delete process.env.FREE_LLM_POOL;
  delete process.env.ZAI_API_KEY;
});

const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
  const r = responsesByUrl[u];
  if (r instanceof Error) throw r;
  if (!r) throw new Error(`unexpected fetch: ${u}`);
  return r;
};

const ok = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});
const httpError = () => ({ ok: false, json: async () => ({ error: "x" }) });
const nullContent = () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: null } }] }),
});

const POLL = "https://text.pollinations.ai/openai/chat/completions";
const KILO = "https://api.kilo.ai/api/gateway/chat/completions";
const LLM7 = "https://api.llm7.io/v1/chat/completions";

const MSGS = [{ role: "user" as const, content: "hello" }];

afterEach(() => {
  // restore the real fetch so later test files are unaffected
  globalThis.fetch = realFetch;
  __setZAIFactoryForTests(null);
});

// ---- tests -----------------------------------------------------------------

describe("chatComplete() keyless pool", () => {
  test("falls back to keyless provider when ZAI is unavailable", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = ok("KEYLESS_REPLY");
    const r = await chatComplete(MSGS);
    expect(r?.content).toBe("KEYLESS_REPLY");
    expect(r?.provider).toBe("pollinations");
    expect(calls.length).toBe(1);
  });

  test("moves to the next provider on HTTP failure", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = httpError();
    responsesByUrl[KILO] = ok("KILO_REPLY");
    const r = await chatComplete(MSGS);
    expect(r?.provider).toBe("kilo");
    expect(r?.content).toBe("KILO_REPLY");
  });

  test("treats null message content as failure (reasoning-model guard)", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = nullContent();
    responsesByUrl[LLM7] = ok("LLM7_REPLY");
    const r = await chatComplete(MSGS);
    expect(r?.provider).toBe("llm7");
  });

  test("returns null when every provider fails", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = httpError();
    responsesByUrl[KILO] = new Error("timeout");
    responsesByUrl[LLM7] = httpError();
    const r = await chatComplete(MSGS);
    expect(r).toBeNull();
  });

  test("failed provider enters cooldown and is skipped", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = httpError();
    responsesByUrl[KILO] = new Error("net down");
    responsesByUrl[LLM7] = ok("OK1");
    await chatComplete(MSGS); // pollinations + kilo fail, llm7 answers

    // kilo would recover, but it is in cooldown — llm7 (sticky) answers.
    responsesByUrl[KILO] = ok("RECOVERED");
    responsesByUrl[LLM7] = ok("OK2");
    const r2 = await chatComplete(MSGS);
    expect(r2?.provider).toBe("llm7");
    expect(calls.map((c) => c.url)).toEqual([POLL, KILO, LLM7, LLM7]);
  });

  test("sticky provider is tried first on the next call", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = httpError();
    responsesByUrl[KILO] = ok("FIRST");
    const r1 = await chatComplete(MSGS);
    expect(r1?.provider).toBe("kilo");

    responsesByUrl[KILO] = ok("SECOND");
    const r2 = await chatComplete(MSGS);
    expect(r2?.provider).toBe("kilo");
    expect(r2?.content).toBe("SECOND");
    // second call must start directly at kilo (sticky), no pollinations retry
    expect(calls.map((c) => c.url)).toEqual([POLL, KILO, KILO]);
  });

  test("FREE_LLM_POOL=off disables the pool entirely", async () => {
    process.env.FREE_LLM_POOL = "off";
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    const r = await chatComplete(MSGS);
    expect(r).toBeNull();
    expect(calls.length).toBe(0);
  });
});

describe("chatComplete() ZAI primary", () => {
  test("uses ZAI when the SDK is configured, requesting glm-5.3-flash", async () => {
    __setZAIFactoryForTests(async () => ({
      chat: {
        completions: {
          create: async (body: any) => {
            calls.push({ url: "zai:create", body });
            return { choices: [{ message: { content: "GLM_REPLY" } }] };
          },
        },
      },
    }) as any);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    const r = await chatComplete(MSGS);
    expect(r?.content).toBe("GLM_REPLY");
    expect(r?.provider).toBe("zai");
    expect(calls.length).toBe(1);
    expect(calls[0].body.model).toBe("glm-5.3-flash");
  });

  test("retries without the model field if ZAI rejects it, then falls to the pool", async () => {
    let attempt = 0;
    __setZAIFactoryForTests(async () => ({
      chat: {
        completions: {
          create: async (body: any) => {
            attempt++;
            calls.push({ url: "zai:create", body });
            if (body.model) throw new Error("unknown model");
            return { choices: [{ message: { content: "GLM_DEFAULT" } }] };
          },
        },
      },
    }) as any);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    const r = await chatComplete(MSGS);
    expect(r?.content).toBe("GLM_DEFAULT");
    expect(r?.provider).toBe("zai");
    expect(attempt).toBe(2);
  });
});

describe("getAIStatus()", () => {
  test("zai mode when SDK ready", () => {
    const s = getAIStatus(true);
    expect(s.enabled).toBe(true);
    expect(s.mode).toBe("zai");
    expect(s.providers).toContain("zai");
    expect(s.providers).toContain("pollinations");
  });

  test("keyless-pool mode when SDK unavailable", () => {
    const s = getAIStatus(false);
    expect(s.enabled).toBe(true);
    expect(s.mode).toBe("keyless-pool");
    expect(s.providers).toEqual([
      "pollinations",
      "kilo",
      "llm7",
      "ovh-vision",
      "kilo-omni-vision",
    ]);
  });

  test("off mode when pool disabled and no SDK", () => {
    process.env.FREE_LLM_POOL = "off";
    const s = getAIStatus(false);
    expect(s.enabled).toBe(false);
    expect(s.mode).toBe("off");
  });
});

// ---- sanity guards ---------------------------------------------------------

describe("response sanity guards", () => {
  test("safety-classifier output is rejected and the chain moves on", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = ok("User Safety: safe\nResponse Safety: safe");
    responsesByUrl[KILO] = ok("REAL_REPLY");
    const r = await chatComplete(MSGS);
    expect(r?.provider).toBe("kilo");
    expect(r?.content).toBe("REAL_REPLY");
  });

  test("bare refusal is rejected and the chain moves on", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[POLL] = ok("I'm sorry, but I can't help with that.");
    responsesByUrl[KILO] = ok("REAL_REPLY");
    const r = await chatComplete(MSGS);
    expect(r?.provider).toBe("kilo");
    expect(r?.content).toBe("REAL_REPLY");
  });

  test("an apologetic but substantive answer is NOT treated as a refusal", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    const long =
      "I'm sorry to hear about your headache. For mild pain and fever, Panadol Extra (paracetamol) is commonly used — one 500mg tablet every 8 hours. If symptoms persist for more than 3 days, please see a doctor.";
    responsesByUrl[POLL] = ok(long);
    const r = await chatComplete(MSGS);
    expect(r?.provider).toBe("pollinations");
    expect(r?.content).toBe(long);
  });
});

// ---- vision chain (prescription OCR) ----------------------------------------

const OVH = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions";
const IMG = "data:image/png;base64,AAAA";
const OCR_GOOD =
  "MEDICATIONS: Panadol Extra; Augmentin; Ventolin inhaler\nDOSAGES: 500mg 1 tab every 8h; 1g twice daily; as needed\nNOTES: 7 days for Augmentin";

describe("visionComplete() keyless vision lanes", () => {
  test("returns the first usable lane result", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[OVH] = ok(OCR_GOOD);
    const r = await visionComplete("read this", IMG);
    expect(r?.provider).toBe("ovh-vision");
    expect(r?.content).toBe(OCR_GOOD);
  });

  test("falls back to the kilo omni lane when OVH is unusable", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    // OVH answers with the safety-classifier shape (the old openrouter/free
    // failure mode) — the guard must reject it and use the omni lane.
    responsesByUrl[OVH] = ok("User Safety: safe");
    responsesByUrl[KILO] = ok(
      "Based on the image provided:\n\n1. **Panadol Extra**: 500mg — 1 tab every 8h\n2. **Augmentin**: 1g — twice daily",
    );
    const r = await visionComplete("read this", IMG);
    expect(r?.provider).toBe("kilo-omni-vision");
    expect(r?.content).toContain("Panadol");
  });

  test("both lanes unusable -> null", async () => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    responsesByUrl[OVH] = ok("User Safety: safe");
    responsesByUrl[KILO] = httpError();
    const r = await visionComplete("read this", IMG);
    expect(r).toBeNull();
  });
});

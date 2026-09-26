import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { zaiEnvBootstrapDir, aiUnavailablePayload, isAiUnavailableResponse } from "../../src/lib/ai";

const ENV = ["ZAI_API_KEY", "ZAI_BASE_URL"] as const;
const createdDirs: string[] = [];
const prevHome = process.env.HOME;

describe("zaiEnvBootstrapDir()", () => {
  beforeEach(() => {
    for (const v of ENV) delete process.env[v];
  });
  afterEach(() => {
    for (const v of ENV) delete process.env[v];
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    for (const d of createdDirs.splice(0)) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
  });

  test("returns null without ZAI_API_KEY", () => {
    expect(zaiEnvBootstrapDir()).toBeNull();
  });

  test("writes valid config JSON with default baseUrl", () => {
    process.env.ZAI_API_KEY = "test-key-123";
    const dir = zaiEnvBootstrapDir();
    expect(dir).toBeTruthy();
    createdDirs.push(dir!);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir!, ".z-ai-config"), "utf8"));
    expect(cfg).toEqual({ baseUrl: "https://api.z.ai/v1", apiKey: "test-key-123" });
  });

  test("honours ZAI_BASE_URL override", () => {
    process.env.ZAI_API_KEY = "k";
    process.env.ZAI_BASE_URL = "https://custom.example.com/v1";
    const dir = zaiEnvBootstrapDir();
    createdDirs.push(dir!);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir!, ".z-ai-config"), "utf8"));
    expect(cfg.baseUrl).toBe("https://custom.example.com/v1");
  });

  test("creates a fresh unique dir per call", () => {
    process.env.ZAI_API_KEY = "k";
    const a = zaiEnvBootstrapDir();
    const b = zaiEnvBootstrapDir();
    createdDirs.push(a!, b!);
    expect(a).not.toBe(b);
  });
});

describe("aiUnavailablePayload()", () => {
  test("arabic message for lang=ar", () => {
    const p = aiUnavailablePayload("ar");
    expect(p.error).toBe("ai_unavailable");
    expect(p.message).toContain("الذكاء الاصطناعي");
  });

  test("english message by default", () => {
    const p = aiUnavailablePayload();
    expect(p.error).toBe("ai_unavailable");
    expect(p.message).toContain("ZAI_API_KEY");
  });

  test("isAiUnavailableResponse matches only the 503 ai_unavailable shape", () => {
    expect(isAiUnavailableResponse(503, { error: "ai_unavailable" })).toBe(true);
    expect(isAiUnavailableResponse(500, { error: "ai_unavailable" })).toBe(false);
    expect(isAiUnavailableResponse(503, { error: "other" })).toBe(false);
    expect(isAiUnavailableResponse(503, "not-an-object")).toBe(false);
  });
});

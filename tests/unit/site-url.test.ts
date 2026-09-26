import { describe, expect, test, beforeEach } from "bun:test";
import { resolveSiteUrl } from "../../src/lib/site-url";

/** Env vars consulted by the resolver. */
const VARS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

describe("resolveSiteUrl()", () => {
  beforeEach(() => {
    for (const v of VARS) delete process.env[v];
  });

  test("local dev fallback when nothing is set", () => {
    expect(resolveSiteUrl()).toBe("http://localhost:3000");
  });

  test("explicit NEXT_PUBLIC_SITE_URL wins over Vercel vars", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pharmacy.example.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "the-pharmacy-two.vercel.app";
    expect(resolveSiteUrl()).toBe("https://pharmacy.example.com");
  });

  test("bare domain without protocol gets https://", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "pharmacy.example.com";
    expect(resolveSiteUrl()).toBe("https://pharmacy.example.com");
  });

  test("trailing slash is stripped", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pharmacy.example.com/";
    expect(resolveSiteUrl()).toBe("https://pharmacy.example.com");
  });

  test("Vercel production domain auto-detection", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "the-pharmacy-two.vercel.app";
    expect(resolveSiteUrl()).toBe("https://the-pharmacy-two.vercel.app");
  });

  test("VERCEL_URL used for preview deployments when production URL absent", () => {
    process.env.VERCEL_URL = "the-pharmacy-two-abc123.vercel.app";
    expect(resolveSiteUrl()).toBe("https://the-pharmacy-two-abc123.vercel.app");
  });

  test("production domain takes priority over per-deployment URL", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "the-pharmacy-two.vercel.app";
    process.env.VERCEL_URL = "the-pharmacy-two-xyz789.vercel.app";
    expect(resolveSiteUrl()).toBe("https://the-pharmacy-two.vercel.app");
  });

  test("VERCEL_URL with protocol is not double-prefixed", () => {
    process.env.VERCEL_URL = "https://some-preview.vercel.app";
    expect(resolveSiteUrl()).toBe("https://some-preview.vercel.app");
  });
});

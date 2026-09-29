import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { signSessionToken, verifySessionToken } from "../../src/lib/auth";

// Signed session tokens: HMAC round-trip + tamper/expiry rejection.

describe("signed session tokens", () => {
  const origSecret = process.env.SESSION_SECRET;

  beforeEach(() => { process.env.SESSION_SECRET = "test-secret-123"; });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = origSecret;
  });

  test("round-trip: sign -> verify returns the userId", () => {
    const exp = Date.now() + 60_000;
    const token = signSessionToken("user-abc", exp);
    expect(token.startsWith("v1.user-abc.")).toBe(true);
    expect(verifySessionToken(token)).toEqual({ userId: "user-abc" });
  });

  test("expired token is rejected", () => {
    const token = signSessionToken("user-abc", Date.now() - 1000);
    expect(verifySessionToken(token)).toBeNull();
  });

  test("tampered userId is rejected", () => {
    const exp = Date.now() + 60_000;
    const token = signSessionToken("user-abc", exp);
    const parts = token.split(".");
    parts[1] = "user-admin"; // swap subject
    expect(verifySessionToken(parts.join("."))).toBeNull();
  });

  test("tampered expiry is rejected", () => {
    const token = signSessionToken("user-abc", Date.now() + 60_000);
    const parts = token.split(".");
    parts[2] = String(Date.now() + 60_000 * 500); // extend life
    expect(verifySessionToken(parts.join("."))).toBeNull();
  });

  test("token signed with a different secret is rejected", () => {
    const token = signSessionToken("user-abc", Date.now() + 60_000);
    process.env.SESSION_SECRET = "other-secret";
    expect(verifySessionToken(token)).toBeNull();
  });

  test("malformed tokens are rejected", () => {
    for (const bad of ["", "v1.only", "v1.a.b.c.d", "garbage", "v1..123456.abcdef"]) {
      expect(verifySessionToken(bad)).toBeNull();
    }
  });
});

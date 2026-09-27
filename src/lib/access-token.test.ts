import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAccessUrl,
  createAccessToken,
  verifyAccessToken,
} from "@/lib/access-token";

const accessGrantId = "85033b69-9dcc-4dac-b5b2-56220d0d079a";
const originalSecret = process.env.ACCESS_TOKEN_SECRET;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

describe("access tokens", () => {
  it("derives a stable token and validates its grant UUID", () => {
    process.env.ACCESS_TOKEN_SECRET = "a".repeat(32);

    const token = createAccessToken(accessGrantId);

    expect(createAccessToken(accessGrantId)).toBe(token);
    expect(verifyAccessToken(token)).toBe(accessGrantId);
  });

  it("does not accept a token with a changed signature", () => {
    process.env.ACCESS_TOKEN_SECRET = "a".repeat(32);
    const token = createAccessToken(accessGrantId);

    expect(verifyAccessToken(`${token.slice(0, -1)}x`)).toBeNull();
  });

  it("uses only the canonical downloads path", () => {
    process.env.ACCESS_TOKEN_SECRET = "a".repeat(32);
    process.env.NEXT_PUBLIC_SITE_URL = "https://astralrefine.com";

    const url = new URL(buildAccessUrl(createAccessToken(accessGrantId)));

    expect(url.pathname).toMatch(/^\/downloads\/v1\./);
    expect(url.search).toBe("");
  });

  it("requires a safe configured site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://example.com";

    expect(() => buildAccessUrl("token")).toThrow("must use HTTPS");
  });
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.ACCESS_TOKEN_SECRET;
  } else {
    process.env.ACCESS_TOKEN_SECRET = originalSecret;
  }

  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

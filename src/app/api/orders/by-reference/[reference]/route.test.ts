import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);

import { GET } from "@/app/api/orders/by-reference/[reference]/route";

const reference = "hkt_4pX9Xq21bL8vK3mN";
const confirmation = "Ba9tJwk9NhHTB7PRU1_3xx5EiGCqERvhfA9th4YHvmQ";
const grantId = "1b9264f3-a55d-4e3a-a80a-810c3787d1f9";
const previousAccessTokenSecret = process.env.ACCESS_TOKEN_SECRET;

function confirmationHash(value = confirmation) {
  return createHash("sha256").update(value).digest("hex");
}

function request(secret = confirmation) {
  return new Request(
    `https://example.test/api/orders/by-reference/${reference}?confirmation=${secret}`,
  );
}

function context(value = reference) {
  return { params: Promise.resolve({ reference: value }) };
}

function mockOrder(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  mocks.createSupabaseAdminClient.mockReturnValue({ from });

  return { eq, from, maybeSingle, select };
}

describe("GET /api/orders/by-reference/[reference]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousAccessTokenSecret === undefined) {
      delete process.env.ACCESS_TOKEN_SECRET;
    } else {
      process.env.ACCESS_TOKEN_SECRET = previousAccessTokenSecret;
    }
    vi.restoreAllMocks();
  });

  it("does not query or disclose order information when only a reference is supplied", async () => {
    const response = await GET(
      new Request(`https://example.test/api/orders/by-reference/${reference}`),
      context(),
    );

    expect(await response.json()).toEqual({ status: "unknown" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns the same generic result for a malformed reference", async () => {
    const response = await GET(request(), context("not valid"));

    expect(await response.json()).toEqual({ status: "unknown" });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not expose a real order when the opaque confirmation value does not match", async () => {
    const db = mockOrder({
      confirmation_secret_hash: confirmationHash(),
      customer_email: "buyer@example.com",
      entitlement_snapshot: [{ guideId: "guide-1" }],
      status: "fulfilled",
    });

    const response = await GET(request("x".repeat(43)), context());

    expect(await response.json()).toEqual({ status: "unknown" });
    expect(db.from).toHaveBeenCalledWith("commerce_orders");
  });

  it("returns only safe fulfilled information after both values match", async () => {
    mockOrder({
      confirmation_secret_hash: confirmationHash(),
      customer_email: "buyer@example.com",
      entitlement_snapshot: [{ guideId: "guide-1" }, { guideId: "guide-2" }],
      status: "fulfilled",
    });

    const response = await GET(request(), context());

    expect(await response.json()).toEqual({
      status: "fulfilled",
      guideCount: 2,
      maskedEmail: "b***@example.com",
      downloadPath: null,
    });
  });

  it("provides a download path only after the confirmation secret and active grant both match", async () => {
    process.env.ACCESS_TOKEN_SECRET = "access-token-test-secret-that-is-long-enough";
    const order = {
      confirmation_secret_hash: confirmationHash(),
      customer_email: "buyer@example.com",
      entitlement_snapshot: [{ guideId: "guide-1" }],
      id: "d0cbb4bd-7e8e-482a-a1ba-e9e54abd1a88",
      status: "fulfilled",
    };
    const orderMaybeSingle = vi.fn().mockResolvedValue({ data: order, error: null });
    const orderEq = vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle });
    const activeGrantMaybeSingle = vi.fn().mockResolvedValue({ data: { id: grantId }, error: null });
    const activeGrantGt = vi.fn().mockReturnValue({ maybeSingle: activeGrantMaybeSingle });
    const activeGrantIs = vi.fn().mockReturnValue({ gt: activeGrantGt });
    const activeGrantEq = vi.fn().mockReturnValue({ is: activeGrantIs });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "commerce_orders") {
          return { select: vi.fn().mockReturnValue({ eq: orderEq }) };
        }

        return { select: vi.fn().mockReturnValue({ eq: activeGrantEq }) };
      }),
    });

    const response = await GET(request(), context());
    const body = await response.json();

    expect(body).toMatchObject({
      guideCount: 1,
      maskedEmail: "b***@example.com",
      status: "fulfilled",
    });
    expect(body.downloadPath).toMatch(/^\/downloads\/v1\./);
  });

  it("keeps a paid but not fulfilled order pending", async () => {
    mockOrder({
      confirmation_secret_hash: confirmationHash(),
      customer_email: "buyer@example.com",
      entitlement_snapshot: [{ guideId: "guide-1" }],
      status: "paid",
    });

    const response = await GET(request(), context());

    expect(await response.json()).toEqual({ status: "pending" });
  });

  it("does not reveal whether a valid looking reference exists", async () => {
    mockOrder(null);

    const response = await GET(request(), context());

    expect(await response.json()).toEqual({ status: "unknown" });
  });
});

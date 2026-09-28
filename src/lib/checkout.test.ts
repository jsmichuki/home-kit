import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  ordersUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);

import {
  CheckoutServiceError,
  createCheckout,
} from "@/lib/checkout";

const originalEnvironment = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
};

describe("createCheckout", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    process.env.PAYSTACK_SECRET_KEY = "paystack-test-secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection lost")));

    mocks.ordersUpdate.mockReset();
    const ordersTable = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "order-id" }, error: null }),
        }),
      }),
      update: mocks.ordersUpdate,
    };
    const pricesOr = vi.fn().mockResolvedValue({
      data: [
        {
          active_from: "2026-09-27T00:00:00.000Z",
          amount_in_subunits: 1200,
          bundle_id: null,
          catalogue_version: 1,
          currency: "USD",
          guide_id: "guide-id",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "commerce_guides") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                current_version: 1,
                id: "guide-id",
                is_active: true,
                slug: "guide",
                title: "Guide",
              },
            ],
            error: null,
          }),
        };
      }

      if (table === "commerce_bundles" || table === "commerce_bundle_guides") {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }

      if (table === "commerce_catalogue_prices") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({ or: pricesOr }),
            }),
          }),
        };
      }

      return ordersTable;
    });

    mocks.createSupabaseAdminClient.mockReturnValue({ from });
  });

  afterEach(() => {
    if (originalEnvironment.NEXT_PUBLIC_SITE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnvironment.NEXT_PUBLIC_SITE_URL;
    }

    if (originalEnvironment.PAYSTACK_SECRET_KEY === undefined) {
      delete process.env.PAYSTACK_SECRET_KEY;
    } else {
      process.env.PAYSTACK_SECRET_KEY = originalEnvironment.PAYSTACK_SECRET_KEY;
    }

    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps a pending order intact when Paystack initialization is uncertain", async () => {
    await expect(
      createCheckout({
        confirmationSecret: "confirmation-secret",
        deliveryEmail: "buyer@example.com",
        idempotencyKey: "idempotency-key",
        productIds: ["guide-id"],
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_UNAVAILABLE",
      status: 502,
    } satisfies Partial<CheckoutServiceError>);

    expect(mocks.ordersUpdate).not.toHaveBeenCalled();
  });

  it("leaves the transaction reference for Paystack to append to the callback", async () => {
    const callbackUrl = "https://checkout.paystack.com/authorize";
    const updateResult = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    mocks.ordersUpdate.mockReturnValue(updateResult);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as { reference: string };

      return new Response(JSON.stringify({
        data: {
          authorization_url: callbackUrl,
          reference: payload.reference,
        },
        status: true,
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCheckout({
        confirmationSecret: "confirmation-secret",
        deliveryEmail: "buyer@example.com",
        idempotencyKey: "idempotency-key",
        productIds: ["guide-id"],
      }),
    ).resolves.toEqual({ authorizationUrl: callbackUrl });

    const initialized = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      callback_url: string;
    };
    const paymentCallback = new URL(initialized.callback_url);

    expect(paymentCallback.pathname).toBe("/payment/confirmation");
    expect(paymentCallback.searchParams.get("confirmation")).toBe("confirmation-secret");
    expect(paymentCallback.searchParams.has("reference")).toBe(false);
  });
});

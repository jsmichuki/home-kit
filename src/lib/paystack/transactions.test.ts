import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PaystackVerificationError,
  verifyPaystackTransaction,
} from "@/lib/paystack/transactions";

const previousSecret = process.env.PAYSTACK_SECRET_KEY;

describe("verifyPaystackTransaction", () => {
  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.PAYSTACK_SECRET_KEY;
    } else {
      process.env.PAYSTACK_SECRET_KEY = previousSecret;
    }
  });

  it("uses the server verification endpoint and returns only safe verified fields", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            amount: 6900,
            currency: "USD",
            customer: { email: "buyer@example.com" },
            id: 4099260516,
            metadata: JSON.stringify({ catalogue_version: 1, order_public_id: "ord_ABC123" }),
            paid_at: "2026-09-27T12:00:00.000Z",
            reference: "hk_payment_123",
            status: "success",
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      verifyPaystackTransaction("hk_payment_123", {
        fetchImplementation,
        secretKey: "test-secret",
      }),
    ).resolves.toEqual({
      amountInSubunits: 6900,
      currency: "USD",
      customerEmail: "buyer@example.com",
      metadata: { catalogue_version: 1, order_public_id: "ord_ABC123" },
      paidAt: "2026-09-27T12:00:00.000Z",
      reference: "hk_payment_123",
      transactionId: 4099260516,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/verify/hk_payment_123",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer test-secret" },
        method: "GET",
      }),
    );
  });

  it("rejects a verification response that is not a successful matching transaction", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            amount: 6900,
            currency: "USD",
            customer: { email: "buyer@example.com" },
            id: 4099260516,
            metadata: {},
            reference: "another_reference",
            status: "success",
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      verifyPaystackTransaction("hk_payment_123", {
        fetchImplementation,
        secretKey: "test-secret",
      }),
    ).rejects.toMatchObject({
      name: "PaystackVerificationError",
      retryable: false,
    } satisfies Partial<PaystackVerificationError>);
  });

  it("rejects missing server-side configuration", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    await expect(verifyPaystackTransaction("hk_payment_123")).rejects.toThrow(
      "Paystack server configuration is incomplete.",
    );
  });
});

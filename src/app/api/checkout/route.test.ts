import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class CheckoutServiceError extends Error {
    constructor(
      readonly code: "CHECKOUT_IN_PROGRESS" | "CONFIGURATION_ERROR" | "PAYMENT_UNAVAILABLE",
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }

  return {
    CheckoutServiceError,
    createCheckout: vi.fn(),
    createConfirmationSecret: vi.fn(() => "confirmation-secret-which-is-long-enough"),
    isValidIdempotencyKey: vi.fn((value: string | null): value is string => Boolean(value)),
  };
});

vi.mock("@/lib/checkout", () => mocks);

import { POST } from "@/app/api/checkout/route";

function request(body: unknown, idempotencyKey = "A".repeat(32)) {
  return new NextRequest("http://localhost/api/checkout", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    },
    method: "POST",
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    mocks.createCheckout.mockReset();
    mocks.createConfirmationSecret.mockReturnValue("confirmation-secret-which-is-long-enough");
    mocks.isValidIdempotencyKey.mockImplementation(
      (value: string | null): value is string => Boolean(value),
    );
  });

  it("rejects an altered client price because only email and product IDs are accepted", async () => {
    const response = await POST(
      request({
        amount: 1,
        email: "buyer@example.com",
        productIds: ["guide-one"],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "The checkout request contains unsupported fields.",
      },
    });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("passes only validated checkout data and returns the hosted checkout URL", async () => {
    mocks.createCheckout.mockResolvedValue({
      authorizationUrl: "https://checkout.paystack.com/abc123",
    });

    const response = await POST(
      request({ email: "Buyer@Example.com", productIds: ["guide-one"] }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createCheckout).toHaveBeenCalledWith({
      confirmationSecret: "confirmation-secret-which-is-long-enough",
      deliveryEmail: "Buyer@Example.com",
      idempotencyKey: "A".repeat(32),
      productIds: ["guide-one"],
    });
    await expect(response.json()).resolves.toEqual({
      authorizationUrl: "https://checkout.paystack.com/abc123",
    });
  });

  it("returns a safe error when Paystack initialization fails", async () => {
    mocks.createCheckout.mockRejectedValue(
      new mocks.CheckoutServiceError(
        "PAYMENT_UNAVAILABLE",
        "We could not start your payment. Please try again.",
        502,
      ),
    );

    const response = await POST(
      request({ email: "buyer@example.com", productIds: ["guide-one"] }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PAYMENT_UNAVAILABLE",
        message: "We could not start your payment. Please try again.",
      },
    });
  });

  it("requires a browser supplied idempotency key", async () => {
    mocks.isValidIdempotencyKey.mockReturnValue(false);

    const response = await POST(
      request({ email: "buyer@example.com", productIds: ["guide-one"] }, ""),
    );

    expect(response.status).toBe(400);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
});

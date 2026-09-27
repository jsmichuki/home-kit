import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  deliverInitialFulfillmentEmail: vi.fn(),
  fulfillVerifiedPaystackCharge: vi.fn(),
  verifyPaystackTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/fulfillment-outbox", () => ({
  deliverInitialFulfillmentEmail: mocks.deliverInitialFulfillmentEmail,
}));
vi.mock("@/lib/paystack/fulfillment", () => ({
  fulfillVerifiedPaystackCharge: mocks.fulfillVerifiedPaystackCharge,
}));
vi.mock("@/lib/paystack/transactions", () => ({
  PaystackVerificationError: class PaystackVerificationError extends Error {},
  verifyPaystackTransaction: mocks.verifyPaystackTransaction,
}));

import { POST } from "@/app/api/webhooks/paystack/route";
import { createPaystackWebhookSignature } from "@/lib/paystack/webhook";

const secret = "paystack-webhook-test-secret";
const previousSecret = process.env.PAYSTACK_SECRET_KEY;
const previousAccessTokenSecret = process.env.ACCESS_TOKEN_SECRET;

function eventBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: { id: 4099260516, reference: "hk_payment_123" },
    event: "charge.success",
    ...overrides,
  });
}

function signedRequest(body: string, signature = createPaystackWebhookSignature(Buffer.from(body), secret)) {
  return new Request("https://home-kit.example/api/webhooks/paystack", {
    body,
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": signature,
    },
    method: "POST",
  });
}

const verifiedTransaction = {
  amountInSubunits: 6900,
  currency: "USD",
  customerEmail: "buyer@example.com",
  metadata: { catalogue_version: 1, order_public_id: "ord_ABC123" },
  paidAt: "2026-09-27T12:00:00.000Z",
  reference: "hk_payment_123",
  transactionId: 4099260516,
};

describe("POST /api/webhooks/paystack", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = secret;
    process.env.ACCESS_TOKEN_SECRET = "a".repeat(32);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.verifyPaystackTransaction.mockResolvedValue(verifiedTransaction);
    mocks.after.mockImplementation(() => undefined);
    mocks.deliverInitialFulfillmentEmail.mockResolvedValue({ claimed: 1, completed: 1, failed: 0 });
    mocks.fulfillVerifiedPaystackCharge.mockResolvedValue({
      access_grant_id: "85033b69-9dcc-4dac-b5b2-56220d0d079a",
      fulfilled_at: "2026-09-28T12:00:00.000Z",
      order_public_id: "ord_ABC123",
      outcome: "fulfilled",
    });
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.PAYSTACK_SECRET_KEY;
    } else {
      process.env.PAYSTACK_SECRET_KEY = previousSecret;
    }

    if (previousAccessTokenSecret === undefined) {
      delete process.env.ACCESS_TOKEN_SECRET;
    } else {
      process.env.ACCESS_TOKEN_SECRET = previousAccessTokenSecret;
    }

    vi.restoreAllMocks();
    mocks.verifyPaystackTransaction.mockReset();
    mocks.fulfillVerifiedPaystackCharge.mockReset();
    mocks.deliverInitialFulfillmentEmail.mockReset();
    mocks.after.mockReset();
  });

  it("rejects missing or invalid signatures before parsing or verifying a payment", async () => {
    const response = await POST(
      new Request("https://home-kit.example/api/webhooks/paystack", {
        body: eventBody(),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyPaystackTransaction).not.toHaveBeenCalled();
    expect(mocks.fulfillVerifiedPaystackCharge).not.toHaveBeenCalled();
  });

  it("rejects a body changed after its signature was calculated", async () => {
    const originalBody = eventBody();
    const response = await POST(signedRequest(`${originalBody} `, createPaystackWebhookSignature(Buffer.from(originalBody), secret)));

    expect(response.status).toBe(401);
    expect(mocks.verifyPaystackTransaction).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload before signature verification", async () => {
    const response = await POST(
      new Request("https://home-kit.example/api/webhooks/paystack", {
        body: eventBody(),
        headers: { "content-length": String(256 * 1024 + 1) },
        method: "POST",
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.verifyPaystackTransaction).not.toHaveBeenCalled();
  });

  it("acknowledges valid irrelevant events without transaction verification", async () => {
    const response = await POST(signedRequest(eventBody({ event: "charge.failed" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "ignored" });
    expect(mocks.verifyPaystackTransaction).not.toHaveBeenCalled();
  });

  it("verifies the charge then delegates one atomic fulfillment call", async () => {
    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "fulfilled" });
    expect(mocks.verifyPaystackTransaction).toHaveBeenCalledWith("hk_payment_123");
    expect(mocks.fulfillVerifiedPaystackCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "charge.success:4099260516",
        reference: "hk_payment_123",
        transactionId: 4099260516,
        verifiedAmountInSubunits: 6900,
        verifiedCurrency: "USD",
        verifiedEmail: "buyer@example.com",
        verifiedMetadata: verifiedTransaction.metadata,
      }),
    );
    expect(mocks.fulfillVerifiedPaystackCharge.mock.calls[0][0].accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("acknowledges a duplicate event without leaking order details", async () => {
    mocks.fulfillVerifiedPaystackCharge.mockResolvedValue({ outcome: "duplicate" });

    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "duplicate" });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("schedules an immediate delivery attempt only after durable fulfillment", async () => {
    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledOnce();

    const task = mocks.after.mock.calls[0]?.[0] as () => Promise<void>;
    await task();

    expect(mocks.deliverInitialFulfillmentEmail).toHaveBeenCalledWith({
      accessGrantId: "85033b69-9dcc-4dac-b5b2-56220d0d079a",
    });
  });

  it("acknowledges payment even when the immediate delivery attempt is deferred", async () => {
    mocks.deliverInitialFulfillmentEmail.mockRejectedValue(new Error("Resend unavailable"));
    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(200);
    const task = mocks.after.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(task()).resolves.toBeUndefined();
  });

  it("acknowledges an event when the verified transaction ID differs from the webhook", async () => {
    mocks.verifyPaystackTransaction.mockResolvedValue({
      ...verifiedTransaction,
      transactionId: 4099260517,
    });

    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "rejected" });
    expect(mocks.fulfillVerifiedPaystackCharge).not.toHaveBeenCalled();
  });

  it("returns a retryable response when Paystack verification or fulfillment is unavailable", async () => {
    mocks.verifyPaystackTransaction.mockRejectedValue(new Error("network unavailable"));

    const response = await POST(signedRequest(eventBody()));

    expect(response.status).toBe(503);
    expect(mocks.fulfillVerifiedPaystackCharge).not.toHaveBeenCalled();
  });
});

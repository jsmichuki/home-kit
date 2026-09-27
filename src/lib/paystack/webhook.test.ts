import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPaystackWebhookSignature,
  hasValidPaystackWebhookSignature,
  parsePaystackWebhookEvent,
} from "@/lib/paystack/webhook";

describe("Paystack webhook primitives", () => {
  const secret = "paystack-test-secret";
  const rawBody = Buffer.from(
    JSON.stringify({
      event: "charge.success",
      data: { id: 4099260516, reference: "hk_payment_123" },
    }),
  );

  it("accepts only an HMAC SHA512 signature for the exact raw request body", () => {
    const signature = createPaystackWebhookSignature(rawBody, secret);

    expect(hasValidPaystackWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(hasValidPaystackWebhookSignature(Buffer.from(`${rawBody} `), signature, secret)).toBe(false);
    expect(hasValidPaystackWebhookSignature(rawBody, "0".repeat(127), secret)).toBe(false);
    expect(hasValidPaystackWebhookSignature(rawBody, "not-a-signature", secret)).toBe(false);
  });

  it("parses only an event with a safe transaction ID and nonempty reference", () => {
    expect(parsePaystackWebhookEvent(rawBody)).toEqual({
      event: "charge.success",
      data: { id: 4099260516, reference: "hk_payment_123" },
    });
    expect(parsePaystackWebhookEvent(Buffer.from('{"event":"charge.success"}'))).toBeNull();
    expect(
      parsePaystackWebhookEvent(
        Buffer.from('{"event":"charge.success","data":{"id":1,"reference":""}}'),
      ),
    ).toBeNull();
  });
});

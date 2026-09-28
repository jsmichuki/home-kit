import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  logOperationalEvent,
  REDACTED_LOG_VALUE,
  sanitizeForLog,
} from "@/lib/observability/safe-log";

describe("sanitizeForLog", () => {
  it("removes credentials, payloads, tokens, card-like values, and full emails", () => {
    const result = sanitizeForLog({
      apiKey: "re_1234567890abcdef",
      buyer_email: "buyer@example.com",
      confirmation: "opaque-confirmation-token",
      nested: {
        authorization: "Bearer example-payment-secret",
        body: { card_number: "4242 4242 4242 4242" },
      },
      url: "https://app.example.test/downloads/opaque-access-token-with-entropy?token=opaque-token&reference=order_123",
    });

    expect(result).toEqual({
      apiKey: REDACTED_LOG_VALUE,
      buyer_email: "b***@example.com",
      confirmation: REDACTED_LOG_VALUE,
      nested: {
        authorization: REDACTED_LOG_VALUE,
        body: REDACTED_LOG_VALUE,
      },
      url: "https://app.example.test/downloads/[REDACTED]?token=[REDACTED]&reference=order_123",
    });
  });

  it("keeps useful safe metadata while handling circular values and errors", () => {
    const circular: Record<string, unknown> = { order_public_id: "order_123" };
    circular.self = circular;

    expect(
      sanitizeForLog({
        error: new Error("Delivery for buyer@example.com failed"),
        reference: "order_123",
        circular,
      }),
    ).toEqual({
      error: { message: "Delivery for b***@example.com failed", name: "Error" },
      reference: "order_123",
      circular: { order_public_id: "order_123", self: "[CIRCULAR]" },
    });
  });
});

describe("logOperationalEvent", () => {
  it("writes a redacted structured event to the selected log level", () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

    logOperationalEvent("warn", "paystack.webhook.rejected", {
      reason: "signature_invalid",
      signature: "secret-signature",
    }, logger);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0]?.[0]).toBe("[home-kit]");
    expect(logger.warn.mock.calls[0]?.[1]).toMatchObject({
      details: { reason: "signature_invalid", signature: REDACTED_LOG_VALUE },
      event: "paystack.webhook.rejected",
    });
  });
});

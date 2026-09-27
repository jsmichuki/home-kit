import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hasValidResendWebhookSignature,
  parseResendWebhookEvent,
} from "@/lib/resend/webhook";

const secretKey = Buffer.from("resend-webhook-test-secret-key-123");
const secret = `whsec_${secretKey.toString("base64")}`;
const eventId = "msg_01H8YKBK7TQ2T3Z5R6M7N8P9Q0";
const timestamp = String(Math.floor(Date.now() / 1000));
const body = Buffer.from(JSON.stringify({
  data: { email_id: "email_123" },
  type: "email.delivered",
}));

function signedHeaders(bodyToSign = body) {
  const signature = createHmac("sha256", secretKey)
    .update(Buffer.concat([Buffer.from(`${eventId}.${timestamp}.`), bodyToSign]))
    .digest("base64");

  return new Headers({
    "svix-id": eventId,
    "svix-signature": `v1,${signature}`,
    "svix-timestamp": timestamp,
  });
}

describe("Resend webhook verification", () => {
  it("accepts a current raw Svix-signed payload", () => {
    expect(hasValidResendWebhookSignature(body, signedHeaders(), secret)).toBe(true);
  });

  it("rejects a payload changed after signing", () => {
    expect(
      hasValidResendWebhookSignature(
        Buffer.from(`${body.toString("utf8")} `),
        signedHeaders(),
        secret,
      ),
    ).toBe(false);
  });

  it("rejects expired signatures", () => {
    expect(
      hasValidResendWebhookSignature(
        body,
        signedHeaders(),
        secret,
        (Number(timestamp) + 301) * 1000,
      ),
    ).toBe(false);
  });

  it("parses only event identity, email id, and event type", () => {
    expect(parseResendWebhookEvent(body, eventId)).toEqual({
      emailId: "email_123",
      eventId,
      eventType: "email.delivered",
      tracked: true,
    });
  });
});

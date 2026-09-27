import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PAYSTACK_SIGNATURE_HEADER = "x-paystack-signature";

const PAYSTACK_SIGNATURE_HEX_LENGTH = 128;

export type PaystackWebhookEvent = {
  event: string;
  data: {
    id: number;
    reference: string;
  };
};

export function createPaystackWebhookSignature(rawBody: Buffer, secret: string) {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

/**
 * Paystack signs the exact request body with HMAC SHA512. Reject malformed
 * signatures before comparing fixed-length byte sequences to avoid a timing
 * oracle and to keep arbitrary values out of crypto comparison functions.
 */
export function hasValidPaystackWebhookSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string,
) {
  if (
    !signature ||
    signature.length !== PAYSTACK_SIGNATURE_HEX_LENGTH ||
    !/^[a-f0-9]+$/i.test(signature)
  ) {
    return false;
  }

  const expected = Buffer.from(createPaystackWebhookSignature(rawBody, secret), "hex");
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && timingSafeEqual(expected, received);
}

export function parsePaystackWebhookEvent(rawBody: Buffer): PaystackWebhookEvent | null {
  try {
    const value: unknown = JSON.parse(rawBody.toString("utf8"));

    if (!isRecord(value) || typeof value.event !== "string" || !isRecord(value.data)) {
      return null;
    }

    if (
      typeof value.data.reference !== "string" ||
      value.data.reference.length === 0 ||
      typeof value.data.id !== "number" ||
      !Number.isSafeInteger(value.data.id) ||
      value.data.id < 0
    ) {
      return null;
    }

    return {
      event: value.event,
      data: {
        id: value.data.id,
        reference: value.data.reference,
      },
    };
  } catch {
    return null;
  }
}

export function createWebhookPayloadHash(rawBody: Buffer) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

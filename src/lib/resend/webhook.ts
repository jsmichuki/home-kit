import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const RESEND_SVIX_ID_HEADER = "svix-id";
export const RESEND_SVIX_SIGNATURE_HEADER = "svix-signature";
export const RESEND_SVIX_TIMESTAMP_HEADER = "svix-timestamp";

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;
const TRACKED_RESEND_EVENTS = new Set([
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.sent",
]);

function signingKey(secret: string) {
  const encodedSecret = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;

  try {
    const key = Buffer.from(encodedSecret, "base64");
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function possibleSignatures(header: string) {
  return header.split(" ").flatMap((item) => {
    const [version, signature] = item.trim().split(",", 2);
    return version === "v1" && signature ? [signature] : [];
  });
}

/** Verifies the raw Svix signed content required by Resend webhooks. */
export function hasValidResendWebhookSignature(
  rawBody: Buffer,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const eventId = headers.get(RESEND_SVIX_ID_HEADER);
  const timestamp = headers.get(RESEND_SVIX_TIMESTAMP_HEADER);
  const signatureHeader = headers.get(RESEND_SVIX_SIGNATURE_HEADER);
  const key = signingKey(secret);

  if (!eventId || !timestamp || !signatureHeader || !key) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || Math.abs(now - timestampSeconds * 1000) > MAX_WEBHOOK_AGE_SECONDS * 1000) {
    return false;
  }

  const signedContent = Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
    rawBody,
  ]);
  const expected = createHmac("sha256", key).update(signedContent).digest();

  return possibleSignatures(signatureHeader).some((candidate) => {
    let supplied: Buffer;
    try {
      supplied = Buffer.from(candidate, "base64");
    } catch {
      return false;
    }

    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

export function createResendWebhookPayloadHash(rawBody: Buffer) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export type ResendWebhookEvent = {
  emailId: string | null;
  eventId: string;
  eventType: string;
  tracked: boolean;
};

/** Parses only non-sensitive fields that are persisted for delivery state. */
export function parseResendWebhookEvent(rawBody: Buffer, eventId: string | null): ResendWebhookEvent | null {
  if (!eventId || eventId.length > 200) {
    return null;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const value = body as Record<string, unknown>;
  const data = value.data;
  const emailId = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>).email_id
    : null;

  if (
    typeof value.type !== "string" ||
    value.type.length === 0 ||
    value.type.length > 100 ||
    !(typeof emailId === "string" || emailId === null)
  ) {
    return null;
  }

  return {
    emailId,
    eventId,
    eventType: value.type,
    tracked: TRACKED_RESEND_EVENTS.has(value.type),
  };
}

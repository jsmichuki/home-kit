import "server-only";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export type ResendEmailRequest = {
  from: string;
  html: string;
  idempotencyKey: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string;
};

export class ResendDeliveryError extends Error {
  readonly retryable: boolean;
  readonly safeCode: string;

  constructor(safeCode: string, retryable: boolean) {
    super(safeCode);
    this.name = "ResendDeliveryError";
    this.retryable = retryable;
    this.safeCode = safeCode;
  }
}

function resendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new ResendDeliveryError("resend_configuration_missing", false);
  }

  return apiKey;
}

function parseEmailId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
}

/**
 * Minimal Resend REST client so the API key remains server-only and retries
 * always carry the same caller-provided idempotency key.
 */
export async function sendResendEmail(input: ResendEmailRequest) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 256) {
    throw new ResendDeliveryError("resend_idempotency_key_invalid", false);
  }

  let response: Response;
  try {
    response = await fetch(RESEND_EMAIL_ENDPOINT, {
      body: JSON.stringify({
        from: input.from,
        html: input.html,
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
        to: [input.to],
      }),
      headers: {
        Authorization: `Bearer ${resendApiKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // The API response is unknowable after a transport failure. The matching
    // idempotency key protects immediate retries from creating a second email.
    throw new ResendDeliveryError("resend_transport_unavailable", true);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Do not retain provider response text: it can contain recipient details.
  }

  if (!response.ok) {
    throw new ResendDeliveryError(
      response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500
        ? "resend_provider_unavailable"
        : "resend_provider_rejected",
      response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500,
    );
  }

  const emailId = parseEmailId(body);
  if (!emailId) {
    throw new ResendDeliveryError("resend_response_invalid", true);
  }

  return { emailId };
}

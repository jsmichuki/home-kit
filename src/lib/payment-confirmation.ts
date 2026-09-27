export const PAYMENT_CONFIRMATION_STATUSES = [
  "pending",
  "fulfilled",
  "failed",
  "abandoned",
  "cancelled",
  "unknown",
] as const;

export type PaymentConfirmationStatus =
  (typeof PAYMENT_CONFIRMATION_STATUSES)[number];

export type PaymentConfirmationResponse = {
  status: PaymentConfirmationStatus;
  guideCount?: number;
  maskedEmail?: string;
  // Section 10 will populate this only after an access grant is validated.
  downloadPath?: string | null;
};

export const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{12,128}$/;
export const CONFIRMATION_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isValidPaymentReference(value: string) {
  return PAYMENT_REFERENCE_PATTERN.test(value);
}

export function isValidConfirmationSecret(value: string) {
  return CONFIRMATION_SECRET_PATTERN.test(value);
}

export function isPaymentConfirmationResponse(
  value: unknown,
): value is PaymentConfirmationResponse {
  if (!value || typeof value !== "object" || !("status" in value)) {
    return false;
  }

  return PAYMENT_CONFIRMATION_STATUSES.includes(
    (value as { status?: PaymentConfirmationStatus }).status as PaymentConfirmationStatus,
  );
}

import "server-only";

const PAYSTACK_API_URL = "https://api.paystack.co/transaction/verify";

export type VerifiedPaystackTransaction = {
  amountInSubunits: number;
  currency: string;
  customerEmail: string;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  reference: string;
  transactionId: number;
};

type PaystackVerificationResponse = {
  status?: unknown;
  data?: unknown;
};

type VerifyPaystackTransactionOptions = {
  fetchImplementation?: typeof fetch;
  secretKey?: string;
};

export class PaystackVerificationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PaystackVerificationError";
  }
}

export async function verifyPaystackTransaction(
  reference: string,
  options: VerifyPaystackTransactionOptions = {},
): Promise<VerifiedPaystackTransaction> {
  const secretKey = options.secretKey ?? process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new PaystackVerificationError("Paystack server configuration is incomplete.", false);
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  let response: Response;

  try {
    response = await fetchImplementation(
      `${PAYSTACK_API_URL}/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        cache: "no-store",
        method: "GET",
      },
    );
  } catch {
    throw new PaystackVerificationError("Paystack verification request failed.", true);
  }

  if (!response.ok) {
    throw new PaystackVerificationError(
      "Paystack verification was unavailable.",
      response.status === 429 || response.status >= 500,
    );
  }

  let responseBody: PaystackVerificationResponse;

  try {
    responseBody = (await response.json()) as PaystackVerificationResponse;
  } catch {
    throw new PaystackVerificationError("Paystack verification returned an invalid response.", true);
  }

  if (responseBody.status !== true || !isRecord(responseBody.data)) {
    throw new PaystackVerificationError("Paystack did not verify the transaction.", false);
  }

  const data = responseBody.data;
  const metadata = parseMetadata(data.metadata);
  const customer = isRecord(data.customer) ? data.customer : null;

  if (
    data.status !== "success" ||
    data.reference !== reference ||
    typeof data.amount !== "number" ||
    !Number.isSafeInteger(data.amount) ||
    data.amount < 0 ||
    typeof data.currency !== "string" ||
    !/^[A-Z]{3}$/.test(data.currency) ||
    typeof data.id !== "number" ||
    !Number.isSafeInteger(data.id) ||
    data.id < 0 ||
    !customer ||
    typeof customer.email !== "string" ||
    customer.email.length === 0 ||
    !metadata
  ) {
    throw new PaystackVerificationError("Paystack verification data was incomplete.", false);
  }

  return {
    amountInSubunits: data.amount,
    currency: data.currency,
    customerEmail: customer.email,
    metadata,
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
    reference: data.reference,
    transactionId: data.id,
  };
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

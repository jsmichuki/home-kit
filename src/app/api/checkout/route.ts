import { NextRequest, NextResponse } from "next/server";
import {
  CheckoutValidationError,
  parseCheckoutRequest,
} from "@/lib/checkout-contract";
import {
  CheckoutServiceError,
  createCheckout,
  createConfirmationSecret,
  isValidIdempotencyKey,
} from "@/lib/checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const checkoutAttempts = new Map<string, RateLimitEntry>();

export async function POST(request: NextRequest) {
  let parsedRequest;
  try {
    parsedRequest = parseCheckoutRequest(await request.json());
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return errorResponse(error.message, "VALIDATION_ERROR", 400);
    }

    return errorResponse("Submit a valid checkout request.", "VALIDATION_ERROR", 400);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return errorResponse(
      "Your checkout request could not be processed. Refresh the page and try again.",
      "VALIDATION_ERROR",
      400,
    );
  }

  const retryAfter = takeRateLimit(
    `${getClientAddress(request)}:${parsedRequest.normalizedEmail}`,
  );
  if (retryAfter !== null) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many checkout attempts. Please try again shortly.",
        },
      },
      {
        headers: { "Retry-After": String(retryAfter) },
        status: 429,
      },
    );
  }

  try {
    const checkout = await createCheckout({
      confirmationSecret: createConfirmationSecret(),
      deliveryEmail: parsedRequest.deliveryEmail,
      idempotencyKey,
      productIds: parsedRequest.productIds,
    });

    return NextResponse.json(checkout, { status: 201 });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return errorResponse(error.message, "VALIDATION_ERROR", 400);
    }

    if (error instanceof CheckoutServiceError) {
      return errorResponse(error.message, error.code, error.status);
    }

    return errorResponse(
      "We could not start your payment. Please try again.",
      "PAYMENT_UNAVAILABLE",
      502,
    );
  }
}

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function getClientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function takeRateLimit(key: string) {
  const now = Date.now();
  const entry = checkoutAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    checkoutAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }

  entry.count += 1;
  return null;
}

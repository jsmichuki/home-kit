import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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
import { logOperationalEvent } from "@/lib/observability/safe-log";

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
  const checkoutRequestId = randomUUID();
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
      logOperationalEvent("error", "checkout.request_failed", {
        checkoutRequestId,
        code: error.code,
        error,
        stage: error.stage ?? "unknown",
        status: error.status,
      });
      return errorResponse(error.message, error.code, error.status, checkoutRequestId);
    }

    logOperationalEvent("error", "checkout.request_failed", {
      checkoutRequestId,
      error,
      stage: "unexpected",
      status: 502,
    });
    return errorResponse(
      "Secure checkout is temporarily unavailable. Your selection is saved, so please try again in a moment.",
      "PAYMENT_UNAVAILABLE",
      502,
      checkoutRequestId,
    );
  }
}

function errorResponse(message: string, code: string, status: number, requestId?: string) {
  return NextResponse.json(
    { error: { code, message, ...(requestId ? { requestId } : {}) } },
    { status },
  );
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

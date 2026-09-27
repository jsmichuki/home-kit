import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  isValidConfirmationSecret,
  isValidPaymentReference,
  type PaymentConfirmationResponse,
} from "@/lib/payment-confirmation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type OrderStatusRow = {
  confirmation_secret_hash: string | null;
  customer_email: string;
  entitlement_snapshot: unknown;
  status: string;
};

const SAFE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function unknownResponse() {
  return Response.json(
    { status: "unknown" },
    { headers: SAFE_RESPONSE_HEADERS },
  );
}

function maskEmail(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === email.length - 1) {
    return "***";
  }

  const localPart = email.slice(0, atIndex);
  return `${localPart.slice(0, 1)}***${email.slice(atIndex)}`;
}

function secretHashesMatch(secret: string, storedHash: string | null) {
  const suppliedHash = createHash("sha256").update(secret).digest();
  const storedHashBuffer = storedHash && /^[a-f0-9]{64}$/i.test(storedHash)
    ? Buffer.from(storedHash, "hex")
    : null;

  if (!storedHashBuffer || storedHashBuffer.length !== suppliedHash.length) {
    // Keep the work comparable for malformed or missing database values.
    timingSafeEqual(suppliedHash, suppliedHash);
    return false;
  }

  return timingSafeEqual(suppliedHash, storedHashBuffer);
}

function fulfilledGuideCount(snapshot: unknown) {
  return Array.isArray(snapshot) ? snapshot.length : 0;
}

function toSafeStatus(order: OrderStatusRow): PaymentConfirmationResponse {
  switch (order.status) {
    case "fulfilled":
      return {
        status: "fulfilled",
        guideCount: fulfilledGuideCount(order.entitlement_snapshot),
        maskedEmail: maskEmail(order.customer_email),
        // Do not derive an access URL from the transaction reference. Section 10
        // will add a grant-validated path when secure download access exists.
        downloadPath: null,
      };
    case "failed":
    case "refunded":
      return { status: "failed" };
    case "abandoned":
      return { status: "abandoned" };
    case "cancelled":
      return { status: "cancelled" };
    default:
      // `payment_pending` and `paid` remain pending until fulfillment commits.
      return { status: "pending" };
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const confirmation = new URL(request.url).searchParams.get("confirmation") ?? "";

  // A reference alone is deliberately insufficient to reveal whether an order
  // exists, its state, its customer, or any entitlement information.
  if (
    !isValidPaymentReference(reference)
    || !isValidConfirmationSecret(confirmation)
  ) {
    return unknownResponse();
  }

  try {
    const { data: untypedData, error } = await createSupabaseAdminClient()
      .from("commerce_orders")
      .select("status, customer_email, entitlement_snapshot, confirmation_secret_hash")
      .eq("paystack_reference", reference)
      .maybeSingle();
    const data = untypedData as OrderStatusRow | null;

    if (error || !data || !secretHashesMatch(confirmation, data.confirmation_secret_hash)) {
      return unknownResponse();
    }

    return Response.json(toSafeStatus(data), { headers: SAFE_RESPONSE_HEADERS });
  } catch {
    // Do not turn a configuration or database error into an order-discovery
    // oracle. The generic state gives the customer a support path instead.
    return unknownResponse();
  }
}

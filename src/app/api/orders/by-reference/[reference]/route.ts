import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { createAccessToken } from "@/lib/access-token";
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
  id: string;
  status: string;
};

type ActiveGrantRow = {
  id: string;
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

async function getValidatedDownloadPath(order: OrderStatusRow) {
  try {
    const { data: untypedGrant, error } = await createSupabaseAdminClient()
      .from("commerce_access_grants")
      .select("id")
      .eq("order_id", order.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    const grant = untypedGrant as ActiveGrantRow | null;

    if (error || !grant?.id) {
      return null;
    }

    return `/downloads/${encodeURIComponent(createAccessToken(grant.id))}`;
  } catch {
    // Access is always independently checked by the download route. A
    // configuration problem here must not leak a fulfilled order to callers.
    return null;
  }
}

async function toSafeStatus(order: OrderStatusRow): Promise<PaymentConfirmationResponse> {
  switch (order.status) {
    case "fulfilled":
      return {
        status: "fulfilled",
        guideCount: fulfilledGuideCount(order.entitlement_snapshot),
        maskedEmail: maskEmail(order.customer_email),
        downloadPath: await getValidatedDownloadPath(order),
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
      .select("id, status, customer_email, entitlement_snapshot, confirmation_secret_hash")
      .eq("paystack_reference", reference)
      .maybeSingle();
    const data = untypedData as OrderStatusRow | null;

    if (error || !data || !secretHashesMatch(confirmation, data.confirmation_secret_hash)) {
      return unknownResponse();
    }

    return Response.json(await toSafeStatus(data), { headers: SAFE_RESPONSE_HEADERS });
  } catch {
    // Do not turn a configuration or database error into an order-discovery
    // oracle. The generic state gives the customer a support path instead.
    return unknownResponse();
  }
}

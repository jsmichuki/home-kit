import { NextResponse } from "next/server";

import {
  fulfillVerifiedPaystackCharge,
  type PaystackFulfillmentOutcome,
} from "@/lib/paystack/fulfillment";
import {
  createAccessToken,
  createWebhookPayloadHash,
  hashAccessToken,
  hasValidPaystackWebhookSignature,
  parsePaystackWebhookEvent,
  PAYSTACK_SIGNATURE_HEADER,
} from "@/lib/paystack/webhook";
import {
  PaystackVerificationError,
  verifyPaystackTransaction,
} from "@/lib/paystack/transactions";

export const runtime = "nodejs";

const ACCESS_GRANT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    recordWebhookIssue("server_configuration_missing");
    return NextResponse.json({ error: "Webhook configuration unavailable." }, { status: 503 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    recordWebhookIssue("payload_too_large");
    return NextResponse.json({ error: "Webhook payload too large." }, { status: 413 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    recordWebhookIssue("payload_too_large");
    return NextResponse.json({ error: "Webhook payload too large." }, { status: 413 });
  }
  const signature = request.headers.get(PAYSTACK_SIGNATURE_HEADER);

  if (!hasValidPaystackWebhookSignature(rawBody, signature, secretKey)) {
    recordWebhookIssue("signature_invalid");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = parsePaystackWebhookEvent(rawBody);

  if (!event) {
    recordWebhookIssue("payload_invalid");
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (event.event !== "charge.success") {
    return acknowledgement("ignored");
  }

  try {
    const verification = await verifyPaystackTransaction(event.data.reference);

    if (verification.transactionId !== event.data.id) {
      recordWebhookIssue("transaction_id_mismatch");
      return acknowledgement("rejected");
    }

    const accessToken = createAccessToken();
    const outcome = await fulfillVerifiedPaystackCharge({
      accessTokenExpiresAt: new Date(Date.now() + ACCESS_GRANT_DURATION_MS),
      accessTokenHash: hashAccessToken(accessToken),
      payloadHash: createWebhookPayloadHash(rawBody),
      providerEventId: `charge.success:${event.data.id}`,
      reference: verification.reference,
      transactionId: verification.transactionId,
      verificationSummary: {
        amount_in_subunits: verification.amountInSubunits,
        currency: verification.currency,
        paid_at: verification.paidAt,
        reference: verification.reference,
        transaction_id: verification.transactionId,
        transaction_status: "success",
      },
      verifiedAmountInSubunits: verification.amountInSubunits,
      verifiedCurrency: verification.currency,
      verifiedEmail: verification.customerEmail,
      verifiedMetadata: verification.metadata,
    });

    if (outcome.outcome === "rejected" || outcome.outcome === "ignored") {
      recordWebhookIssue(`fulfillment_${outcome.outcome}`);
    }

    return acknowledgement(outcome.outcome);
  } catch (error) {
    if (error instanceof PaystackVerificationError) {
      recordWebhookIssue("verification_failed");
      return error.retryable
        ? NextResponse.json({ error: "Webhook processing failed." }, { status: 503 })
        : acknowledgement("rejected");
    }

    recordWebhookIssue("fulfillment_failed");

    // Non-2xx responses let Paystack retry a temporary verification or database outage.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
  }
}

function acknowledgement(outcome: PaystackFulfillmentOutcome | "ignored") {
  return NextResponse.json({ received: true, outcome });
}

/** Keep observability useful without logging secrets, body content, or buyer data. */
function recordWebhookIssue(reason: string) {
  console.warn("[paystack-webhook]", { reason });
}

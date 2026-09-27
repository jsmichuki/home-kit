import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import { createAccessToken } from "@/lib/access-token";
import { hashAccessToken } from "@/lib/access";
import { logOperationalEvent } from "@/lib/observability/safe-log";
import { deliverInitialFulfillmentEmail } from "@/lib/fulfillment-outbox";

import {
  fulfillVerifiedPaystackCharge,
  type PaystackFulfillmentOutcome,
} from "@/lib/paystack/fulfillment";
import {
  createWebhookPayloadHash,
  hasValidPaystackWebhookSignature,
  parsePaystackWebhookEvent,
  PAYSTACK_SIGNATURE_HEADER,
} from "@/lib/paystack/webhook";
import {
  PaystackVerificationError,
  verifyPaystackTransaction,
} from "@/lib/paystack/transactions";

export const runtime = "nodejs";
// A Resend call may need its configured 15 second timeout after the Paystack
// acknowledgement has been sent. The durable outbox remains the fallback.
export const maxDuration = 60;

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

    const accessGrantId = randomUUID();
    const accessToken = createAccessToken(accessGrantId);
    const outcome = await fulfillVerifiedPaystackCharge({
      accessGrantId,
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

    const immediateDeliveryGrantId = outcome.access_grant_id;
    if (outcome.outcome === "fulfilled" && immediateDeliveryGrantId) {
      after(async () => {
        try {
          const delivery = await deliverInitialFulfillmentEmail({
            accessGrantId: immediateDeliveryGrantId,
          });
          logOperationalEvent("info", "paystack.webhook.delivery_attempted", delivery);
        } catch {
          // The row stays in the durable outbox for the GitHub recovery worker.
          logOperationalEvent("error", "paystack.webhook.delivery_deferred", {});
        }
      });
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
  logOperationalEvent("warn", "paystack.webhook.rejected", { reason });
}

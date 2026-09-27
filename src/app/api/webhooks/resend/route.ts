import { NextResponse } from "next/server";

import { logOperationalEvent } from "@/lib/observability/safe-log";
import {
  createResendWebhookPayloadHash,
  hasValidResendWebhookSignature,
  parseResendWebhookEvent,
  RESEND_SVIX_ID_HEADER,
} from "@/lib/resend/webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    logOperationalEvent("error", "resend.webhook.configuration_missing", {});
    return NextResponse.json({ error: "Webhook configuration unavailable." }, { status: 503 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    logOperationalEvent("warn", "resend.webhook.payload_too_large", {});
    return NextResponse.json({ error: "Webhook payload too large." }, { status: 413 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    logOperationalEvent("warn", "resend.webhook.payload_too_large", {});
    return NextResponse.json({ error: "Webhook payload too large." }, { status: 413 });
  }

  if (!hasValidResendWebhookSignature(rawBody, request.headers, secret)) {
    logOperationalEvent("warn", "resend.webhook.signature_invalid", {});
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = parseResendWebhookEvent(
    rawBody,
    request.headers.get(RESEND_SVIX_ID_HEADER),
  );

  if (!event) {
    logOperationalEvent("warn", "resend.webhook.payload_invalid", {});
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  try {
    const { error } = await createSupabaseAdminClient().rpc(
      "commerce_record_resend_webhook_event",
      {
        p_event_type: event.eventType,
        p_payload_hash: createResendWebhookPayloadHash(rawBody),
        p_resend_email_id: event.emailId,
        p_resend_event_id: event.eventId,
      },
    );

    if (error) {
      logOperationalEvent("error", "resend.webhook.persistence_failed", {});
      return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
    }

    return NextResponse.json({ received: true, outcome: event.tracked ? "recorded" : "ignored" });
  } catch {
    logOperationalEvent("error", "resend.webhook.persistence_failed", {});
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
  }
}

import "server-only";

import { createAccessToken, buildAccessUrl } from "@/lib/access-token";
import type { ClaimedFulfillmentJob } from "@/lib/fulfillment-outbox";
import { SUPPORT_EMAIL } from "@/lib/site";
import { ResendDeliveryError, sendResendEmail } from "@/lib/resend/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DELIVERY_MESSAGE_TYPES = ["delivery_link", "delivery_link_resend"] as const;
type DeliveryMessageType = (typeof DELIVERY_MESSAGE_TYPES)[number];

type DeliveryRpcClient = {
  rpc: (
    functionName: string,
    parameters?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type PreparedDeliveryEmail = {
  access_grant_expires_at: string;
  amount_in_subunits: number;
  currency: string;
  delivery_email: string;
  delivery_status: string;
  order_public_id: string;
  paystack_reference: string;
  resend_email_id: string | null;
  resend_idempotency_key: string;
  selected_items: Array<{ product_title: string }>;
  should_send: boolean;
};

function requireResendFromAddress() {
  const from = process.env.RESEND_FROM_EMAIL;

  if (!from) {
    throw new ResendDeliveryError("resend_sender_missing", false);
  }

  return from;
}

function isDeliveryMessageType(value: unknown): value is DeliveryMessageType {
  return typeof value === "string" && DELIVERY_MESSAGE_TYPES.includes(value as DeliveryMessageType);
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function deliveryMessageType(job: ClaimedFulfillmentJob): DeliveryMessageType {
  // Existing jobs created before Section 9 are initial deliveries.
  const candidate = job.payload.message_type ?? "delivery_link";

  if (!isDeliveryMessageType(candidate)) {
    throw new ResendDeliveryError("delivery_message_type_invalid", false);
  }

  return candidate;
}

export function deliveryIdempotencyKey(
  accessGrantId: string,
  messageType: DeliveryMessageType,
  deliveryRequestId?: string,
) {
  const identity = deliveryRequestId ?? accessGrantId;

  if (!isUuid(identity)) {
    throw new ResendDeliveryError("delivery_request_identity_invalid", false);
  }

  return `home-kit/delivery/${messageType}/${identity.toLowerCase()}`;
}

function isPreparedIdempotencyKey(baseKey: string, preparedKey: string) {
  if (preparedKey === baseKey) {
    return true;
  }

  const retryPrefix = `${baseKey}/retry/`;
  const retrySuffix = preparedKey.startsWith(retryPrefix)
    ? preparedKey.slice(retryPrefix.length)
    : "";

  return /^[1-9][0-9]*$/.test(retrySuffix);
}

function asPreparedDeliveryEmail(value: unknown): PreparedDeliveryEmail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const selectedItems = record.selected_items;

  if (
    typeof record.access_grant_expires_at !== "string" ||
    typeof record.amount_in_subunits !== "number" ||
    !Number.isSafeInteger(record.amount_in_subunits) ||
    typeof record.currency !== "string" ||
    typeof record.delivery_email !== "string" ||
    typeof record.delivery_status !== "string" ||
    typeof record.order_public_id !== "string" ||
    typeof record.paystack_reference !== "string" ||
    !(typeof record.resend_email_id === "string" || record.resend_email_id === null) ||
    typeof record.resend_idempotency_key !== "string" ||
    !Array.isArray(selectedItems) ||
    !selectedItems.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).product_title === "string") ||
    typeof record.should_send !== "boolean"
  ) {
    return null;
  }

  return record as unknown as PreparedDeliveryEmail;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function formatAmount(amountInSubunits: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      style: "currency",
    }).format(amountInSubunits / 100);
  } catch {
    return `${currency} ${(amountInSubunits / 100).toFixed(2)}`;
  }
}

function formatExpiry(expiresAt: string) {
  const date = new Date(expiresAt);

  return Number.isNaN(date.valueOf())
    ? "the access period shown on your download page"
    : date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
}

export function renderDeliveryEmail(input: {
  accessUrl: string;
  amountInSubunits: number;
  currency: string;
  expiresAt: string;
  guideTitles: readonly string[];
  orderPublicId: string;
  paystackReference: string;
}) {
  const guideList = input.guideTitles.length > 0
    ? input.guideTitles.map((title) => `• ${title}`).join("\n")
    : "Your selected guides";
  const safeGuideList = input.guideTitles.length > 0
    ? input.guideTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")
    : "<li>Your selected guides</li>";
  const amount = formatAmount(input.amountInSubunits, input.currency);
  const expiry = formatExpiry(input.expiresAt);
  const safeUrl = escapeHtml(input.accessUrl);

  return {
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media only screen and (max-width:600px){.home-kit-email{padding:16px!important}.home-kit-button{display:block!important;text-align:center}}</style></head><body style="margin:0;background:#f5f5f4"><main class="home-kit-email" style="box-sizing:border-box;font-family:Arial,sans-serif;line-height:1.5;color:#171717;max-width:600px;margin:0 auto;padding:24px"><div style="background:#ffffff;padding:24px"><h1>Your Home Kit guides are ready</h1><p>Thank you for your purchase. Use the secure link below to view and download your guides.</p><p><a class="home-kit-button" href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;text-decoration:none;border-radius:4px">Open your downloads</a></p><p>If the button does not work, copy this link into your browser:<br><a href="${safeUrl}" style="overflow-wrap:anywhere">${safeUrl}</a></p><h2>Your purchase</h2><ul>${safeGuideList}</ul><p><strong>Total:</strong> ${escapeHtml(amount)}<br><strong>Receipt reference:</strong> ${escapeHtml(input.paystackReference)}<br><strong>Order:</strong> ${escapeHtml(input.orderPublicId)}<br><strong>Access expires:</strong> ${escapeHtml(expiry)}</p><p>This delivery message is about your purchase only and is not a marketing subscription.</p><p>Need help? Contact <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p></div></main></body></html>`,
    subject: "Your Home Kit guides are ready",
    text: `Your Home Kit guides are ready\n\nThank you for your purchase. Open your downloads:\n${input.accessUrl}\n\nYour purchase:\n${guideList}\n\nTotal: ${amount}\nReceipt reference: ${input.paystackReference}\nOrder: ${input.orderPublicId}\nAccess expires: ${expiry}\n\nThis delivery message is about your purchase only and is not a marketing subscription.\n\nNeed help? ${SUPPORT_EMAIL}`,
  };
}

async function rpcOrThrow(
  client: DeliveryRpcClient,
  functionName: string,
  parameters: Record<string, unknown>,
) {
  const result = await client.rpc(functionName, parameters);

  if (result.error) {
    throw new ResendDeliveryError("delivery_database_unavailable", true);
  }

  return result.data;
}

/** Executes one claimed outbox job with a deterministic Resend idempotency key. */
export async function sendDeliveryEmailForJob(
  job: ClaimedFulfillmentJob,
  client = createSupabaseAdminClient() as unknown as DeliveryRpcClient,
) {
  const messageType = deliveryMessageType(job);
  const deliveryRequestId = job.payload.delivery_request_id;
  const idempotencyKey = deliveryIdempotencyKey(
    job.payload.access_grant_id,
    messageType,
    deliveryRequestId,
  );
  const preparedData = await rpcOrThrow(client, "commerce_prepare_delivery_email", {
    p_access_grant_id: job.payload.access_grant_id,
    p_delivery_request_id: deliveryRequestId ?? null,
    p_idempotency_key: idempotencyKey,
    p_message_type: messageType,
    p_order_id: job.order_id,
  });
  const prepared = asPreparedDeliveryEmail(Array.isArray(preparedData) ? preparedData[0] : preparedData);

  if (!prepared || !isPreparedIdempotencyKey(idempotencyKey, prepared.resend_idempotency_key)) {
    throw new ResendDeliveryError("delivery_prepare_result_invalid", true);
  }

  if (!prepared.should_send) {
    return;
  }

  const providerIdempotencyKey = prepared.resend_idempotency_key;

  const accessToken = createAccessToken(job.payload.access_grant_id);
  const accessUrl = buildAccessUrl(accessToken);
  const content = renderDeliveryEmail({
    accessUrl,
    amountInSubunits: prepared.amount_in_subunits,
    currency: prepared.currency,
    expiresAt: prepared.access_grant_expires_at,
    guideTitles: prepared.selected_items.map((item) => item.product_title),
    orderPublicId: prepared.order_public_id,
    paystackReference: prepared.paystack_reference,
  });

  try {
    const result = await sendResendEmail({
      from: requireResendFromAddress(),
      html: content.html,
      idempotencyKey: providerIdempotencyKey,
      replyTo: SUPPORT_EMAIL,
      subject: content.subject,
      text: content.text,
      to: prepared.delivery_email,
    });

    await rpcOrThrow(client, "commerce_record_resend_send_result", {
      p_idempotency_key: providerIdempotencyKey,
      p_order_id: job.order_id,
      p_provider_response: { id: result.emailId },
      p_resend_email_id: result.emailId,
    });
  } catch (error) {
    const deliveryError = error instanceof ResendDeliveryError
      ? error
      : new ResendDeliveryError("resend_delivery_unknown", true);

    try {
      await rpcOrThrow(client, "commerce_record_resend_send_failure", {
        p_error: deliveryError.safeCode,
        p_idempotency_key: providerIdempotencyKey,
        p_order_id: job.order_id,
      });
    } catch {
      // The original failure stays retryable; no provider or buyer data is exposed.
    }

    throw deliveryError;
  }
}

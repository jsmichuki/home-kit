import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PAYSTACK_FULFILLMENT_RPC = "commerce_fulfill_verified_paystack_charge";

export type PaystackFulfillmentInput = {
  accessTokenExpiresAt: Date;
  accessTokenHash: string;
  payloadHash: string;
  providerEventId: string;
  reference: string;
  transactionId: number;
  verificationSummary: Record<string, unknown>;
  verifiedAmountInSubunits: number;
  verifiedCurrency: string;
  verifiedEmail: string;
  verifiedMetadata: Record<string, unknown>;
};

export type PaystackFulfillmentOutcome = "duplicate" | "fulfilled" | "ignored" | "rejected";

type PaystackFulfillmentResult = {
  access_grant_id: string | null;
  fulfilled_at: string | null;
  order_public_id: string | null;
  outcome: PaystackFulfillmentOutcome;
};

/**
 * Calls the database-owned transaction that records the provider event,
 * verifies order invariants, creates one grant, and queues one delivery job.
 * The route deliberately performs no multi-table writes outside this RPC.
 */
export async function fulfillVerifiedPaystackCharge(
  input: PaystackFulfillmentInput,
): Promise<PaystackFulfillmentResult> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(PAYSTACK_FULFILLMENT_RPC, {
    p_access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
    p_access_token_hash: input.accessTokenHash,
    p_payload_hash: input.payloadHash,
    p_provider_event_id: input.providerEventId,
    p_reference: input.reference,
    p_transaction_id: input.transactionId,
    p_verification_summary: input.verificationSummary,
    p_verified_amount_in_subunits: input.verifiedAmountInSubunits,
    p_verified_currency: input.verifiedCurrency,
    p_verified_email: input.verifiedEmail,
    p_verified_metadata: input.verifiedMetadata,
  });

  if (error || !Array.isArray(data) || data.length !== 1 || !isFulfillmentResult(data[0])) {
    throw new Error("Paystack fulfillment could not be recorded.");
  }

  return data[0];
}

function isFulfillmentResult(value: unknown): value is PaystackFulfillmentResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    (result.outcome === "fulfilled" ||
      result.outcome === "duplicate" ||
      result.outcome === "ignored" ||
      result.outcome === "rejected") &&
    (typeof result.order_public_id === "string" || result.order_public_id === null) &&
    (typeof result.access_grant_id === "string" || result.access_grant_id === null) &&
    (typeof result.fulfilled_at === "string" || result.fulfilled_at === null)
  );
}

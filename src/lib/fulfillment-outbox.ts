import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_WORKER_LEASE_SECONDS = 15 * 60;

export type ClaimedFulfillmentJob = {
  attempts: number;
  claimed_at: string;
  id: string;
  job_type: "send_delivery_email";
  order_id: string;
  payload: {
    access_grant_id: string;
    order_public_id: string;
  };
};

type RpcClient = {
  rpc: (
    functionName: string,
    parameters?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type FulfillmentJobExecutor = (
  job: ClaimedFulfillmentJob,
) => Promise<void>;

export type FulfillmentDrainResult = {
  claimed: number;
  completed: number;
  failed: number;
};

function isClaimedFulfillmentJob(value: unknown): value is ClaimedFulfillmentJob {
  if (!value || typeof value !== "object") {
    return false;
  }

  const job = value as Record<string, unknown>;
  const payload = job.payload as Record<string, unknown> | null;

  return (
    typeof job.id === "string" &&
    typeof job.order_id === "string" &&
    job.job_type === "send_delivery_email" &&
    typeof job.attempts === "number" &&
    typeof job.claimed_at === "string" &&
    Boolean(payload) &&
    typeof payload?.access_grant_id === "string" &&
    typeof payload?.order_public_id === "string"
  );
}

function getSafeWorkerError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 1000);
  }

  return "The fulfillment worker could not process this job.";
}

async function assertRpcSucceeded(
  result: { error: { message: string } | null },
  message: string,
) {
  if (result.error) {
    throw new Error(message);
  }
}

/**
 * Claims work through a database function using SKIP LOCKED, so parallel
 * workers do not process one outbox row at the same time. The executor must
 * be idempotent because a process can end after provider delivery but before
 * the completion transaction is recorded.
 */
export async function drainFulfillmentOutbox({
  client = createSupabaseAdminClient() as unknown as RpcClient,
  limit = 10,
  sendDeliveryEmail,
}: {
  client?: RpcClient;
  limit?: number;
  sendDeliveryEmail: FulfillmentJobExecutor;
}): Promise<FulfillmentDrainResult> {
  const claimResult = await client.rpc("commerce_claim_fulfillment_jobs", {
    p_lease_seconds: OUTBOX_WORKER_LEASE_SECONDS,
    p_limit: limit,
  });

  await assertRpcSucceeded(
    claimResult,
    "We could not claim fulfillment work.",
  );

  const claimedJobs = Array.isArray(claimResult.data)
    ? claimResult.data.filter(isClaimedFulfillmentJob)
    : [];

  if (
    Array.isArray(claimResult.data) &&
    claimedJobs.length !== claimResult.data.length
  ) {
    throw new Error("The fulfillment queue returned an invalid job.");
  }

  let completed = 0;
  let failed = 0;

  for (const job of claimedJobs) {
    try {
      await sendDeliveryEmail(job);

      const completeResult = await client.rpc(
        "commerce_complete_fulfillment_job",
        { p_job_id: job.id },
      );
      await assertRpcSucceeded(
        completeResult,
        "We could not record fulfillment completion.",
      );
      completed += 1;
    } catch (error) {
      const retryResult = await client.rpc("commerce_retry_fulfillment_job", {
        p_error: getSafeWorkerError(error),
        p_job_id: job.id,
        p_max_attempts: OUTBOX_MAX_ATTEMPTS,
      });
      await assertRpcSucceeded(
        retryResult,
        "We could not record the fulfillment failure.",
      );
      failed += 1;
    }
  }

  return { claimed: claimedJobs.length, completed, failed };
}

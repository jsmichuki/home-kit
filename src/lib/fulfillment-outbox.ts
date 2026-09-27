import "server-only";

import { sendDeliveryEmailForJob } from "@/lib/resend/delivery-email";
import { ResendDeliveryError } from "@/lib/resend/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_WORKER_LEASE_SECONDS = 15 * 60;

export type ClaimedFulfillmentJob = {
  attempts: number;
  claimed_at: string;
  id: string;
  job_type: "send_delivery_email" | "send_delivery_email_resend";
  order_id: string;
  payload: {
    access_grant_id: string;
    delivery_request_id?: string;
    message_type?: "delivery_link" | "delivery_link_resend";
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
    (job.job_type === "send_delivery_email" || job.job_type === "send_delivery_email_resend") &&
    typeof job.attempts === "number" &&
    typeof job.claimed_at === "string" &&
    Boolean(payload) &&
    typeof payload?.access_grant_id === "string" &&
    typeof payload?.order_public_id === "string"
  );
}

function getSafeWorkerError(error: unknown) {
  if (error instanceof ResendDeliveryError) {
    return error.safeCode;
  }

  return "fulfillment_worker_unknown";
}

function maxAttemptsFor(error: unknown) {
  return error instanceof ResendDeliveryError && !error.retryable
    ? 1
    : OUTBOX_MAX_ATTEMPTS;
}

async function assertRpcSucceeded(
  result: { error: { message: string } | null },
  message: string,
) {
  if (result.error) {
    throw new Error(message);
  }
}

async function processClaimedFulfillmentJobs({
  client,
  jobs,
  sendDeliveryEmail,
}: {
  client: RpcClient;
  jobs: ClaimedFulfillmentJob[];
  sendDeliveryEmail: FulfillmentJobExecutor;
}): Promise<FulfillmentDrainResult> {
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
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
        p_max_attempts: maxAttemptsFor(error),
      });
      await assertRpcSucceeded(
        retryResult,
        "We could not record the fulfillment failure.",
      );
      failed += 1;
    }
  }

  return { claimed: jobs.length, completed, failed };
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
  sendDeliveryEmail = sendDeliveryEmailForJob,
}: {
  client?: RpcClient;
  limit?: number;
  sendDeliveryEmail?: FulfillmentJobExecutor;
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

  return processClaimedFulfillmentJobs({
    client,
    jobs: claimedJobs,
    sendDeliveryEmail,
  });
}

/**
 * Sends a newly fulfilled order without waiting for the next scheduled worker
 * run. A grant-specific database claim makes the outbox the arbiter when this
 * path races the GitHub recovery worker or another webhook delivery.
 */
export async function deliverInitialFulfillmentEmail({
  accessGrantId,
  client = createSupabaseAdminClient() as unknown as RpcClient,
  sendDeliveryEmail = sendDeliveryEmailForJob,
}: {
  accessGrantId: string;
  client?: RpcClient;
  sendDeliveryEmail?: FulfillmentJobExecutor;
}): Promise<FulfillmentDrainResult> {
  const claimResult = await client.rpc(
    "commerce_claim_initial_delivery_for_grant",
    {
      p_access_grant_id: accessGrantId,
      p_lease_seconds: OUTBOX_WORKER_LEASE_SECONDS,
    },
  );

  await assertRpcSucceeded(
    claimResult,
    "We could not claim the immediate delivery job.",
  );

  const claimedJobs = Array.isArray(claimResult.data)
    ? claimResult.data.filter(isClaimedFulfillmentJob)
    : [];

  if (
    !Array.isArray(claimResult.data)
    || claimedJobs.length !== claimResult.data.length
    || claimedJobs.length > 1
  ) {
    throw new Error("The immediate delivery claim returned an invalid job.");
  }

  return processClaimedFulfillmentJobs({
    client,
    jobs: claimedJobs,
    sendDeliveryEmail,
  });
}

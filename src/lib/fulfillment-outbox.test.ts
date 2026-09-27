import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  drainFulfillmentOutbox,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_WORKER_LEASE_SECONDS,
} from "@/lib/fulfillment-outbox";

const job = {
  attempts: 1,
  claimed_at: "2026-09-27T12:00:00.000Z",
  id: "48ceef37-4eb3-4113-b87b-31416f755a6a",
  job_type: "send_delivery_email" as const,
  order_id: "68150824-1c59-4fd7-a01f-940a1e967a8a",
  payload: {
    access_grant_id: "85033b69-9dcc-4dac-b5b2-56220d0d079a",
    order_public_id: "ord_test123",
  },
};

describe("drainFulfillmentOutbox", () => {
  it("claims and completes each valid job exactly once", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const sendDeliveryEmail = vi.fn().mockResolvedValue(undefined);

    await expect(
      drainFulfillmentOutbox({
        client: { rpc },
        sendDeliveryEmail,
      }),
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });

    expect(sendDeliveryEmail).toHaveBeenCalledWith(job);
    expect(rpc).toHaveBeenNthCalledWith(1, "commerce_claim_fulfillment_jobs", {
      p_lease_seconds: OUTBOX_WORKER_LEASE_SECONDS,
      p_limit: 10,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "commerce_complete_fulfillment_job", {
      p_job_id: job.id,
    });
  });

  it("records an exponential retry path when delivery fails", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValueOnce({ data: "pending", error: null });
    const sendDeliveryEmail = vi
      .fn()
      .mockRejectedValue(new Error("Resend unavailable"));

    await expect(
      drainFulfillmentOutbox({
        client: { rpc },
        sendDeliveryEmail,
      }),
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1 });

    expect(rpc).toHaveBeenNthCalledWith(2, "commerce_retry_fulfillment_job", {
      p_error: "Resend unavailable",
      p_job_id: job.id,
      p_max_attempts: OUTBOX_MAX_ATTEMPTS,
    });
  });

  it("rejects malformed claimed work before calling a provider", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "not-a-job" }], error: null });
    const sendDeliveryEmail = vi.fn();

    await expect(
      drainFulfillmentOutbox({ client: { rpc }, sendDeliveryEmail }),
    ).rejects.toThrow("The fulfillment queue returned an invalid job.");

    expect(sendDeliveryEmail).not.toHaveBeenCalled();
  });
});

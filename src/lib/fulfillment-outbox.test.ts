import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deliverInitialFulfillmentEmail,
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

const resendJob = {
  ...job,
  id: "4d79d20e-514f-476e-a91a-6e0ec581957f",
  job_type: "send_delivery_email_resend" as const,
  payload: {
    ...job.payload,
    delivery_request_id: "9a9877eb-8b0c-421d-8eb9-9c0a1ac4c436",
    message_type: "delivery_link_resend" as const,
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
      p_error: "fulfillment_worker_unknown",
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

  it("accepts a durable self service resend job", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [resendJob], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const sendDeliveryEmail = vi.fn().mockResolvedValue(undefined);

    await expect(
      drainFulfillmentOutbox({ client: { rpc }, sendDeliveryEmail }),
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });

    expect(sendDeliveryEmail).toHaveBeenCalledWith(resendJob);
  });

  it("claims and sends only the newly fulfilled grant's initial delivery", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const sendDeliveryEmail = vi.fn().mockResolvedValue(undefined);

    await expect(
      deliverInitialFulfillmentEmail({
        accessGrantId: job.payload.access_grant_id,
        client: { rpc },
        sendDeliveryEmail,
      }),
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "commerce_claim_initial_delivery_for_grant",
      {
        p_access_grant_id: job.payload.access_grant_id,
        p_lease_seconds: OUTBOX_WORKER_LEASE_SECONDS,
      },
    );
    expect(sendDeliveryEmail).toHaveBeenCalledWith(job);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAccessUrl: vi.fn(),
  createAccessToken: vi.fn(),
  sendResendEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/access-token", () => ({
  buildAccessUrl: mocks.buildAccessUrl,
  createAccessToken: mocks.createAccessToken,
}));
vi.mock("@/lib/resend/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resend/client")>();
  return { ...actual, sendResendEmail: mocks.sendResendEmail };
});

import {
  deliveryIdempotencyKey,
  renderDeliveryEmail,
  sendDeliveryEmailForJob,
} from "@/lib/resend/delivery-email";

const job = {
  attempts: 1,
  claimed_at: "2026-09-27T12:00:00.000Z",
  id: "48ceef37-4eb3-4113-b87b-31416f755a6a",
  job_type: "send_delivery_email" as const,
  order_id: "68150824-1c59-4fd7-a01f-940a1e967a8a",
  payload: {
    access_grant_id: "85033b69-9dcc-4dac-b5b2-56220d0d079a",
    message_type: "delivery_link" as const,
    order_public_id: "ord_test123",
  },
};

const prepared = {
  access_grant_expires_at: "2026-10-27T12:00:00.000Z",
  amount_in_subunits: 6900,
  currency: "USD",
  delivery_email: "buyer@example.com",
  delivery_status: "pending",
  order_public_id: "ord_test123",
  paystack_reference: "hk_payment_123",
  resend_email_id: null,
  resend_idempotency_key: deliveryIdempotencyKey(job.payload.access_grant_id, "delivery_link"),
  selected_items: [{ product_title: "Room Plan" }],
  should_send: true,
};

describe("delivery email worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_FROM_EMAIL = "Home Kit <guides@astralrefine.com>";
    mocks.createAccessToken.mockReturnValue("v1.token.signature");
    mocks.buildAccessUrl.mockReturnValue("https://astralrefine.com/downloads/v1.token.signature");
    mocks.sendResendEmail.mockResolvedValue({ emailId: "email_123" });
  });

  afterEach(() => {
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("prepares and sends an initial email with a durable idempotency key", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [prepared], error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await sendDeliveryEmailForJob(job, { rpc });

    expect(rpc).toHaveBeenNthCalledWith(1, "commerce_prepare_delivery_email", {
      p_access_grant_id: job.payload.access_grant_id,
      p_delivery_request_id: null,
      p_idempotency_key: prepared.resend_idempotency_key,
      p_message_type: "delivery_link",
      p_order_id: job.order_id,
    });
    expect(mocks.sendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: prepared.resend_idempotency_key,
      to: "buyer@example.com",
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "commerce_record_resend_send_result", {
      p_idempotency_key: prepared.resend_idempotency_key,
      p_order_id: job.order_id,
      p_provider_response: { id: "email_123" },
      p_resend_email_id: "email_123",
    });
  });

  it("does not send when the database already has a provider result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...prepared, resend_email_id: "email_123", should_send: false }],
      error: null,
    });

    await sendDeliveryEmailForJob(job, { rpc });

    expect(mocks.sendResendEmail).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct durable key for each self service resend request", () => {
    expect(deliveryIdempotencyKey(
      job.payload.access_grant_id,
      "delivery_link_resend",
      "9a9877eb-8b0c-421d-8eb9-9c0a1ac4c436",
    )).toBe("home-kit/delivery/delivery_link_resend/9a9877eb-8b0c-421d-8eb9-9c0a1ac4c436");
  });

  it("uses the database-recorded replacement key only after an expired provider window", async () => {
    const replacementKey = `${prepared.resend_idempotency_key}/retry/1`;
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ ...prepared, resend_idempotency_key: replacementKey }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await sendDeliveryEmailForJob(job, { rpc });

    expect(mocks.sendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: replacementKey,
    }));
    expect(rpc).toHaveBeenLastCalledWith("commerce_record_resend_send_result", expect.objectContaining({
      p_idempotency_key: replacementKey,
    }));
  });

  it("renders plain text and escaped HTML purchase information", () => {
    const email = renderDeliveryEmail({
      accessUrl: "https://astralrefine.com/downloads/token",
      amountInSubunits: 6900,
      currency: "USD",
      expiresAt: "2026-10-27T12:00:00.000Z",
      guideTitles: ["Room <Plan>"],
      orderPublicId: "ord_test123",
      paystackReference: "hk_payment_123",
    });

    expect(email.text).toContain("https://astralrefine.com/downloads/token");
    expect(email.html).toContain("Room &lt;Plan&gt;");
    expect(email.html).toContain("support@astralrefine.com");
  });
});

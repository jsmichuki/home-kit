import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);
vi.mock("@/lib/observability/safe-log", () => ({
  logOperationalEvent: mocks.logOperationalEvent,
}));

import { POST } from "@/app/api/webhooks/resend/route";

const signingKey = Buffer.from("resend-webhook-test-secret-key-123");
const secret = `whsec_${signingKey.toString("base64")}`;
const previousSecret = process.env.RESEND_WEBHOOK_SECRET;
const eventId = "msg_01H8YKBK7TQ2T3Z5R6M7N8P9Q0";

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: { email_id: "email_123" },
    type: "email.delivered",
    ...overrides,
  });
}

function request(rawBody = body(), secretToUse = secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secretToUse.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key)
    .update(`${eventId}.${timestamp}.${rawBody}`)
    .digest("base64");

  return new Request("https://home-kit.example/api/webhooks/resend", {
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "svix-id": eventId,
      "svix-signature": `v1,${signature}`,
      "svix-timestamp": timestamp,
    },
    method: "POST",
  });
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (previousSecret === undefined) {
      delete process.env.RESEND_WEBHOOK_SECRET;
    } else {
      process.env.RESEND_WEBHOOK_SECRET = previousSecret;
    }
  });

  it("rejects unsigned payloads before any database call", async () => {
    const response = await POST(new Request("https://home-kit.example/api/webhooks/resend", {
      body: body(),
      method: "POST",
    }));

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("records a verified delivery event by the Svix event ID", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "recorded" });
    expect(rpc).toHaveBeenCalledWith("commerce_record_resend_webhook_event", expect.objectContaining({
      p_event_type: "email.delivered",
      p_resend_email_id: "email_123",
      p_resend_event_id: eventId,
    }));
  });

  it("returns a retryable error when event persistence is unavailable", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }),
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
  });
});

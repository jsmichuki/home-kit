import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendResendEmail } from "@/lib/resend/client";

const originalKey = process.env.RESEND_API_KEY;

describe("Resend email client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalKey;
    }
  });

  it("sends the configured message with an Idempotency-Key", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendResendEmail({
      from: "Home Kit <guides@astralrefine.com>",
      html: "<p>Hello</p>",
      idempotencyKey: "home-kit/delivery/delivery_link/85033b69-9dcc-4dac-b5b2-56220d0d079a",
      subject: "Your guides",
      text: "Hello",
      to: "buyer@example.com",
    })).resolves.toEqual({ emailId: "email_123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "home-kit/delivery/delivery_link/85033b69-9dcc-4dac-b5b2-56220d0d079a",
        }),
        method: "POST",
      }),
    );
  });

  it("classifies provider errors without exposing provider response content", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "buyer@example.com rejected" }), { status: 422 }),
    ));

    await expect(sendResendEmail({
      from: "Home Kit <guides@astralrefine.com>",
      html: "<p>Hello</p>",
      idempotencyKey: "delivery_1",
      subject: "Your guides",
      text: "Hello",
      to: "buyer@example.com",
    })).rejects.toMatchObject({
      retryable: false,
      safeCode: "resend_provider_rejected",
    });
  });
});

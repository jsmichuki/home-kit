import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logOperationalEvent: vi.fn(),
  requestAccessResend: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ requestAccessResend: mocks.requestAccessResend }));
vi.mock("@/lib/observability/safe-log", () => ({ logOperationalEvent: mocks.logOperationalEvent }));

import { POST } from "@/app/api/access/resend/route";

function request(body: unknown) {
  return new NextRequest("https://example.test/api/access/resend", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    method: "POST",
  });
}

describe("POST /api/access/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the same neutral message after an eligible request", async () => {
    const response = await POST(request({ email: "buyer@example.com" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      message: "If an eligible purchase uses that email address, we will send an access link shortly.",
    });
    expect(mocks.requestAccessResend).toHaveBeenCalledWith("buyer@example.com", "203.0.113.9");
  });

  it("returns the exact same response for malformed input without querying orders", async () => {
    const response = await POST(request({ email: ["buyer@example.com"] }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      message: "If an eligible purchase uses that email address, we will send an access link shortly.",
    });
    expect(mocks.requestAccessResend).not.toHaveBeenCalled();
  });

  it("keeps the response neutral when the database request fails or is rate limited", async () => {
    mocks.requestAccessResend.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request({ email: "buyer@example.com" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      message: "If an eligible purchase uses that email address, we will send an access link shortly.",
    });
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith("error", "access_resend_request_failed", {
      failure: "database",
    });
  });
});

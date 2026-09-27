import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGuideDownload: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ createGuideDownload: mocks.createGuideDownload }));
vi.mock("@/lib/observability/safe-log", () => ({ logOperationalEvent: mocks.logOperationalEvent }));

import { POST } from "@/app/api/access/download/route";

const token = "v1.abcdefghi_jklmnopqrstu.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO";
const guideId = "8f12b5d0-1f1e-4fd0-9d9b-111111111111";
const assetId = "b0f5bb45-0790-4b0c-a9ca-bbd32f52b7bb";

function request(body: unknown) {
  return new NextRequest("https://example.test/api/access/download", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "user-agent": "Example Browser",
      "x-forwarded-for": "203.0.113.7",
    },
    method: "POST",
  });
}

describe("POST /api/access/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a short lived URL only after the access service validates the entitlement", async () => {
    mocks.createGuideDownload.mockResolvedValue({ signedUrl: "https://storage.example/signed" });

    const response = await POST(request({ assetId, guideId, token }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://storage.example/signed" });
    expect(mocks.createGuideDownload).toHaveBeenCalledWith(token, guideId, assetId, {
      clientAddress: "203.0.113.7",
      userAgent: "Example Browser",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses one generic response for a guessed token or a guide outside the entitlement", async () => {
    mocks.createGuideDownload.mockResolvedValue(null);

    const response = await POST(request({ assetId, guideId, token }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This download is unavailable. Return to your access page or contact support.",
    });
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith("warn", "download_access_denied", {
      reason: "invalid_grant_or_entitlement",
    });
  });

  it("does not call the access service for an unexpected request shape", async () => {
    const response = await POST(request({ assetId, guideId, token, url: "https://attacker.example" }));

    expect(response.status).toBe(404);
    expect(mocks.createGuideDownload).not.toHaveBeenCalled();
  });
});

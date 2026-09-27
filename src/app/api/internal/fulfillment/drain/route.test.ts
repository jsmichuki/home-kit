import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drainFulfillmentOutbox: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fulfillment-outbox", () => mocks);

import { POST } from "@/app/api/internal/fulfillment/drain/route";

const previousSecret = process.env.FULFILLMENT_WORKER_SECRET;
const secret = "a".repeat(32);

describe("POST /api/internal/fulfillment/drain", () => {
  beforeEach(() => {
    process.env.FULFILLMENT_WORKER_SECRET = secret;
    mocks.drainFulfillmentOutbox.mockResolvedValue({ claimed: 1, completed: 1, failed: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (previousSecret === undefined) {
      delete process.env.FULFILLMENT_WORKER_SECRET;
    } else {
      process.env.FULFILLMENT_WORKER_SECRET = previousSecret;
    }
  });

  it("rejects callers without the worker secret", async () => {
    const response = await POST(new Request("https://home-kit.example/api/internal/fulfillment/drain", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.drainFulfillmentOutbox).not.toHaveBeenCalled();
  });

  it("drains a bounded batch for an authorized caller", async () => {
    const response = await POST(new Request("https://home-kit.example/api/internal/fulfillment/drain", {
      headers: { authorization: `Bearer ${secret}` },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(mocks.drainFulfillmentOutbox).toHaveBeenCalledWith({ limit: 10 });
  });
});

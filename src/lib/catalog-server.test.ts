import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);
vi.mock("@/lib/observability/safe-log", () => mocks);

import { getActiveGuideCatalogue } from "@/lib/catalog-server";

const guide = {
  current_version: 1,
  id: "guide-1",
  is_active: true,
  long_description: "A complete description for the first guide.",
  short_description: "A concise guide description.",
  slug: "first-guide",
  title: "First guide",
};

const previousUrl = process.env.SUPABASE_URL;
const previousSecret = process.env.SUPABASE_SECRET_KEY;

function resolveRetryDelaysImmediately() {
  return vi.spyOn(global, "setTimeout").mockImplementation(((callback: Parameters<typeof setTimeout>[0]) => {
    if (typeof callback === "function") {
      callback();
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

describe("getActiveGuideCatalogue", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-secret";
  });

  afterEach(() => {
    if (previousUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousUrl;
    }

    if (previousSecret === undefined) {
      delete process.env.SUPABASE_SECRET_KEY;
    } else {
      process.env.SUPABASE_SECRET_KEY = previousSecret;
    }

    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses only prices active at the request time and keeps the latest effective price", async () => {
    const guideOrder = vi.fn().mockResolvedValue({ data: [guide], error: null });
    const guideFilter = vi.fn().mockReturnValue({ order: guideOrder });
    const guideSelect = vi.fn().mockReturnValue({ eq: guideFilter });
    const assetsSelect = vi.fn().mockResolvedValue({
      data: [{ display_name: "First guide.pdf", guide_id: guide.id, version: 1 }],
      error: null,
    });
    const priceOr = vi.fn().mockResolvedValue({
      data: [
        { active_from: "2026-10-01T00:00:00.000Z", amount_in_subunits: 1800, guide_id: guide.id },
        { active_from: "2026-09-01T00:00:00.000Z", amount_in_subunits: 1600, guide_id: guide.id },
      ],
      error: null,
    });
    const priceLte = vi.fn().mockReturnValue({ or: priceOr });
    const priceCurrency = vi.fn().mockReturnValue({ lte: priceLte });
    const pricesSelect = vi.fn().mockReturnValue({ eq: priceCurrency });
    const from = vi.fn((table: string) => {
      if (table === "commerce_guides") {
        return { select: guideSelect };
      }

      if (table === "commerce_guide_assets") {
        return { select: assetsSelect };
      }

      return { select: pricesSelect };
    });

    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(getActiveGuideCatalogue()).resolves.toEqual([
      {
        currentVersion: 1,
        description: guide.short_description,
        id: guide.id,
        includedFiles: ["First guide.pdf"],
        isActive: true,
        longDescription: guide.long_description,
        priceInCents: 1800,
        slug: guide.slug,
        title: guide.title,
      },
    ]);

    expect(priceLte).toHaveBeenCalledWith("active_from", expect.any(String));
    expect(priceOr).toHaveBeenCalledWith(
      expect.stringMatching(/^active_until\.is\.null,active_until\.gt\./),
    );
  });

  it("rejects incomplete server configuration instead of silently using static data", async () => {
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(getActiveGuideCatalogue()).rejects.toThrow(
      "Supabase server configuration is incomplete.",
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("logs and retries a transient catalogue query failure once", async () => {
    resolveRetryDelaysImmediately();

    const guideOrder = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST000",
          hint: "Try again shortly.",
          message: "The database is temporarily unavailable.",
        },
        status: 503,
      })
      .mockResolvedValueOnce({ data: [guide], error: null, status: 200 });
    const guideFilter = vi.fn().mockReturnValue({ order: guideOrder });
    const guideSelect = vi.fn().mockReturnValue({ eq: guideFilter });
    const assetsSelect = vi.fn().mockResolvedValue({
      data: [{ display_name: "First guide.pdf", guide_id: guide.id, version: 1 }],
      error: null,
      status: 200,
    });
    const priceOr = vi.fn().mockResolvedValue({
      data: [{ active_from: "2026-09-01T00:00:00.000Z", amount_in_subunits: 1600, guide_id: guide.id }],
      error: null,
      status: 200,
    });
    const priceLte = vi.fn().mockReturnValue({ or: priceOr });
    const priceCurrency = vi.fn().mockReturnValue({ lte: priceLte });
    const pricesSelect = vi.fn().mockReturnValue({ eq: priceCurrency });
    const from = vi.fn((table: string) => {
      if (table === "commerce_guides") {
        return { select: guideSelect };
      }

      if (table === "commerce_guide_assets") {
        return { select: assetsSelect };
      }

      return { select: pricesSelect };
    });

    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(getActiveGuideCatalogue()).resolves.toHaveLength(1);

    expect(guideOrder).toHaveBeenCalledTimes(2);
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
      "error",
      "catalogue.load_failed",
      expect.objectContaining({
        failures: [expect.objectContaining({ query: "guides", status: 503 })],
        operation: "guides",
      }),
    );
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
      "warn",
      "catalogue.load_retrying",
      expect.objectContaining({ operation: "guides" }),
    );
  });

  it("retries Supabase's exact future-issued JWT failure with exponential backoff", async () => {
    const retryDelay = resolveRetryDelaysImmediately();
    const futureJwtError = {
      code: "PGRST303",
      hint: null,
      message: "JWT issued at future",
    };
    const guideOrder = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: futureJwtError, status: 401 })
      .mockResolvedValueOnce({ data: null, error: futureJwtError, status: 401 })
      .mockResolvedValueOnce({ data: null, error: futureJwtError, status: 401 })
      .mockResolvedValueOnce({ data: null, error: futureJwtError, status: 401 })
      .mockResolvedValueOnce({ data: [guide], error: null, status: 200 });
    const guideFilter = vi.fn().mockReturnValue({ order: guideOrder });
    const guideSelect = vi.fn().mockReturnValue({ eq: guideFilter });
    const assetsSelect = vi.fn().mockResolvedValue({
      data: [{ display_name: "First guide.pdf", guide_id: guide.id, version: 1 }],
      error: null,
      status: 200,
    });
    const priceOr = vi.fn().mockResolvedValue({
      data: [{ active_from: "2026-09-01T00:00:00.000Z", amount_in_subunits: 1600, guide_id: guide.id }],
      error: null,
      status: 200,
    });
    const priceLte = vi.fn().mockReturnValue({ or: priceOr });
    const priceCurrency = vi.fn().mockReturnValue({ lte: priceLte });
    const pricesSelect = vi.fn().mockReturnValue({ eq: priceCurrency });
    const from = vi.fn((table: string) => {
      if (table === "commerce_guides") {
        return { select: guideSelect };
      }

      if (table === "commerce_guide_assets") {
        return { select: assetsSelect };
      }

      return { select: pricesSelect };
    });

    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(getActiveGuideCatalogue()).resolves.toHaveLength(1);

    expect(guideOrder).toHaveBeenCalledTimes(5);
    expect(retryDelay).toHaveBeenNthCalledWith(1, expect.any(Function), 1_000);
    expect(retryDelay).toHaveBeenNthCalledWith(2, expect.any(Function), 2_000);
    expect(retryDelay).toHaveBeenNthCalledWith(3, expect.any(Function), 4_000);
    expect(retryDelay).toHaveBeenNthCalledWith(4, expect.any(Function), 8_000);
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
      "warn",
      "catalogue.load_retrying",
      expect.objectContaining({
        attempt: 4,
        delayMs: 8_000,
        failures: [expect.objectContaining({
          code: "PGRST303",
          message: "JWT issued at future",
          status: 401,
        })],
        operation: "guides",
      }),
    );
  });
});

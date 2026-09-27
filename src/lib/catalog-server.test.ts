import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);

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
});

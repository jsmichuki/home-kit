import "server-only";

import { GUIDES, type Guide } from "@/lib/catalog";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DatabaseGuide = {
  current_version: number;
  id: string;
  is_active: boolean;
  long_description: string;
  short_description: string;
  slug: string;
  title: string;
};

type DatabaseGuideAsset = {
  display_name: string;
  guide_id: string;
  version: number;
};

type DatabaseGuidePrice = {
  active_from: string;
  amount_in_subunits: number;
  guide_id: string;
};

function hasSupabaseServerCredentials() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function assertSupabaseConfigurationIsComplete() {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasSecret = Boolean(process.env.SUPABASE_SECRET_KEY);

  if (hasUrl !== hasSecret) {
    throw new Error(
      "Supabase server configuration is incomplete. Set both SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
}

/**
 * The database is the catalogue source in deployed environments. The static
 * seed remains available only for local builds before server credentials are
 * configured.
 */
export async function getActiveGuideCatalogue(): Promise<readonly Guide[]> {
  assertSupabaseConfigurationIsComplete();

  if (!hasSupabaseServerCredentials()) {
    return GUIDES.filter((guide) => guide.isActive);
  }

  const supabase = createSupabaseAdminClient();
  const requestedAt = new Date().toISOString();
  const [guidesResult, assetsResult, pricesResult] = await Promise.all([
    supabase
      .from("commerce_guides")
      .select(
        "id, slug, title, short_description, long_description, is_active, current_version",
      )
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("commerce_guide_assets")
      .select("guide_id, version, display_name"),
    supabase
      .from("commerce_catalogue_prices")
      .select("guide_id, amount_in_subunits, active_from")
      .eq("currency", "USD")
      .lte("active_from", requestedAt)
      .or(`active_until.is.null,active_until.gt.${requestedAt}`),
  ]);

  if (guidesResult.error || assetsResult.error || pricesResult.error) {
    throw new Error("We could not load the active guide catalogue.");
  }

  const assetsByGuide = new Map<string, DatabaseGuideAsset[]>();

  for (const asset of (assetsResult.data ?? []) as DatabaseGuideAsset[]) {
    const existingAssets = assetsByGuide.get(asset.guide_id) ?? [];
    assetsByGuide.set(asset.guide_id, [...existingAssets, asset]);
  }

  const pricesByGuide = new Map<string, number>();

  for (const price of (pricesResult.data ?? [])
    .filter((price): price is DatabaseGuidePrice => Boolean(price.guide_id))
    .sort((left, right) => right.active_from.localeCompare(left.active_from))) {
    if (!pricesByGuide.has(price.guide_id)) {
      pricesByGuide.set(price.guide_id, price.amount_in_subunits);
    }
  }

  return ((guidesResult.data ?? []) as DatabaseGuide[]).map((guide) => {
    const priceInCents = pricesByGuide.get(guide.id);

    if (priceInCents === undefined) {
      throw new Error(`The active guide ${guide.slug} does not have a price.`);
    }

    const includedFiles = (assetsByGuide.get(guide.id) ?? [])
      .filter((asset) => asset.version === guide.current_version)
      .map((asset) => asset.display_name);

    return {
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      description: guide.short_description,
      longDescription: guide.long_description,
      isActive: guide.is_active,
      currentVersion: guide.current_version,
      priceInCents,
      includedFiles,
    };
  });
}

export { hasSupabaseServerCredentials };

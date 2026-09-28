import "server-only";

import { COMPLETE_SET, GUIDES, type Bundle, type Guide } from "@/lib/catalog";
import { logOperationalEvent } from "@/lib/observability/safe-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CATALOGUE_RETRY_DELAY_MS = 750;
const RETRYABLE_CATALOGUE_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504, 520]);

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

type DatabaseBundle = {
  id: string;
  is_active: boolean;
  short_description: string;
  slug: string;
  title: string;
};

type DatabaseBundleGuide = {
  bundle_id: string;
  guide_id: string;
};

type DatabaseBundlePrice = {
  active_from: string;
  amount_in_subunits: number;
  bundle_id: string;
};

type QueryResult = {
  error: {
    code?: string | null;
    hint?: string | null;
    message?: string | null;
  } | null;
  status?: number | null;
};

type CatalogueLoadOperation = "complete_set" | "guides";

type CatalogueQueryFailure = {
  code: string | null;
  hint: string | null;
  message: string | null;
  query: string;
  status: number | null;
};

class CatalogueLoadError extends Error {
  constructor(
    message: string,
    readonly operation: CatalogueLoadOperation,
    readonly failures: readonly CatalogueQueryFailure[],
  ) {
    super(message);
    this.name = "CatalogueLoadError";
  }

  get isTransient() {
    return this.failures.every((failure) =>
      failure.status !== null && RETRYABLE_CATALOGUE_STATUSES.has(failure.status),
    );
  }
}

function getQueryFailures(
  results: Readonly<Record<string, QueryResult>>,
): CatalogueQueryFailure[] {
  return Object.entries(results).flatMap(([query, result]) =>
    result.error
      ? [{
        code: result.error.code ?? null,
        hint: result.error.hint ?? null,
        message: result.error.message ?? null,
        query,
        status: result.status ?? null,
      }]
      : [],
  );
}

function throwCatalogueLoadError(
  operation: CatalogueLoadOperation,
  message: string,
  results: Readonly<Record<string, QueryResult>>,
): never {
  const failures = getQueryFailures(results);

  logOperationalEvent("error", "catalogue.load_failed", { failures, operation });
  throw new CatalogueLoadError(message, operation, failures);
}

function waitForCatalogueRetry() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, CATALOGUE_RETRY_DELAY_MS);
  });
}

async function retryTransientCatalogueLoad<T>(
  operation: CatalogueLoadOperation,
  load: () => Promise<T>,
) {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof CatalogueLoadError) || !error.isTransient) {
      throw error;
    }

    logOperationalEvent("warn", "catalogue.load_retrying", {
      delayMs: CATALOGUE_RETRY_DELAY_MS,
      failures: error.failures,
      operation,
    });
    await waitForCatalogueRetry();
    return load();
  }
}

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
  return retryTransientCatalogueLoad("guides", loadActiveGuideCatalogue);
}

async function loadActiveGuideCatalogue(): Promise<readonly Guide[]> {
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
    throwCatalogueLoadError(
      "guides",
      "We could not load the active guide catalogue.",
      { assets: assetsResult, guides: guidesResult, prices: pricesResult },
    );
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

/**
 * The bundle is also read from the server catalogue so its displayed total
 * cannot drift from the amount used by checkout after an editorial price
 * change. The static value is only for unconfigured local builds.
 */
export async function getActiveCompleteSet(): Promise<Bundle> {
  return retryTransientCatalogueLoad("complete_set", loadActiveCompleteSet);
}

async function loadActiveCompleteSet(): Promise<Bundle> {
  assertSupabaseConfigurationIsComplete();

  if (!hasSupabaseServerCredentials()) {
    return COMPLETE_SET;
  }

  const supabase = createSupabaseAdminClient();
  const requestedAt = new Date().toISOString();
  const [bundleResult, bundleGuidesResult, pricesResult] = await Promise.all([
    supabase
      .from("commerce_bundles")
      .select("id, slug, title, short_description, is_active")
      .eq("id", COMPLETE_SET.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("commerce_bundle_guides")
      .select("bundle_id, guide_id")
      .eq("bundle_id", COMPLETE_SET.id),
    supabase
      .from("commerce_catalogue_prices")
      .select("bundle_id, amount_in_subunits, active_from")
      .eq("bundle_id", COMPLETE_SET.id)
      .eq("currency", "USD")
      .lte("active_from", requestedAt)
      .or(`active_until.is.null,active_until.gt.${requestedAt}`),
  ]);

  if (bundleResult.error || bundleGuidesResult.error || pricesResult.error) {
    throwCatalogueLoadError(
      "complete_set",
      "We could not load the complete set.",
      { bundle: bundleResult, bundleGuides: bundleGuidesResult, prices: pricesResult },
    );
  }

  if (!bundleResult.data) {
    throw new Error("We could not load the complete set.");
  }

  const price = ((pricesResult.data ?? []) as DatabaseBundlePrice[])
    .sort((left, right) => right.active_from.localeCompare(left.active_from))
    .find((item) => item.bundle_id === COMPLETE_SET.id);

  if (!price) {
    throw new Error("The complete set does not have a price.");
  }

  const bundle = bundleResult.data as DatabaseBundle;
  return {
    description: bundle.short_description,
    id: bundle.id,
    includedGuideIds: ((bundleGuidesResult.data ?? []) as DatabaseBundleGuide[])
      .filter((item) => item.bundle_id === bundle.id)
      .map((item) => item.guide_id),
    priceInCents: price.amount_in_subunits,
    slug: bundle.slug,
    title: bundle.title,
  };
}

export { hasSupabaseServerCredentials };

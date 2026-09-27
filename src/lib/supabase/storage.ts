import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PAID_GUIDES_BUCKET = "paid-guides";
export const SIGNED_DOWNLOAD_URL_TTL_SECONDS = 60;

export type ValidatedEntitledAsset = {
  accessGrantId: string;
  displayName: string;
  storageObjectKey: string;
};

function getSafeDownloadName(displayName: string) {
  const normalized = displayName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || "home-kit-download";
}

/**
 * Issue a URL only after the caller has validated a fulfilled order, active
 * access grant, and matching entitlement. This module is server-only so it
 * cannot be imported into browser code.
 */
export async function createEntitledGuideDownloadUrl(
  asset: ValidatedEntitledAsset,
) {
  if (!asset.accessGrantId) {
    throw new Error("A validated access grant is required to issue a download URL.");
  }

  if (!asset.storageObjectKey.startsWith("guides/")) {
    throw new Error("The requested file is outside the paid guides storage path.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(PAID_GUIDES_BUCKET)
    .createSignedUrl(asset.storageObjectKey, SIGNED_DOWNLOAD_URL_TTL_SECONDS, {
      download: getSafeDownloadName(asset.displayName),
    });

  if (error || !data?.signedUrl) {
    throw new Error("We could not prepare this download.");
  }

  return data.signedUrl;
}

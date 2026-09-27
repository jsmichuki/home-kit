import "server-only";

import { createHash, createHmac } from "node:crypto";

import { verifyAccessToken } from "@/lib/access-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEntitledGuideDownloadUrl } from "@/lib/supabase/storage";

const ACTIVE_ACCESS_GRANT_RPC = "commerce_lookup_active_access_grant";
const RECORD_DOWNLOAD_EVENT_RPC = "commerce_record_download_event";
const REQUEST_ACCESS_RESEND_RPC = "commerce_request_access_resend";

export const ACCESS_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

type EntitlementSnapshot = {
  guide_id: string;
  guide_slug: string;
  guide_title: string;
  version: number;
};

type ActiveGrantRow = {
  access_grant_id: string;
  entitlement_snapshot: EntitlementSnapshot[];
  expires_at: string;
  order_id: string;
  order_public_id: string;
};

type GuideRow = {
  id: string;
  short_description: string;
};

type AssetRow = {
  display_name: string;
  file_size_bytes: number | null;
  guide_id: string;
  id: string;
  media_type: string;
  storage_object_key: string;
  version: number;
};

export type EntitledGuideAsset = {
  assetId: string;
  displayName: string;
  fileSizeBytes: number | null;
  mediaType: string;
  storageObjectKey: string;
};

export type EntitledGuide = {
  assets: EntitledGuideAsset[];
  guideId: string;
  shortDescription: string;
  title: string;
  version: number;
};

export type ActiveAccessGrant = {
  accessGrantId: string;
  expiresAt: string;
  guides: EntitledGuide[];
  orderId: string;
  orderPublicId: string;
};

function isEntitlementSnapshot(value: unknown): value is EntitlementSnapshot[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => (
      typeof item === "object"
      && item !== null
      && typeof (item as EntitlementSnapshot).guide_id === "string"
      && typeof (item as EntitlementSnapshot).guide_slug === "string"
      && typeof (item as EntitlementSnapshot).guide_title === "string"
      && Number.isInteger((item as EntitlementSnapshot).version)
      && (item as EntitlementSnapshot).version > 0
    ));
}

function isActiveGrantRow(value: unknown): value is ActiveGrantRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.access_grant_id === "string"
    && typeof row.expires_at === "string"
    && typeof row.order_id === "string"
    && typeof row.order_public_id === "string"
    && isEntitlementSnapshot(row.entitlement_snapshot)
  );
}

function isSafeGuideId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

function getAccessTokenAuditSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ACCESS_TOKEN_SECRET is required for access auditing.");
  }

  return secret;
}

export function isValidAccessToken(value: string) {
  return ACCESS_TOKEN_PATTERN.test(value) && verifyAccessToken(value) !== null;
}

export function hashAccessToken(value: string) {
  // The grant itself stores only this one way hash. No plaintext token is
  // written to the database, logs, download events, or provider payloads.
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export function hashAccessAuditValue(value: string) {
  return createHmac("sha256", getAccessTokenAuditSecret())
    .update(`audit:${value}`)
    .digest("hex");
}

/**
 * Validates an opaque token via a database-owned active-grant lookup, then
 * resolves precisely the guide versions captured in the immutable entitlement
 * snapshot. It intentionally returns null for every invalid or incomplete
 * state so callers have no account or file discovery oracle.
 */
export async function lookupActiveAccessGrant(
  token: string,
): Promise<ActiveAccessGrant | null> {
  if (!isValidAccessToken(token)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: grantData, error: grantError } = await supabase.rpc(
    ACTIVE_ACCESS_GRANT_RPC,
    { p_token_hash: hashAccessToken(token) },
  );

  if (
    grantError
    || !Array.isArray(grantData)
    || grantData.length !== 1
    || !isActiveGrantRow(grantData[0])
  ) {
    return null;
  }

  const grant = grantData[0];
  const entitlementByGuideId = new Map(
    grant.entitlement_snapshot.map((item) => [item.guide_id, item]),
  );
  const guideIds = [...entitlementByGuideId.keys()];

  if (guideIds.length !== grant.entitlement_snapshot.length || !guideIds.every(isSafeGuideId)) {
    return null;
  }

  const [guidesResult, assetsResult] = await Promise.all([
    supabase
      .from("commerce_guides")
      .select("id, short_description")
      .in("id", guideIds),
    supabase
      .from("commerce_guide_assets")
      .select("id, guide_id, version, storage_object_key, display_name, media_type, file_size_bytes")
      .in("guide_id", guideIds),
  ]);

  if (guidesResult.error || assetsResult.error) {
    return null;
  }

  const guidesById = new Map(
    ((guidesResult.data ?? []) as GuideRow[]).map((guide) => [guide.id, guide]),
  );
  const assetsByEntitlement = new Map<string, AssetRow[]>();

  for (const asset of (assetsResult.data ?? []) as AssetRow[]) {
    const entitlement = entitlementByGuideId.get(asset.guide_id);
    if (!entitlement || asset.version !== entitlement.version) {
      continue;
    }

    const currentAssets = assetsByEntitlement.get(asset.guide_id) ?? [];
    currentAssets.push(asset);
    assetsByEntitlement.set(asset.guide_id, currentAssets);
  }

  const guides = grant.entitlement_snapshot.map((entitlement) => {
    const guide = guidesById.get(entitlement.guide_id);
    const assets = assetsByEntitlement.get(entitlement.guide_id) ?? [];

    if (!guide || assets.length === 0 || assets.some((asset) => !asset.storage_object_key.startsWith("guides/"))) {
      return null;
    }

    return {
      assets: assets
        .sort((left, right) => left.display_name.localeCompare(right.display_name))
        .map((asset) => ({
          assetId: asset.id,
          displayName: asset.display_name,
          fileSizeBytes: asset.file_size_bytes,
          mediaType: asset.media_type,
          storageObjectKey: asset.storage_object_key,
        })),
      guideId: entitlement.guide_id,
      shortDescription: guide.short_description,
      title: entitlement.guide_title,
      version: entitlement.version,
    } satisfies EntitledGuide;
  });

  if (guides.some((guide) => guide === null)) {
    return null;
  }

  return {
    accessGrantId: grant.access_grant_id,
    expiresAt: grant.expires_at,
    guides: guides as EntitledGuide[],
    orderId: grant.order_id,
    orderPublicId: grant.order_public_id,
  };
}

export async function createGuideDownload(
  token: string,
  guideId: string,
  assetId: string,
  audit: { clientAddress: string; userAgent: string | null },
) {
  if (!isSafeGuideId(guideId) || !isSafeGuideId(assetId)) {
    return null;
  }

  const grant = await lookupActiveAccessGrant(token);
  const guide = grant?.guides.find((item) => item.guideId === guideId);
  const asset = guide?.assets.find((item) => item.assetId === assetId);

  if (!grant || !guide || !asset) {
    return null;
  }

  const signedUrl = await createEntitledGuideDownloadUrl({
    accessGrantId: grant.accessGrantId,
    displayName: asset.displayName,
    storageObjectKey: asset.storageObjectKey,
  });

  const { data, error } = await createSupabaseAdminClient().rpc(
    RECORD_DOWNLOAD_EVENT_RPC,
    {
      p_access_grant_id: grant.accessGrantId,
      p_event_type: "signed_url_issued",
      p_guide_asset_id: asset.assetId,
      p_guide_id: guide.guideId,
      p_ip_hash: hashAccessAuditValue(audit.clientAddress),
      // Keep download audit data minimal. User agent strings can be highly
      // identifying, so the database receives no raw browser fingerprint.
      p_user_agent: null,
    },
  );

  if (error || data !== true) {
    throw new Error("The download event could not be recorded.");
  }

  return { signedUrl };
}

export async function requestAccessResend(
  email: string,
  clientAddress: string,
) {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length < 3
    || normalizedEmail.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return;
  }

  // The RPC has the authoritative shared rate limit and only queues work for
  // fulfilled orders with active grants. Its return value is deliberately not
  // surfaced to the browser.
  await createSupabaseAdminClient().rpc(REQUEST_ACCESS_RESEND_RPC, {
    p_email_hash: hashAccessAuditValue(normalizedEmail),
    p_ip_hash: hashAccessAuditValue(clientAddress),
    p_normalized_email: normalizedEmail,
  });
}

import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEntitledGuideDownloadUrl: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => mocks);
vi.mock("@/lib/supabase/storage", () => ({
  createEntitledGuideDownloadUrl: mocks.createEntitledGuideDownloadUrl,
}));

import {
  createGuideDownload,
  hashAccessToken,
  lookupActiveAccessGrant,
  requestAccessResend,
} from "@/lib/access";
import { createAccessToken } from "@/lib/access-token";

const grantId = "1b9264f3-a55d-4e3a-a80a-810c3787d1f9";
const guideId = "8f12b5d0-1f1e-4fd0-9d9b-111111111111";
const assetId = "b0f5bb45-0790-4b0c-a9ca-bbd32f52b7bb";
const tokenSecret = "access-token-test-secret-that-is-long-enough";

const grantRow = {
  access_grant_id: grantId,
  entitlement_snapshot: [{
    guide_id: guideId,
    guide_slug: "home-maintenance",
    guide_title: "Home Maintenance Guide",
    version: 2,
  }],
  expires_at: "2026-10-27T12:00:00.000Z",
  order_id: "d0cbb4bd-7e8e-482a-a1ba-e9e54abd1a88",
  order_public_id: "ord_Example123",
};

function query(data: unknown, error: unknown = null) {
  const inFilter = vi.fn().mockResolvedValue({ data, error });
  return { select: vi.fn().mockReturnValue({ in: inFilter }) };
}

function mockDatabase({ assetData = [{
  display_name: "home-maintenance-guide.pdf",
  file_size_bytes: 123456,
  guide_id: guideId,
  id: assetId,
  media_type: "application/pdf",
  storage_object_key: "guides/home-maintenance/home-maintenance-guide.pdf",
  version: 2,
}], grantData = [grantRow] }: {
  assetData?: unknown;
  grantData?: unknown;
} = {}) {
  const rpc = vi.fn((name: string) => {
    if (name === "commerce_lookup_active_access_grant") {
      return Promise.resolve({ data: grantData, error: null });
    }

    return Promise.resolve({ data: true, error: null });
  });
  const from = vi.fn((table: string) => {
    if (table === "commerce_guides") {
      return query([{ id: guideId, short_description: "A concise guide description." }]);
    }

    if (table === "commerce_guide_assets") {
      return query(assetData);
    }

    throw new Error(`Unexpected table ${table}`);
  });

  mocks.createSupabaseAdminClient.mockReturnValue({ from, rpc });
  return { from, rpc };
}

describe("access grant lookup", () => {
  const previousSecret = process.env.ACCESS_TOKEN_SECRET;

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = tokenSecret;
    vi.clearAllMocks();
    mocks.createEntitledGuideDownloadUrl.mockResolvedValue("https://storage.example/signed");
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.ACCESS_TOKEN_SECRET;
    } else {
      process.env.ACCESS_TOKEN_SECRET = previousSecret;
    }
  });

  it("hashes the opaque token and resolves only the entitled guide version", async () => {
    const database = mockDatabase();
    const token = createAccessToken(grantId);

    await expect(lookupActiveAccessGrant(token)).resolves.toMatchObject({
      accessGrantId: grantId,
      guides: [{ guideId, title: "Home Maintenance Guide", version: 2 }],
    });
    expect(database.rpc).toHaveBeenCalledWith("commerce_lookup_active_access_grant", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(hashAccessToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("does not query the database for a guessed or malformed token", async () => {
    const database = mockDatabase();

    await expect(lookupActiveAccessGrant("v1.invalid.signature")).resolves.toBeNull();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when a purchased guide version has no matching asset", async () => {
    mockDatabase({ assetData: [] });

    await expect(lookupActiveAccessGrant(createAccessToken(grantId))).resolves.toBeNull();
  });

  it("keeps every purchased file version within its entitled guide", async () => {
    mockDatabase({
      assetData: [
        {
          display_name: "home-maintenance-guide.pdf",
          file_size_bytes: 123456,
          guide_id: guideId,
          id: assetId,
          media_type: "application/pdf",
          storage_object_key: "guides/home-maintenance/home-maintenance-guide.pdf",
          version: 2,
        },
        {
          display_name: "home-maintenance-tracker.xlsx",
          file_size_bytes: 4567,
          guide_id: guideId,
          id: "c1f5bb45-0790-4b0c-a9ca-bbd32f52b7bb",
          media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storage_object_key: "guides/home-maintenance/home-maintenance-tracker.xlsx",
          version: 2,
        },
      ],
    });

    await expect(lookupActiveAccessGrant(createAccessToken(grantId))).resolves.toMatchObject({
      guides: [{
        assets: [{ assetId }, { assetId: "c1f5bb45-0790-4b0c-a9ca-bbd32f52b7bb" }],
        guideId,
      }],
    });
  });

  it("issues one signed URL only after a validated entitlement and records a minimal event", async () => {
    const database = mockDatabase();
    const token = createAccessToken(grantId);

    await expect(createGuideDownload(token, guideId, assetId, {
      clientAddress: "203.0.113.15",
      userAgent: "Example Browser",
    })).resolves.toEqual({ signedUrl: "https://storage.example/signed" });
    expect(mocks.createEntitledGuideDownloadUrl).toHaveBeenCalledWith({
      accessGrantId: grantId,
      displayName: "home-maintenance-guide.pdf",
      storageObjectKey: "guides/home-maintenance/home-maintenance-guide.pdf",
    });
    expect(database.rpc).toHaveBeenLastCalledWith("commerce_record_download_event", expect.objectContaining({
      p_access_grant_id: grantId,
      p_event_type: "signed_url_issued",
      p_guide_id: guideId,
      p_ip_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_user_agent: null,
    }));
  });

  it("does not prepare a signed URL for a missing entitlement", async () => {
    mockDatabase();

    await expect(createGuideDownload(createAccessToken(grantId), "8f12b5d0-1f1e-4fd0-9d9b-222222222222", assetId, {
      clientAddress: "203.0.113.15",
      userAgent: null,
    })).resolves.toBeNull();
    expect(mocks.createEntitledGuideDownloadUrl).not.toHaveBeenCalled();
  });

  it("submits only normalized email and hashed audit values to the neutral resend RPC", async () => {
    const database = mockDatabase();

    await requestAccessResend(" Buyer@Example.com ", "203.0.113.15");

    expect(database.rpc).toHaveBeenLastCalledWith("commerce_request_access_resend", {
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_ip_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_normalized_email: "buyer@example.com",
    });
  });
});

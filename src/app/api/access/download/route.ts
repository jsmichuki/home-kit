import { NextRequest, NextResponse } from "next/server";

import { createGuideDownload } from "@/lib/access";
import { logOperationalEvent } from "@/lib/observability/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type DownloadRequest = {
  assetId: string;
  guideId: string;
  token: string;
};

function parseDownloadRequest(value: unknown): DownloadRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => key !== "assetId" && key !== "guideId" && key !== "token")) {
    return null;
  }

  if (
    typeof payload.assetId !== "string"
    || typeof payload.guideId !== "string"
    || typeof payload.token !== "string"
    || payload.assetId.length > 64
    || payload.guideId.length > 64
    || payload.token.length > 128
  ) {
    return null;
  }

  return { assetId: payload.assetId, guideId: payload.guideId, token: payload.token };
}

function getClientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "This download is unavailable. Return to your access page or contact support." },
    { headers: SAFE_HEADERS, status: 404 },
  );
}

export async function POST(request: NextRequest) {
  let input: DownloadRequest | null;
  try {
    input = parseDownloadRequest(await request.json());
  } catch {
    input = null;
  }

  if (!input) {
    return unavailableResponse();
  }

  try {
    const result = await createGuideDownload(input.token, input.guideId, input.assetId, {
      clientAddress: getClientAddress(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result) {
      logOperationalEvent("warn", "download_access_denied", { reason: "invalid_grant_or_entitlement" });
      return unavailableResponse();
    }

    return NextResponse.json({ url: result.signedUrl }, { headers: SAFE_HEADERS });
  } catch {
    logOperationalEvent("error", "download_access_failed", { failure: "signing_or_audit" });
    return NextResponse.json(
      { error: "We could not prepare this download. Please try again." },
      { headers: SAFE_HEADERS, status: 503 },
    );
  }
}

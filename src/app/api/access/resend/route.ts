import { NextRequest, NextResponse } from "next/server";

import { requestAccessResend } from "@/lib/access";
import { logOperationalEvent } from "@/lib/observability/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const NEUTRAL_RESPONSE = {
  message: "If an eligible purchase uses that email address, we will send an access link shortly.",
};

function getClientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function getEmail(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => key !== "email") || typeof payload.email !== "string") {
    return null;
  }

  return payload.email;
}

/**
 * This intentionally has the same success response for an unknown email, an
 * expired grant, a rate limit, and a queued resend. That prevents the form
 * from becoming an account discovery endpoint.
 */
export async function POST(request: NextRequest) {
  let email: string | null;
  try {
    email = getEmail(await request.json());
  } catch {
    email = null;
  }

  if (email !== null) {
    try {
      await requestAccessResend(email, getClientAddress(request));
    } catch {
      logOperationalEvent("error", "access_resend_request_failed", { failure: "database" });
    }
  }

  return NextResponse.json(NEUTRAL_RESPONSE, { headers: SAFE_HEADERS, status: 202 });
}

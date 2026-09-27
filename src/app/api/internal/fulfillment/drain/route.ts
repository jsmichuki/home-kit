import { NextResponse } from "next/server";

import { hasValidFulfillmentWorkerAuthorization } from "@/lib/fulfillment-worker-auth";
import { drainFulfillmentOutbox } from "@/lib/fulfillment-outbox";

export const runtime = "nodejs";

const SAFE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Invoke from trusted scheduled infrastructure using FULFILLMENT_WORKER_SECRET.
 * The database remains the durable source of jobs if this endpoint is unavailable.
 */
export async function POST(request: Request) {
  if (!hasValidFulfillmentWorkerAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { headers: SAFE_HEADERS, status: 401 });
  }

  try {
    const result = await drainFulfillmentOutbox({ limit: 10 });
    return NextResponse.json(result, { headers: SAFE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Fulfillment processing unavailable." },
      { headers: SAFE_HEADERS, status: 503 },
    );
  }
}

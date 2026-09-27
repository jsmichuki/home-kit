import "server-only";

import { timingSafeEqual } from "node:crypto";

export function hasValidFulfillmentWorkerAuthorization(request: Request) {
  const secret = process.env.FULFILLMENT_WORKER_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);

  if (supplied.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }

  return timingSafeEqual(supplied, expected);
}

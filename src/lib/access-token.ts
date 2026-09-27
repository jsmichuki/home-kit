import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TOKEN_VERSION = "v1";
const ACCESS_TOKEN_CONTEXT = "home-kit/access-grant/v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function accessTokenSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ACCESS_TOKEN_SECRET must be configured with at least 32 characters.");
  }

  return secret;
}

function uuidToBytes(accessGrantId: string) {
  if (!UUID_PATTERN.test(accessGrantId)) {
    throw new Error("An access grant ID must be a UUID.");
  }

  return Buffer.from(accessGrantId.replaceAll("-", ""), "hex");
}

function bytesToUuid(bytes: Buffer) {
  if (bytes.length !== 16) {
    return null;
  }

  const hex = bytes.toString("hex");
  const candidate = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");

  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

function signatureForGrant(accessGrantId: string) {
  return createHmac("sha256", accessTokenSecret())
    .update(`${ACCESS_TOKEN_CONTEXT}:${accessGrantId.toLowerCase()}`)
    .digest();
}

/**
 * A deterministic, tamper-evident delivery token. It encodes a random grant
 * UUID plus an HMAC signature, so the database only ever needs the token hash.
 */
export function createAccessToken(accessGrantId: string) {
  const normalizedGrantId = bytesToUuid(uuidToBytes(accessGrantId));

  if (!normalizedGrantId) {
    throw new Error("An access grant ID must be a UUID.");
  }

  return [
    ACCESS_TOKEN_VERSION,
    uuidToBytes(normalizedGrantId).toString("base64url"),
    signatureForGrant(normalizedGrantId).toString("base64url"),
  ].join(".");
}

/** Returns the grant UUID only when a token has a valid HMAC signature. */
export function verifyAccessToken(token: string) {
  const parts = token.split(".");

  if (parts.length !== 3 || parts[0] !== ACCESS_TOKEN_VERSION) {
    return null;
  }

  let accessGrantId: string | null;
  let suppliedSignature: Buffer;
  try {
    accessGrantId = bytesToUuid(Buffer.from(parts[1], "base64url"));
    suppliedSignature = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }

  if (!accessGrantId) {
    return null;
  }

  const expectedSignature = signatureForGrant(accessGrantId);
  if (suppliedSignature.length !== expectedSignature.length) {
    timingSafeEqual(expectedSignature, expectedSignature);
    return null;
  }

  return timingSafeEqual(suppliedSignature, expectedSignature)
    ? accessGrantId
    : null;
}

/** Builds the sole public delivery URL shape without exposing a grant query parameter. */
export function buildAccessUrl(token: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredSiteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required to build delivery links.");
  }

  let siteUrl: URL;
  try {
    siteUrl = new URL(configuredSiteUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute URL.");
  }

  if (siteUrl.protocol !== "https:" && !(siteUrl.protocol === "http:" && siteUrl.hostname === "localhost")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }

  return new URL(`/downloads/${encodeURIComponent(token)}`, siteUrl).toString();
}

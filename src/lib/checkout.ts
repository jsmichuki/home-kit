import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  type CheckoutCatalogue,
  type CheckoutPrice,
  buildPaystackInitializePayload,
  resolveCheckoutSelection,
} from "@/lib/checkout-contract";
import { CATALOGUE_CURRENCY } from "@/lib/catalog";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";
const PAYSTACK_CHECKOUT_HOST = "checkout.paystack.com";
const INITIALIZE_TIMEOUT_MS = 10_000;

type DatabaseGuide = {
  current_version: number;
  id: string;
  is_active: boolean;
  slug: string;
  title: string;
};

type DatabaseBundle = {
  id: string;
  is_active: boolean;
  slug: string;
  title: string;
};

type DatabaseBundleGuide = {
  bundle_id: string;
  guide_id: string;
};

type DatabasePrice = {
  active_from: string;
  amount_in_subunits: number;
  bundle_id: string | null;
  catalogue_version: number;
  currency: string;
  guide_id: string | null;
};

type ExistingCheckoutOrder = {
  paystack_authorization_url: string | null;
  status: string;
};

type PaystackInitializeResponse = {
  data?: {
    authorization_url?: unknown;
    reference?: unknown;
  };
  message?: unknown;
  status?: unknown;
};

export class CheckoutServiceError extends Error {
  constructor(
    readonly code:
      | "CHECKOUT_IN_PROGRESS"
      | "CONFIGURATION_ERROR"
      | "PAYMENT_UNAVAILABLE",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type CreateCheckoutInput = {
  confirmationSecret: string;
  deliveryEmail: string;
  idempotencyKey: string;
  productIds: readonly string[];
};

export type CreateCheckoutResult = {
  authorizationUrl: string;
};

export async function createCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const siteUrl = getSiteUrl();
  const paystackSecret = requirePaystackSecret();
  const catalogue = await getCheckoutCatalogue();
  const selection = resolveCheckoutSelection(catalogue, input.productIds);
  const supabase = createSupabaseAdminClient();
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  const publicId = `ord_${randomToken(18)}`;
  const reference = `order_${publicId}_${randomToken(12)}`;

  const { data: insertedOrder, error: insertError } = await supabase
    .from("commerce_orders")
    .insert({
      amount_in_subunits: selection.amountInSubunits,
      catalogue_version: selection.catalogueVersion,
      checkout_idempotency_key_hash: idempotencyKeyHash,
      confirmation_secret_hash: sha256(input.confirmationSecret),
      currency: selection.currency,
      customer_email: input.deliveryEmail,
      entitlement_snapshot: selection.entitlementSnapshot,
      paystack_reference: reference,
      public_id: publicId,
      selected_items: selection.selectedItems,
      status: "payment_pending",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    const existing = await findExistingCheckout(supabase, idempotencyKeyHash);
    if (existing?.paystack_authorization_url) {
      return { authorizationUrl: existing.paystack_authorization_url };
    }

    if (existing?.status === "failed") {
      throw new CheckoutServiceError(
        "PAYMENT_UNAVAILABLE",
        "We could not start your payment. Please try again.",
        502,
      );
    }

    if (existing) {
      throw new CheckoutServiceError(
        "CHECKOUT_IN_PROGRESS",
        "Your payment is still being prepared. Please try again in a moment.",
        409,
      );
    }

    throw new CheckoutServiceError(
      "PAYMENT_UNAVAILABLE",
      "We could not start your payment. Please try again.",
      502,
    );
  }

  if (!insertedOrder) {
    throw new CheckoutServiceError(
      "PAYMENT_UNAVAILABLE",
      "We could not start your payment. Please try again.",
      502,
    );
  }

  const callbackUrl = new URL("/payment/confirmation", siteUrl);
  callbackUrl.searchParams.set("reference", reference);
  callbackUrl.searchParams.set("confirmation", input.confirmationSecret);

  let authorizationUrl: string;
  try {
    authorizationUrl = await initializePaystackTransaction({
      amountInSubunits: selection.amountInSubunits,
      callbackUrl: callbackUrl.toString(),
      catalogueVersion: selection.catalogueVersion,
      currency: selection.currency,
      deliveryEmail: input.deliveryEmail,
      paystackSecret,
      publicOrderId: publicId,
      reference,
    });
  } catch {
    // A timeout or connection drop can happen after Paystack accepts the
    // request. Keep this order pending so a later verified webhook can still
    // fulfill it; changing it to failed would strand a legitimate payment.
    throw new CheckoutServiceError(
      "PAYMENT_UNAVAILABLE",
      "We could not start your payment. Please try again.",
      502,
    );
  }

  const { error: updateError } = await supabase
    .from("commerce_orders")
    .update({ paystack_authorization_url: authorizationUrl })
    .eq("id", insertedOrder.id)
    .eq("status", "payment_pending");

  if (updateError) {
    throw new CheckoutServiceError(
      "CHECKOUT_IN_PROGRESS",
      "Your payment is still being prepared. Please try again in a moment.",
      409,
    );
  }

  return { authorizationUrl };
}

export function createConfirmationSecret() {
  return randomToken(32);
}

export function isValidIdempotencyKey(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{20,128}$/.test(value));
}

async function getCheckoutCatalogue(): Promise<CheckoutCatalogue> {
  const supabase = createSupabaseAdminClient();
  const requestedAt = new Date().toISOString();
  const [guidesResult, bundlesResult, bundleGuidesResult, pricesResult] = await Promise.all([
    supabase
      .from("commerce_guides")
      .select("id, slug, title, is_active, current_version"),
    supabase.from("commerce_bundles").select("id, slug, title, is_active"),
    supabase.from("commerce_bundle_guides").select("bundle_id, guide_id"),
    supabase
      .from("commerce_catalogue_prices")
      .select(
        "guide_id, bundle_id, currency, amount_in_subunits, catalogue_version, active_from",
      )
      .eq("currency", CATALOGUE_CURRENCY)
      .lte("active_from", requestedAt)
      .or(`active_until.is.null,active_until.gt.${requestedAt}`),
  ]);

  if (
    guidesResult.error ||
    bundlesResult.error ||
    bundleGuidesResult.error ||
    pricesResult.error
  ) {
    throw new CheckoutServiceError(
      "PAYMENT_UNAVAILABLE",
      "We could not start your payment. Please try again.",
      502,
    );
  }

  const bundleGuideIds = new Map<string, string[]>();
  for (const row of (bundleGuidesResult.data ?? []) as DatabaseBundleGuide[]) {
    const current = bundleGuideIds.get(row.bundle_id) ?? [];
    current.push(row.guide_id);
    bundleGuideIds.set(row.bundle_id, current);
  }

  const pricesByProductId = new Map<string, CheckoutPrice>();
  for (const row of ((pricesResult.data ?? []) as DatabasePrice[])
    .sort((left, right) => right.active_from.localeCompare(left.active_from))) {
    const productId = row.guide_id ?? row.bundle_id;
    if (!productId || pricesByProductId.has(productId)) {
      continue;
    }

    pricesByProductId.set(productId, {
      amountInSubunits: row.amount_in_subunits,
      catalogueVersion: row.catalogue_version,
      productId,
    });
  }

  return {
    bundles: ((bundlesResult.data ?? []) as DatabaseBundle[]).map((bundle) => ({
      id: bundle.id,
      isActive: bundle.is_active,
      slug: bundle.slug,
      title: bundle.title,
    })),
    bundleGuideIds,
    currency: CATALOGUE_CURRENCY,
    guides: ((guidesResult.data ?? []) as DatabaseGuide[]).map((guide) => ({
      currentVersion: guide.current_version,
      id: guide.id,
      isActive: guide.is_active,
      slug: guide.slug,
      title: guide.title,
    })),
    pricesByProductId,
  };
}

async function findExistingCheckout(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  idempotencyKeyHash: string,
) {
  const { data } = await supabase
    .from("commerce_orders")
    .select("paystack_authorization_url, status")
    .eq("checkout_idempotency_key_hash", idempotencyKeyHash)
    .maybeSingle();

  return data as ExistingCheckoutOrder | null;
}

async function initializePaystackTransaction({
  amountInSubunits,
  callbackUrl,
  catalogueVersion,
  currency,
  deliveryEmail,
  paystackSecret,
  publicOrderId,
  reference,
}: {
  amountInSubunits: number;
  callbackUrl: string;
  catalogueVersion: number;
  currency: string;
  deliveryEmail: string;
  paystackSecret: string;
  publicOrderId: string;
  reference: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INITIALIZE_TIMEOUT_MS);

  try {
    const response = await fetch(PAYSTACK_INITIALIZE_URL, {
      body: JSON.stringify(
        buildPaystackInitializePayload({
          amountInSubunits,
          callbackUrl,
          catalogueVersion,
          currency,
          deliveryEmail,
          publicOrderId,
          reference,
        }),
      ),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as PaystackInitializeResponse | null;
    if (!response.ok || !payload?.status || payload.data?.reference !== reference) {
      throw new Error("Paystack initialization failed.");
    }

    return validatePaystackAuthorizationUrl(payload.data.authorization_url);
  } finally {
    clearTimeout(timeout);
  }
}

function validatePaystackAuthorizationUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Paystack did not return an authorization URL.");
  }

  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== PAYSTACK_CHECKOUT_HOST && !url.hostname.endsWith(".paystack.com"))
  ) {
    throw new Error("Paystack returned an unexpected authorization URL.");
  }

  return url.toString();
}

function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    throw new CheckoutServiceError(
      "CONFIGURATION_ERROR",
      "Checkout is not configured yet. Please try again later.",
      503,
    );
  }

  try {
    const url = new URL(value);
    const allowLocalHttp = process.env.NODE_ENV !== "production" && url.hostname === "localhost";
    if (url.protocol !== "https:" && !allowLocalHttp) {
      throw new Error("Invalid site protocol.");
    }
    return url;
  } catch {
    throw new CheckoutServiceError(
      "CONFIGURATION_ERROR",
      "Checkout is not configured yet. Please try again later.",
      503,
    );
  }
}

function requirePaystackSecret() {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) {
    throw new CheckoutServiceError(
      "CONFIGURATION_ERROR",
      "Checkout is not configured yet. Please try again later.",
      503,
    );
  }
  return value;
}

function randomToken(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

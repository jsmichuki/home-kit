import { CATALOGUE_CURRENCY } from "@/lib/catalog";

export type CheckoutGuide = {
  currentVersion: number;
  id: string;
  isActive: boolean;
  slug: string;
  title: string;
};

export type CheckoutBundle = {
  id: string;
  isActive: boolean;
  slug: string;
  title: string;
};

export type CheckoutPrice = {
  amountInSubunits: number;
  catalogueVersion: number;
  productId: string;
};

export type CheckoutCatalogue = {
  bundles: readonly CheckoutBundle[];
  bundleGuideIds: ReadonlyMap<string, readonly string[]>;
  currency: string;
  guides: readonly CheckoutGuide[];
  pricesByProductId: ReadonlyMap<string, CheckoutPrice>;
};

export type CheckoutSelection = {
  amountInSubunits: number;
  catalogueVersion: number;
  currency: string;
  entitlementSnapshot: ReadonlyArray<{
    guide_id: string;
    guide_slug: string;
    guide_title: string;
    version: number;
  }>;
  selectedItems: ReadonlyArray<{
    amount_in_subunits: number;
    catalogue_version: number;
    product_id: string;
    product_slug: string;
    product_title: string;
    product_type: "bundle" | "guide";
  }>;
};

export class CheckoutValidationError extends Error {}

export type ParsedCheckoutRequest = {
  deliveryEmail: string;
  normalizedEmail: string;
  productIds: string[];
};

export type PaystackInitializeInput = {
  amountInSubunits: number;
  callbackUrl: string;
  catalogueVersion: number;
  currency: string;
  deliveryEmail: string;
  publicOrderId: string;
  reference: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailForLookup(email: string) {
  return email.trim().toLowerCase();
}

export function parseCheckoutRequest(value: unknown): ParsedCheckoutRequest {
  if (!isPlainObject(value)) {
    throw new CheckoutValidationError("Submit an email address and at least one guide.");
  }

  const keys = Object.keys(value);
  if (keys.some((key) => key !== "email" && key !== "productIds")) {
    throw new CheckoutValidationError("The checkout request contains unsupported fields.");
  }

  if (typeof value.email !== "string") {
    throw new CheckoutValidationError("Enter a valid email address.");
  }

  const deliveryEmail = value.email.trim();
  if (
    deliveryEmail.length < 3 ||
    deliveryEmail.length > 320 ||
    !EMAIL_PATTERN.test(deliveryEmail)
  ) {
    throw new CheckoutValidationError("Enter a valid email address.");
  }

  if (!Array.isArray(value.productIds) || value.productIds.length === 0) {
    throw new CheckoutValidationError("Select at least one guide to continue.");
  }

  if (value.productIds.length > 9) {
    throw new CheckoutValidationError("Select no more than eight guides or the complete set.");
  }

  const productIds = value.productIds.map((productId) => {
    if (
      typeof productId !== "string" ||
      productId.length === 0 ||
      productId.length > 100
    ) {
      throw new CheckoutValidationError("Your guide selection is not valid.");
    }

    return productId;
  });

  if (new Set(productIds).size !== productIds.length) {
    throw new CheckoutValidationError("Your guide selection contains a duplicate item.");
  }

  return {
    deliveryEmail,
    normalizedEmail: normalizeEmailForLookup(deliveryEmail),
    productIds,
  };
}

export function resolveCheckoutSelection(
  catalogue: CheckoutCatalogue,
  productIds: readonly string[],
): CheckoutSelection {
  if (catalogue.currency !== CATALOGUE_CURRENCY) {
    throw new Error("The checkout catalogue currency is not supported.");
  }

  const guidesById = new Map(catalogue.guides.map((guide) => [guide.id, guide]));
  const bundlesById = new Map(catalogue.bundles.map((bundle) => [bundle.id, bundle]));
  const requestedGuides = productIds.filter((productId) => guidesById.has(productId));
  const requestedBundles = productIds.filter((productId) => bundlesById.has(productId));

  if (requestedGuides.length + requestedBundles.length !== productIds.length) {
    throw new CheckoutValidationError("One or more selected guides are no longer available.");
  }

  if (requestedBundles.length > 1 || (requestedBundles.length === 1 && requestedGuides.length > 0)) {
    throw new CheckoutValidationError(
      "Choose the complete set or individual guides, not both.",
    );
  }

  const selectedProducts = requestedBundles.length === 1
    ? requestedBundles
    : requestedGuides;
  const selectedItems: Array<CheckoutSelection["selectedItems"][number]> = [];
  let entitledGuideIds: readonly string[] = requestedGuides;

  for (const productId of selectedProducts) {
    const guide = guidesById.get(productId);
    const bundle = bundlesById.get(productId);
    const product = guide ?? bundle;

    if (!product || !product.isActive) {
      throw new CheckoutValidationError("One or more selected guides are no longer available.");
    }

    const price = catalogue.pricesByProductId.get(productId);
    if (!price || price.amountInSubunits < 0 || !Number.isSafeInteger(price.amountInSubunits)) {
      throw new Error("An active catalogue item is missing a valid price.");
    }

    if (bundle) {
      const includedGuides = catalogue.bundleGuideIds.get(bundle.id);
      if (!includedGuides || includedGuides.length === 0) {
        throw new Error("The complete set has no guide entitlements.");
      }
      entitledGuideIds = includedGuides;
    }

    selectedItems.push({
      amount_in_subunits: price.amountInSubunits,
      catalogue_version: price.catalogueVersion,
      product_id: product.id,
      product_slug: product.slug,
      product_title: product.title,
      product_type: bundle ? "bundle" : "guide",
    });
  }

  const uniqueEntitledGuideIds = [...new Set(entitledGuideIds)];
  const entitlementSnapshot = uniqueEntitledGuideIds.map((guideId) => {
    const guide = guidesById.get(guideId);
    if (!guide || !guide.isActive) {
      throw new Error("A complete set contains an unavailable guide.");
    }

    return {
      guide_id: guide.id,
      guide_slug: guide.slug,
      guide_title: guide.title,
      version: guide.currentVersion,
    };
  });

  const amountInSubunits = selectedItems.reduce(
    (total, item) => total + item.amount_in_subunits,
    0,
  );
  if (!Number.isSafeInteger(amountInSubunits) || amountInSubunits <= 0) {
    throw new Error("The checkout total is not valid.");
  }

  return {
    amountInSubunits,
    catalogueVersion: Math.max(
      ...selectedItems.map((item) => item.catalogue_version),
    ),
    currency: catalogue.currency,
    entitlementSnapshot,
    selectedItems,
  };
}

/**
 * The payload intentionally contains no browser controlled total, currency,
 * or payment channel. Paystack receives card checkout only.
 */
export function buildPaystackInitializePayload(input: PaystackInitializeInput) {
  return {
    amount: String(input.amountInSubunits),
    callback_url: input.callbackUrl,
    channels: ["card"],
    currency: input.currency,
    email: input.deliveryEmail,
    metadata: JSON.stringify({
      catalogue_version: input.catalogueVersion,
      order_public_id: input.publicOrderId,
    }),
    reference: input.reference,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

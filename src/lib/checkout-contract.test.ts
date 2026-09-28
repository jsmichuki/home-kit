import { describe, expect, it } from "vitest";
import {
  buildPaystackInitializePayload,
  CheckoutValidationError,
  parseCheckoutRequest,
  resolveCheckoutSelection,
  type CheckoutCatalogue,
} from "@/lib/checkout-contract";

const guides = [
  {
    currentVersion: 2,
    id: "guide-one",
    isActive: true,
    slug: "guide-one",
    title: "Guide one",
  },
  {
    currentVersion: 1,
    id: "guide-two",
    isActive: true,
    slug: "guide-two",
    title: "Guide two",
  },
] as const;

const catalogue: CheckoutCatalogue = {
  bundles: [
    {
      id: "complete-set",
      isActive: true,
      slug: "complete-set",
      title: "Complete set",
    },
  ],
  bundleGuideIds: new Map([["complete-set", ["guide-one", "guide-two"]]]),
  currency: "USD",
  guides,
  pricesByProductId: new Map([
    [
      "guide-one",
      { amountInSubunits: 1200, catalogueVersion: 3, productId: "guide-one" },
    ],
    [
      "guide-two",
      { amountInSubunits: 2400, catalogueVersion: 3, productId: "guide-two" },
    ],
    [
      "complete-set",
      { amountInSubunits: 2900, catalogueVersion: 3, productId: "complete-set" },
    ],
  ]),
};

describe("parseCheckoutRequest", () => {
  it("retains the delivery address while providing a normalized lookup address", () => {
    expect(
      parseCheckoutRequest({
        email: " Buyer+home@Example.com ",
        productIds: ["guide-one"],
      }),
    ).toEqual({
      deliveryEmail: "Buyer+home@Example.com",
      normalizedEmail: "buyer+home@example.com",
      productIds: ["guide-one"],
    });
  });

  it.each([
    [{ email: "not-an-email", productIds: ["guide-one"] }],
    [{ email: "buyer@example.com", productIds: [] }],
    [{ email: "buyer@example.com", productIds: ["guide-one", "guide-one"] }],
    [{ amount: 1, email: "buyer@example.com", productIds: ["guide-one"] }],
  ])("rejects invalid browser input %#", (input) => {
    expect(() => parseCheckoutRequest(input)).toThrow(CheckoutValidationError);
  });
});

describe("resolveCheckoutSelection", () => {
  it("uses only canonical server prices and snapshots guide versions", () => {
    expect(resolveCheckoutSelection(catalogue, ["guide-one", "guide-two"])).toEqual({
      amountInSubunits: 3600,
      catalogueVersion: 3,
      currency: "USD",
      entitlementSnapshot: [
        {
          guide_id: "guide-one",
          guide_slug: "guide-one",
          guide_title: "Guide one",
          version: 2,
        },
        {
          guide_id: "guide-two",
          guide_slug: "guide-two",
          guide_title: "Guide two",
          version: 1,
        },
      ],
      selectedItems: [
        {
          amount_in_subunits: 1200,
          catalogue_version: 3,
          product_id: "guide-one",
          product_slug: "guide-one",
          product_title: "Guide one",
          product_type: "guide",
        },
        {
          amount_in_subunits: 2400,
          catalogue_version: 3,
          product_id: "guide-two",
          product_slug: "guide-two",
          product_title: "Guide two",
          product_type: "guide",
        },
      ],
    });
  });

  it("resolves the complete set to all entitled guide versions", () => {
    const result = resolveCheckoutSelection(catalogue, ["complete-set"]);

    expect(result.amountInSubunits).toBe(2900);
    expect(result.selectedItems).toHaveLength(1);
    expect(result.selectedItems[0]?.product_type).toBe("bundle");
    expect(result.entitlementSnapshot.map((guide) => guide.guide_id)).toEqual([
      "guide-one",
      "guide-two",
    ]);
  });

  it.each([
    [["guide-one", "complete-set"]],
    [["unknown-guide"]],
  ])("rejects invalid product combinations %#", (productIds) => {
    expect(() => resolveCheckoutSelection(catalogue, productIds)).toThrow(
      CheckoutValidationError,
    );
  });

  it("rejects an inactive guide even when a client still has its ID", () => {
    const unavailableCatalogue: CheckoutCatalogue = {
      ...catalogue,
      guides: [{ ...guides[0], isActive: false }, guides[1]],
    };

    expect(() => resolveCheckoutSelection(unavailableCatalogue, ["guide-one"])).toThrow(
      CheckoutValidationError,
    );
  });
});

describe("buildPaystackInitializePayload", () => {
  it("uses server-derived subunits and card-only checkout metadata", () => {
    expect(
      buildPaystackInitializePayload({
        amountInSubunits: 6900,
        callbackUrl: "https://astralrefine.com/payment/confirmation?confirmation=opaque-confirmation-value",
        catalogueVersion: 3,
        currency: "USD",
        deliveryEmail: "Buyer@Example.com",
        publicOrderId: "ord_123",
        reference: "order_ord_123_abc",
      }),
    ).toEqual({
      amount: "6900",
      callback_url: "https://astralrefine.com/payment/confirmation?confirmation=opaque-confirmation-value",
      channels: ["card"],
      currency: "USD",
      email: "Buyer@Example.com",
      metadata: JSON.stringify({ catalogue_version: 3, order_public_id: "ord_123" }),
      reference: "order_ord_123_abc",
    });
  });
});

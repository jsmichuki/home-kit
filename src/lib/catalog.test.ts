import { describe, expect, it } from "vitest";
import { COMPLETE_SET, GUIDES } from "@/lib/catalog";

describe("product catalogue", () => {
  it("has eight uniquely identified active guides with deliverable formats and prices", () => {
    expect(GUIDES).toHaveLength(8);
    expect(new Set(GUIDES.map((guide) => guide.id)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(GUIDES.length);

    for (const guide of GUIDES) {
      expect(guide.isActive).toBe(true);
      expect(guide.currentVersion).toBeGreaterThan(0);
      expect(guide.priceInCents).toBeGreaterThan(0);
      expect(guide.includedFiles).toHaveLength(2);
    }
  });

  it("makes the complete set contain exactly every active guide at the approved price", () => {
    expect(new Set(COMPLETE_SET.includedGuideIds)).toEqual(
      new Set(GUIDES.map((guide) => guide.id)),
    );
    expect(COMPLETE_SET.priceInCents).toBe(6900);
    expect(GUIDES.reduce((total, guide) => total + guide.priceInCents, 0)).toBe(14300);
  });
});

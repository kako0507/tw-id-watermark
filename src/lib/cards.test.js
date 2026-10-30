import { describe, expect, it } from "vitest";
import { CARD_SIZES, aspectName, cardRatio, cardSizes, customSize, nearestCard, pickAspect } from "./cards.js";

describe("customSize", () => {
  it("returns [w, h] only when both are positive", () => {
    expect(customSize({ customWidth: 90, customHeight: 55 })).toEqual([90, 55]);
    expect(customSize({ customWidth: 90, customHeight: 0 })).toBeNull();
    expect(customSize({ customWidth: 0, customHeight: 0 })).toBeNull();
    expect(customSize({ customWidth: -1, customHeight: 5 })).toBeNull();
  });
});

describe("cardSizes", () => {
  it("uses the built-in sizes for known card types", () => {
    expect(cardSizes("id1")).toBe(CARD_SIZES.id1.sizes);
    expect(cardSizes("license", [10, 10])).toBe(CARD_SIZES.license.sizes);
  });

  it("uses the custom size for points, or null to follow the corners", () => {
    expect(cardSizes("points", [90, 55])).toEqual([[90, 55]]);
    expect(cardSizes("points", null)).toBeNull();
  });
});

describe("cardRatio", () => {
  it("picks the closest size and reports its long side", () => {
    const outer = cardRatio(CARD_SIZES.id1.sizes, 85.6 / 54);
    expect(outer.longMm).toBe(85.6);
    expect(outer.diff).toBeCloseTo(0);

    const paper = cardRatio(CARD_SIZES.id1.sizes, 1.66);
    expect(paper.longMm).toBe(79.7);
  });

  it("treats portrait sizes the same as landscape", () => {
    expect(cardRatio([[54, 85.6]], 85.6 / 54).diff).toBeCloseTo(0);
  });
});

describe("nearestCard", () => {
  it("matches a measured ratio to the closest card type", () => {
    expect(nearestCard(1.58).key).toBe("id1");
    expect(nearestCard(1.42).key).toBe("license");
  });
});

describe("pickAspect", () => {
  it("follows an explicit card type", () => {
    expect(pickAspect("license", { aspect: "id1" })).toBe("license");
  });

  it("uses the detection guess, defaulting to id1", () => {
    expect(pickAspect("guess", { aspect: "license" })).toBe("license");
    expect(pickAspect("guess", null)).toBe("id1");
  });
});

describe("aspectName", () => {
  it("names card types, custom sizes and the corner fallback", () => {
    expect(aspectName("license")).toBe("駕照");
    expect(aspectName("points", [90, 55])).toBe("自訂 90 × 55 mm");
    expect(aspectName("points", null)).toBe("依四個點");
  });
});

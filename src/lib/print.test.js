import { describe, expect, it } from "vitest";
import { A4_MM, GAP_MM, PAGE_MARGIN_MM, layoutPages, printSizeMm } from "./print.js";

const settings = { cropMargin: 1, customWidth: 0, customHeight: 0 };
const cropped = (aspect) => ({ corners: [{ x: 0, y: 0 }], aspect });

describe("printSizeMm", () => {
  it("prints an ID card at 85.6 x 54 mm plus the crop margin", () => {
    // 1 mm margin each side: 87.6 x 56 mm, here at 10 px per mm
    const [w, h] = printSizeMm(cropped("id1"), settings, 876, 560);
    expect(w).toBeCloseTo(87.6, 1);
    expect(h).toBeCloseTo(56, 1);
  });

  it("keeps a portrait output portrait", () => {
    const [w, h] = printSizeMm(cropped("id1"), settings, 560, 876);
    expect(w).toBeCloseTo(56, 1);
    expect(h).toBeCloseTo(87.6, 1);
  });

  it("uses the paper card size when the crop matches it", () => {
    const [w] = printSizeMm(cropped("id1"), { ...settings, cropMargin: 0 }, 797, 480);
    expect(w).toBeCloseTo(79.7, 1);
  });

  it("prints a driver's license at 85 x 60 mm", () => {
    const [w, h] = printSizeMm(cropped("license"), { ...settings, cropMargin: 0 }, 1700, 1200);
    expect(w).toBeCloseTo(85, 1);
    expect(h).toBeCloseTo(60, 1);
  });

  it("uses the custom size for points", () => {
    const [w, h] = printSizeMm(cropped("points"), { ...settings, cropMargin: 0, customWidth: 100, customHeight: 50 }, 2000, 1000);
    expect(w).toBeCloseTo(100, 1);
    expect(h).toBeCloseTo(50, 1);
  });

  it("assumes an uncropped photo shows a standard card, without margin", () => {
    const [w, h] = printSizeMm({ corners: null, aspect: "id1" }, settings, 1000, 600);
    expect(w).toBeCloseTo(85.6, 1);
    expect(h).toBeCloseTo(51.36, 1);
  });
});

describe("layoutPages", () => {
  const card = [87.6, 56];

  it("fits two cards per row and four rows on an A4 page", () => {
    const pages = layoutPages(Array(8).fill(card));
    expect(pages).toHaveLength(1);
    const [first, second, third] = pages[0];
    expect(first).toMatchObject({ x: PAGE_MARGIN_MM, y: PAGE_MARGIN_MM, w: 87.6, h: 56 });
    expect(second.x).toBeCloseTo(PAGE_MARGIN_MM + 87.6 + GAP_MM);
    expect(third).toMatchObject({ x: PAGE_MARGIN_MM, y: PAGE_MARGIN_MM + 56 + GAP_MM });
  });

  it("starts a new page when a page is full", () => {
    const pages = layoutPages(Array(10).fill(card));
    expect(pages.map((p) => p.length)).toEqual([8, 2]);
    expect(pages[1][0]).toMatchObject({ index: 8, x: PAGE_MARGIN_MM, y: PAGE_MARGIN_MM });
  });

  it("keeps every card inside the printable area", () => {
    const pages = layoutPages([card, [87, 62], [56, 87.6], card, [87, 62], card, [56, 87.6], card, card]);
    for (const page of pages) {
      for (const { x, y, w, h } of page) {
        expect(x + w).toBeLessThanOrEqual(A4_MM[0] - PAGE_MARGIN_MM + 1e-6);
        expect(y + h).toBeLessThanOrEqual(A4_MM[1] - PAGE_MARGIN_MM + 1e-6);
      }
    }
  });

  it("scales down only a card bigger than the printable area", () => {
    const [[huge]] = layoutPages([[400, 200]]);
    expect(huge.w).toBeCloseTo(A4_MM[0] - 2 * PAGE_MARGIN_MM);
    expect(huge.w / huge.h).toBeCloseTo(2);
  });

  it("returns no pages for no cards", () => {
    expect(layoutPages([])).toEqual([]);
  });
});

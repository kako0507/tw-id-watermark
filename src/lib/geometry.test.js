import { describe, expect, it } from "vitest";
import { CARD_SIZES } from "./cards.js";
import { fullCorners, marginPx, orderCorners, outputSize, rotateCorners } from "./geometry.js";

// An 800 x 400 axis-aligned quad (ratio 2:1) in TL, TR, BR, BL order
const quad = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 500 }, { x: 100, y: 500 }];

describe("orderCorners", () => {
  it("orders shuffled points as TL, TR, BR, BL", () => {
    const shuffled = [quad[2], quad[0], quad[3], quad[1]];
    expect(orderCorners(shuffled)).toEqual(quad);
  });

  it("handles a tilted card with perspective", () => {
    const tilted = [{ x: 60, y: 40 }, { x: 500, y: 90 }, { x: 470, y: 350 }, { x: 30, y: 300 }];
    expect(orderCorners([tilted[2], tilted[3], tilted[1], tilted[0]])).toEqual(tilted);
  });
});

describe("rotateCorners", () => {
  it("makes the next corner the top-left for each quarter turn", () => {
    expect(rotateCorners(quad, 0)).toEqual(quad);
    expect(rotateCorners(quad, 1)).toEqual([quad[1], quad[2], quad[3], quad[0]]);
    expect(rotateCorners(quad, 2)).toEqual([quad[2], quad[3], quad[0], quad[1]]);
  });

  it("wraps around and accepts negative turns", () => {
    expect(rotateCorners(quad, 4)).toEqual(quad);
    expect(rotateCorners(quad, -1)).toEqual(rotateCorners(quad, 3));
  });

  it("turns a portrait output into landscape", () => {
    const upright = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 800 }, { x: 0, y: 800 }];
    const [w, h] = outputSize(rotateCorners(upright, 1), null);
    expect(w).toBeGreaterThan(h);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(quad));
    rotateCorners(quad, 1);
    expect(quad).toEqual(copy);
  });
});

describe("fullCorners", () => {
  it("covers the whole image, optionally inset", () => {
    expect(fullCorners(100, 50)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
    expect(fullCorners(100, 50, 0.1)[0]).toEqual({ x: 10, y: 5 });
  });
});

describe("outputSize", () => {
  it("keeps the measured ratio when no size is given", () => {
    expect(outputSize(quad, null)).toEqual([800, 400]);
  });

  it("restores a standard card ratio, keeping the long side", () => {
    const [w, h] = outputSize(quad, CARD_SIZES.license.sizes);
    expect(w).toBe(800);
    expect(w / h).toBeCloseTo(85 / 60, 2);
  });

  it("uses a custom size", () => {
    const [w, h] = outputSize(quad, [[100, 80]]);
    expect(w).toBe(800);
    expect(h).toBe(640);
  });

  it("keeps portrait orientation for an upright card", () => {
    const upright = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 800 }, { x: 0, y: 800 }];
    const [w, h] = outputSize(upright, CARD_SIZES.id1.sizes);
    expect(h).toBeGreaterThan(w);
  });

  it("caps the long side at MAX_OUTPUT", () => {
    const huge = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }];
    expect(outputSize(huge, null)).toEqual([2400, 1200]);
  });
});

describe("marginPx", () => {
  it("converts millimetres using the card's real long side", () => {
    // 850 px for an 85 mm license = 10 px per mm
    expect(marginPx(850, 600, CARD_SIZES.license.sizes, 2)).toBe(20);
    // A custom 100 mm card at 1000 px = 10 px per mm
    expect(marginPx(1000, 500, [[100, 50]], 1.5)).toBe(15);
  });

  it("is zero when no margin is requested", () => {
    expect(marginPx(1000, 500, null, 0)).toBe(0);
  });
});

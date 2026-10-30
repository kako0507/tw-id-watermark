import { describe, expect, it } from "vitest";
import { orientationScore } from "./orient.js";

const W = 120, H = 76;
const PAPER = [235, 240, 238];  // pale card background
const GOLD = [200, 160, 60];
const SKIN = [220, 170, 140];
const RED = [210, 30, 40];

// Synthetic RGBA card: paper background plus filled rectangles in fractional coordinates
function card(blocks) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let color = PAPER;
      for (const [c, x0, y0, x1, y1] of blocks) {
        if (x / W >= x0 && x / W < x1 && y / H >= y0 && y / H < y1) color = c;
      }
      data.set([...color, 255], (y * W + x) * 4);
    }
  }
  return data;
}

// The same card turned 180°
function flip(data) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < W * H; i++) out.set(data.subarray(i * 4, i * 4 + 4), (W * H - 1 - i) * 4);
  return out;
}

const PINK = [241, 221, 227];   // ID front background
const PHOTO_BG = [233, 236, 239];

const nhi = card([[GOLD, 0.1, 0.35, 0.25, 0.6], [SKIN, 0.7, 0.45, 0.9, 0.85]]);
// Pink card whose photo area (light grey with a face) breaks up the pink on the right
const idFront = card([[PINK, 0, 0, 1, 1], [RED, 0.1, 0.07, 0.27, 0.26], [PHOTO_BG, 0.7, 0.22, 0.95, 0.78], [SKIN, 0.76, 0.35, 0.89, 0.62]]);
const license = card([[RED, 0.3, 0.05, 0.45, 0.25], [SKIN, 0.72, 0.1, 0.92, 0.55]]);
const idBack = card([]);

describe("orientationScore", () => {
  it("is positive for upright cards", () => {
    expect(orientationScore(nhi, W, H).score).toBeGreaterThan(0.3);
    expect(orientationScore(license, W, H).score).toBeGreaterThan(0.1);
  });

  it("is negative for the same cards upside down", () => {
    expect(orientationScore(flip(nhi), W, H).score).toBeLessThan(-0.3);
    expect(orientationScore(flip(license), W, H).score).toBeLessThan(-0.1);
  });

  it("is antisymmetric: flipping negates every cue", () => {
    const up = orientationScore(nhi, W, H), down = orientationScore(flip(nhi), W, H);
    for (const k of Object.keys(up.cues)) expect(down.cues[k]).toBeCloseTo(-up.cues[k], 2);
  });

  it("reports the individual cues", () => {
    const { cues } = orientationScore(nhi, W, H);
    expect(cues.chip).toBeGreaterThan(0);
    expect(cues.face).toBeGreaterThan(0);
    expect(orientationScore(license, W, H).cues.red).toBeGreaterThan(0);
  });

  it("does not mistake a pale pink background for skin", () => {
    const up = orientationScore(idFront, W, H);
    expect(up.cues.face).toBeGreaterThan(0);
    expect(up.score).toBeGreaterThan(0.1);
    expect(orientationScore(flip(idFront), W, H).score).toBeLessThan(-0.1);
  });

  it("has no opinion about a featureless card", () => {
    expect(Math.abs(orientationScore(idBack, W, H).score)).toBeLessThan(0.01);
  });
});

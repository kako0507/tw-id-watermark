import { warp } from "./geometry.js";

// Every supported card is landscape with a fixed layout, which tells us which way is up:
// - health / credit cards: gold chip on the left
// - ID front, health card, driver's license: portrait photo on the right
// - driver's license seal, ID flag: red block near the top
// - ID back: barcode at the bottom left (vertical bars: brightness changes left-right only)
const WEIGHTS = { chip: 3, face: 1, red: 2, barcode: 2 };
// Below this the cues are too weak to justify flipping an already landscape card
export const MIN_CONFIDENCE = 0.05;

// Wide enough that the ID's barcode bars stay apart
const SAMPLE_WIDTH = 360;

function hueOf(r, g, b, max, delta) {
  if (!delta) return 0;
  let h;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  return h < 0 ? h + 360 : h;
}

// How strongly an upright landscape card image (RGBA bytes) looks "this way up".
// Positive = upright, negative = upside down. Pure function of the pixels
export function orientationScore(data, W, H) {
  // [hits, total] per region; "a" regions vote for upright, "b" regions (mirrored) against
  const acc = { chipA: [0, 0], chipB: [0, 0], faceA: [0, 0], faceB: [0, 0], redA: [0, 0], redB: [0, 0] };
  const add = (key, hit) => { acc[key][1]++; if (hit) acc[key][0]++; };
  // Barcode: horizontal minus vertical brightness change, bottom-left vs (mirrored) top-right
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
  const bars = { a: [0, 0], b: [0, 0] };

  for (let y = 0; y < H; y++) {
    const fy = y / H;
    for (let x = 0; x < W; x++) {
      const fx = x / W;
      const i = (y * W + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      const s = max ? delta / max : 0;
      const hue = hueOf(r, g, b, max, delta);

      const gold = hue >= 30 && hue <= 60 && s > 0.4 && max > 0.35;
      // s > 0.15 keeps pale pink card backgrounds (e.g. the ID front) from counting as skin
      const skin = r > 0.37 && g > 0.16 && b > 0.08 && r > g && r > b && delta > 0.06 && Math.abs(r - g) > 0.06 && s > 0.15 && s < 0.6;
      const red = (hue < 15 || hue > 340) && s > 0.5 && max > 0.4;

      if (fy >= 0.25 && fy < 0.75) {
        if (fx >= 0.05 && fx < 0.35) add("chipA", gold);
        else if (fx >= 0.65 && fx < 0.95) add("chipB", gold);
      }
      if (fx >= 0.65 && fx < 0.95 && fy >= 0.2 && fy < 0.9) add("faceA", skin);
      if (fx >= 0.05 && fx < 0.35 && fy >= 0.1 && fy < 0.8) add("faceB", skin);
      if (fy < 0.4) add("redA", red);
      else if (fy >= 0.6) add("redB", red);

      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
        const region = fx >= 0.05 && fx < 0.55 && fy >= 0.62 && fy < 0.95 ? bars.a
          : fx >= 0.45 && fx < 0.95 && fy >= 0.05 && fy < 0.38 ? bars.b : null;
        if (region) {
          const j = y * W + x;
          region[0] += (Math.abs(lum[j + 1] - lum[j - 1]) - Math.abs(lum[j + W] - lum[j - W])) / 255;
          region[1]++;
        }
      }
    }
  }
  const frac = ([hits, total]) => (total ? hits / total : 0);
  const cues = {
    chip: frac(acc.chipA) - frac(acc.chipB),
    face: frac(acc.faceA) - frac(acc.faceB),
    red: frac(acc.redA) - frac(acc.redB),
    barcode: frac(bars.a) - frac(bars.b),
  };
  const score = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * cues[k], 0);
  return { score, cues };
}

// Draw src rotated counter-clockwise by `turns` quarter turns, scaled to SAMPLE_WIDTH wide
function sample(src, turns) {
  const swap = turns % 2 === 1;
  const w = swap ? src.height : src.width, h = swap ? src.width : src.height;
  const W = SAMPLE_WIDTH, H = Math.max(1, Math.round(W * h / w));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-turns * Math.PI / 2);
  const dw = swap ? H : W, dh = swap ? W : H;
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  return ctx.getImageData(0, 0, W, H);
}

// Quarter turns to apply with rotateCorners() so the card reads upright and landscape.
// Portrait results always turn (choosing the direction by the cues); landscape results
// only flip 180° when the cues say so with some confidence
export function detectOrientation(source, corners) {
  const flat = warp(source, corners, null, 0, 480);
  const portrait = flat.height > flat.width;
  const [a, b] = portrait ? [1, 3] : [0, 2];
  const imgA = sample(flat, a);
  const { score, cues } = orientationScore(imgA.data, imgA.width, imgA.height);
  // Rotating by 180° negates every cue, so one evaluation covers both candidates
  let turns;
  if (portrait) turns = score >= 0 ? a : b;
  else turns = score <= -MIN_CONFIDENCE ? b : a;
  return { turns, score: turns === a ? score : -score, cues };
}

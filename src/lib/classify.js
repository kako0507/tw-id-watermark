import { CARD_SIZES, cardRatio } from "./cards.js";
import { outputSize, warp } from "./geometry.js";

// Look for visual cues: a driver's license has a pale yellow background; health and
// credit cards have a gold chip on the left (or the right when upside down)
function analyzeCard(source, corners) {
  const flat = warp(source, corners, null, 0, 480);  // small preview is enough
  const portrait = flat.height > flat.width;
  const W = 240, H = Math.round(W * Math.min(flat.width, flat.height) / Math.max(flat.width, flat.height));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (portrait) {  // Rotate portrait cards to landscape first
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(flat, 0, 0, H, W);
  } else {
    ctx.drawImage(flat, 0, 0, W, H);
  }
  const d = ctx.getImageData(0, 0, W, H).data;

  let yellow = 0;
  const gold = [0, 0], goldTotal = [0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      const s = max ? delta / max : 0;
      let hue = 0;
      if (delta) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
        if (hue < 0) hue += 360;
      }
      if (hue >= 40 && hue <= 70 && s > 0.12 && max > 0.55) yellow++;
      // Chip area: 5-35% from the left, 25-75% down; also the mirrored right side (upside down)
      const fy = y / H, fx = x / W;
      if (fy < 0.25 || fy > 0.75) continue;
      const side = fx >= 0.05 && fx <= 0.35 ? 0 : fx >= 0.65 && fx <= 0.95 ? 1 : -1;
      if (side < 0) continue;
      goldTotal[side]++;
      if (hue >= 30 && hue <= 60 && s > 0.4 && max > 0.35) gold[side]++;
    }
  }
  return {
    yellow: yellow / (W * H),
    chip: Math.max(gold[0] / goldTotal[0], gold[1] / goldTotal[1]),
  };
}

// Combine ratio and appearance; visual cues only decide close calls (skewed photos)
// and never override a clearly different ratio
// Returns plain data (safe to put in the Redux store)
export function classifyCard(source, corners) {
  const [w, h] = outputSize(corners, null);
  const ratio = Math.max(w, h) / Math.min(w, h);
  const features = analyzeCard(source, corners);
  const isLicense = features.yellow > 0.3;
  // A license's yellow background also reads a little as gold, so only non-yellow cards can have a chip
  const hasChip = !isLicense && features.chip > 0.05;
  const bonus = Math.log(1.06);
  const candidates = [
    { aspect: "id1", diff: cardRatio(CARD_SIZES.id1.sizes, ratio).diff - (hasChip ? bonus : 0) + (isLicense ? bonus : 0) },
    { aspect: "license", diff: cardRatio(CARD_SIZES.license.sizes, ratio).diff - (isLicense ? bonus : 0) + (hasChip ? bonus : 0) },
  ];
  const best = candidates.sort((a, b) => a.diff - b.diff)[0];
  if (best.diff >= Math.log(1.08)) return { aspect: "points", kind: null, ratio, features };
  const kind = best.aspect === "license" ? "駕照" : hasChip ? "健保卡／晶片卡" : "身分證";
  return { aspect: best.aspect, kind, ratio, features };
}

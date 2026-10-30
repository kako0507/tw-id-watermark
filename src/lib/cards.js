// Real-world card sizes used to restore the aspect ratio after correction;
// "points" means no standard size: use the user's custom size if given, otherwise the
// distances between the four corners
// The first entry in sizes is the labelled size; the rest are only for matching
// (e.g. detection found the paper card inside the lamination)
export const CARD_SIZES = {
  id1: { label: "身分證／健保卡／信用卡（85.6 × 54 mm）", sizes: [[85.6, 54], [79.7, 48]] },
  license: { label: "駕照（85 × 60 mm）", sizes: [[85, 60]] },
};
export const POINTS_LABEL = "依四個點計算／自訂尺寸";
export const DEFAULT_LONG_MM = 85.6;  // Long side assumed when no size is known
export const MAX_OUTPUT = 2400;       // Max long side of the corrected image (px)

// Valid custom size from settings, or null when the user left it blank
export function customSize(settings) {
  const w = Number(settings.customWidth), h = Number(settings.customHeight);
  return w > 0 && h > 0 ? [w, h] : null;
}

// Sizes (mm) the output should match for an aspect, or null to follow the four corners
export function cardSizes(aspect, custom = null) {
  if (CARD_SIZES[aspect]) return CARD_SIZES[aspect].sizes;
  return aspect === "points" && custom ? [custom] : null;
}

// The size in this list closest to the measured ratio; ratios are always long / short
export function cardRatio(sizes, measured) {
  let best = null;
  for (const [w, h] of sizes) {
    const ratio = Math.max(w, h) / Math.min(w, h);
    const diff = Math.abs(Math.log(measured / ratio));
    if (!best || diff < best.diff) best = { ratio, diff, longMm: Math.max(w, h) };
  }
  return best;
}

// Card type with the closest ratio; diff is a log ratio, so it is symmetric
export function nearestCard(ratio) {
  let best = { key: "points", diff: Infinity };
  for (const [key, card] of Object.entries(CARD_SIZES)) {
    const { diff } = cardRatio(card.sizes, ratio);
    if (diff < best.diff) best = { key, diff };
  }
  return best;
}

// Aspect to use for the "card type" setting; "guess" uses the detection result
export function pickAspect(cardType, guess) {
  if (cardType !== "guess") return cardType;
  return guess ? guess.aspect : "id1";
}

export function aspectName(aspect, custom = null) {
  if (CARD_SIZES[aspect]) return CARD_SIZES[aspect].label.replace(/（.*/, "");
  return custom ? `自訂 ${custom[0]} × ${custom[1]} mm` : "依四個點";
}

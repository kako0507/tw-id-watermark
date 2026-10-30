import { cardSizes, customSize } from "./cards.js";
import { warp } from "./geometry.js";

// Pixels (ImageBitmap / canvas) are not serializable, so they stay out of the Redux store.
// The store keeps only the image id plus the data needed to rebuild the view (corners,
// aspect). Originals are kept here by id;
// corrected images are derived from "original + store data" and only memoized.
const originals = new Map();
const cropped = new Map();

export function setOriginal(id, bitmap) {
  originals.set(id, bitmap);
}

export function getOriginal(id) {
  return originals.get(id);
}

export function removeImage(id) {
  const bmp = originals.get(id);
  if (bmp && bmp.close) bmp.close();
  originals.delete(id);
  cropped.delete(id);
}

export function clearImages() {
  for (const id of [...originals.keys()]) removeImage(id);
}

// Source image to watermark, derived from the item's corners and aspect plus the margin
// and custom size settings
export function getSource(item, settings) {
  const original = originals.get(item.id);
  if (!original || !item.corners) return original;
  const sizes = cardSizes(item.aspect, customSize(settings));
  const key = JSON.stringify([item.corners, sizes, settings.cropMargin]);
  const hit = cropped.get(item.id);
  if (hit && hit.key === key) return hit.canvas;
  const canvas = warp(original, item.corners, sizes, settings.cropMargin);
  cropped.set(item.id, { key, canvas });
  return canvas;
}

import { DEFAULT_LONG_MM, cardRatio, cardSizes, customSize } from "./cards.js";

export const A4_MM = [210, 297];
export const PAGE_MARGIN_MM = 10;
export const GAP_MM = 5;
const PRINT_DPI = 300;  // Plenty for print; keeps the PDF small
export const PDF_NAME = "證件浮水印.pdf";

// Real printed size (mm) of a watermarked image of width x height px: the card's real size
// plus the crop margin on each side. Uncropped photos are assumed to show a standard card
// filling the photo
export function printSizeMm(item, settings, width, height) {
  const long = Math.max(width, height), short = Math.min(width, height);
  const cropped = Boolean(item.corners);
  const margin = cropped ? settings.cropMargin : 0;
  const sizes = cropped ? cardSizes(item.aspect, customSize(settings)) : null;
  const longMm = sizes ? cardRatio(sizes, long / short).longMm : DEFAULT_LONG_MM;
  const mmPerPx = (longMm + 2 * margin) / long;
  return [width * mmPerPx, height * mmPerPx];
}

// Place cards (sizes in mm) left to right in rows on A4 pages, starting a new row when one
// is full and a new page when a page is full. Cards keep their real size; one too big for
// the printable area (should not happen for cards) is scaled down to fit.
// Returns pages of { index, x, y, w, h } in mm from the page's top-left corner
export function layoutPages(sizes, { page = A4_MM, margin = PAGE_MARGIN_MM, gap = GAP_MM } = {}) {
  const [pw, ph] = page;
  const maxW = pw - 2 * margin, maxH = ph - 2 * margin;
  const pages = [[]];
  let x = margin, y = margin, rowH = 0;
  sizes.forEach(([w0, h0], index) => {
    const s = Math.min(1, maxW / w0, maxH / h0);
    const w = w0 * s, h = h0 * s;
    if (x + w > pw - margin + 1e-6 && x > margin) {  // next row
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + h > ph - margin + 1e-6 && y > margin) {  // next page
      pages.push([]);
      x = margin;
      y = margin;
      rowH = 0;
    }
    pages[pages.length - 1].push({ index, x, y, w, h });
    x += w + gap;
    rowH = Math.max(rowH, h);
  });
  return sizes.length ? pages : [];
}

// JPEG for a card printed at w x h mm, scaled down to PRINT_DPI when larger
function printImage(canvas, w) {
  const maxPx = Math.round(w / 25.4 * PRINT_DPI);
  if (canvas.width <= maxPx) return canvas.toDataURL("image/jpeg", 0.92);
  const c = document.createElement("canvas");
  c.width = maxPx;
  c.height = Math.round(canvas.height * maxPx / canvas.width);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.92);
}

// A4 PDF with every card at its real size and a thin grey cutting line around each.
// cards: [{ canvas, w, h }] with w, h in mm. Resolves to a Blob
export async function buildPdf(cards) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pages = layoutPages(cards.map((c) => [c.w, c.h]));
  pages.forEach((placements, p) => {
    if (p > 0) doc.addPage("a4", "portrait");
    for (const { index, x, y, w, h } of placements) {
      doc.addImage(printImage(cards[index].canvas, w), "JPEG", x, y, w, h);
      doc.setDrawColor(170);
      doc.setLineWidth(0.1);
      doc.rect(x, y, w, h);
    }
  });
  return doc.output("blob");
}

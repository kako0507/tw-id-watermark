import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "photos");
const PT_PER_MM = 72 / 25.4;
const A4_PT = [210 * PT_PER_MM, 297 * PT_PER_MM];

// Real sizes with the default 1 mm crop margin on each side
const EXPECTED_MM = {
  "id-front": [87.6, 56],
  "id-back": [87.6, 56],
  license: [87, 62],
  nhi: [87.6, 56],
};

// Each image is drawn with "w 0 0 h x y cm" in points; jsPDF writes uncompressed content
function placedImages(pdf) {
  return [...pdf.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/I\w*\s+Do/g)]
    .map((m) => [Number(m[1]) / PT_PER_MM, Number(m[2]) / PT_PER_MM]);
}

test("exports every card to A4 pages at its real size", async ({ page }) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
  // One upright photo of each card, then more ID fronts to fill past one page (8 per page)
  const picks = [
    ...Object.keys(EXPECTED_MM).map((card) => manifest.find((m) => m.card === card && m.rotation === 0)),
    ...manifest.filter((m) => m.card === "id-front" && m.rotation !== 0).slice(0, 3),
    ...manifest.filter((m) => m.card === "id-back" && m.rotation !== 0).slice(0, 3),
  ];
  expect(picks).toHaveLength(10);

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#file", picks.map((m) => path.join(DIR, m.file)));
  await page.waitForFunction((n) => {
    const items = Object.values(window.__store.getState().items.entities);
    return items.length === n && items.every((i) => i.status === "ready" && i.detection === "done");
  }, picks.length, { timeout: 150_000 });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 A4 PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("證件浮水印.pdf");
  const pdf = fs.readFileSync(await file.path(), "latin1");

  const mediaBoxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  expect(mediaBoxes, "two A4 pages for ten cards").toHaveLength(2);
  for (const [, w, h] of mediaBoxes) {
    expect(Number(w)).toBeCloseTo(A4_PT[0], 1);
    expect(Number(h)).toBeCloseTo(A4_PT[1], 1);
  }

  const images = placedImages(pdf);
  expect(images).toHaveLength(picks.length);
  for (const [i, m] of picks.entries()) {
    const [w, h] = images[i];
    const [ew, eh] = EXPECTED_MM[m.card];
    // Printed size within 0.3 mm of the real card size
    expect.soft(Math.abs(w - ew), `${m.file} width ${w.toFixed(2)} mm`).toBeLessThan(0.3);
    expect.soft(Math.abs(h - eh), `${m.file} height ${h.toFixed(2)} mm`).toBeLessThan(0.3);
  }
});

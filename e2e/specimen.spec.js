import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Photos generated from official card specimens (樣本) by scripts/make_e2e_photos.py,
// stored with Git LFS. The manifest has each card's type and its true outer corners
// (the lamination for ID cards) in upright order
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "photos");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));

// Allowed corner error, as a fraction of the card's long side in the photo
const TOLERANCE = 0.025;

test("finds each card, identifies its type, crops it and turns it upright", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Git LFS pointer files instead of images mean the fixtures were never pulled
  const first = fs.readFileSync(path.join(DIR, manifest[0].file));
  expect(first.subarray(0, 7).toString(), "run `git lfs pull` to fetch the test photos").not.toBe("version");

  await page.setInputFiles("#file", manifest.map((m) => path.join(DIR, m.file)));
  await page.waitForFunction((n) => {
    const items = Object.values(window.__store.getState().items.entities);
    return items.length === n && items.every((i) => i.status !== "decoding" && !["loadingLib", "detecting"].includes(i.detection));
  }, manifest.length, { timeout: 150_000 });

  const items = await page.evaluate(() => {
    const s = window.__store.getState().items;
    return s.ids.map((id) => s.entities[id]);
  });

  for (const [i, m] of manifest.entries()) {
    await test.step(`${m.file}`, async () => {
      const item = items[i];
      expect.soft(item.name).toBe(m.file);
      expect.soft(item.guess?.kind, "card type").toBe(m.kind);
      expect.soft(item.corners, "card detected").not.toBeNull();
      if (!item.corners) return;

      const [tl, tr, , bl] = m.corners;
      const longSide = Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(bl[0] - tl[0], bl[1] - tl[1]));
      const errs = item.corners.map((p, k) => Math.hypot(p.x - m.corners[k][0], p.y - m.corners[k][1]) / longSide);
      // Comparing corner by corner also checks the orientation: a wrong turn moves every corner
      expect.soft(Math.max(...errs), `corner error ${errs.map((e) => (e * 100).toFixed(1) + "%").join(", ")}`)
        .toBeLessThan(TOLERANCE);
    });
  }
  expect(errors, "no console errors or Redux Toolkit warnings").toEqual([]);
});

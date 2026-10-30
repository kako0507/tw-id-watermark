import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { MARKER, findMarker, renderFakeCardPhoto } from "./fakeCards.js";

const CARDS = [
  { type: "nhi", kind: "健保卡" },
  { type: "license", kind: "駕照" },
  { type: "idFront", kind: "身分證" },
];
const TURNS = [0, 1, 2, 3];

// Wait until every image is decoded and detection has finished
async function waitForItems(page, count) {
  await page.waitForFunction((n) => {
    const items = Object.values(window.__store.getState().items.entities);
    return items.length === n && items.every((i) => i.status !== "decoding" && !["loadingLib", "detecting"].includes(i.detection));
  }, count, { timeout: 150_000 });
}

async function fakePhotoFiles(page, cases) {
  const files = [];
  for (const { type, turns } of cases) {
    const dataUrl = await page.evaluate(renderFakeCardPhoto, { type, turns, marker: MARKER });
    files.push({
      name: `${type}_${turns * 90}.jpg`,
      mimeType: "image/jpeg",
      buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
    });
  }
  return files;
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.errors = errors;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // No watermark text, so it cannot cover the orientation marker
  await page.locator("#text").fill("");
});

test.afterEach(async ({ page }) => {
  expect(page.errors, "no console errors or Redux Toolkit warnings").toEqual([]);
});

test("turns cards photographed in any orientation upright", async ({ page }) => {
  const cases = CARDS.flatMap((card) => TURNS.map((turns) => ({ ...card, turns })));
  await page.setInputFiles("#file", await fakePhotoFiles(page, cases));
  await waitForItems(page, cases.length);

  const items = await page.evaluate(() => {
    const s = window.__store.getState().items;
    return s.ids.map((id) => s.entities[id]);
  });
  const notes = await page.locator(".card .note").allTextContents();

  for (const [index, c] of cases.entries()) {
    await test.step(`${c.type} rotated ${c.turns * 90}°`, async () => {
      expect.soft(items[index].corners, "card detected").not.toBeNull();
      expect.soft(notes[index]).toContain(`判斷為${c.kind}`);

      const size = await page.locator(".card canvas").nth(index).evaluate((el) => [el.width, el.height]);
      expect.soft(size[0], "output is landscape").toBeGreaterThan(size[1]);

      const marker = await page.evaluate(findMarker, { index, marker: MARKER });
      expect.soft(marker, "marker visible").not.toBeNull();
      expect.soft(marker?.x, "marker on the left (card not mirrored or rotated)").toBeLessThan(0.25);
      expect.soft(marker?.y, "marker at the top (card upright)").toBeLessThan(0.3);
    });
  }
});

test("keeps the photographed orientation when auto-rotate is off", async ({ page }) => {
  await page.getByLabel("自動轉正證件方向").uncheck();
  await page.setInputFiles("#file", await fakePhotoFiles(page, [{ type: "nhi", turns: 2 }]));
  await waitForItems(page, 1);

  const marker = await page.evaluate(findMarker, { index: 0, marker: MARKER });
  // Upside down: the top-left marker ends up bottom-right
  expect(marker.x).toBeGreaterThan(0.75);
  expect(marker.y).toBeGreaterThan(0.7);
});

// Optional: real card photos kept OUTSIDE the repo (they contain personal data).
//   E2E_PHOTOS_DIR=C:\path\to\photos npm run test:e2e
// Every photo must be detected and end up landscape; review the screenshot for the rest.
const photosDir = process.env.E2E_PHOTOS_DIR;
test("real photos from E2E_PHOTOS_DIR come out detected and landscape", async ({ page }, testInfo) => {
  test.skip(!photosDir, "set E2E_PHOTOS_DIR to run against your own photos");
  const files = fs.readdirSync(photosDir)
    .filter((f) => /\.(jpe?g|png|webp|heic|heif)$/i.test(f))
    .map((f) => path.join(photosDir, f));
  expect(files.length, "photos found").toBeGreaterThan(0);

  await page.setInputFiles("#file", files);
  await waitForItems(page, files.length);
  const results = await page.evaluate(() => {
    const s = window.__store.getState().items;
    return s.ids.map((id) => s.entities[id]);
  });
  const sizes = await page.locator(".card canvas").evaluateAll((els) => els.map((el) => [el.width, el.height]));

  for (const [i, item] of results.entries()) {
    expect.soft(item.corners, `${item.name}: card detected`).not.toBeNull();
    expect.soft(sizes[i][0], `${item.name}: landscape`).toBeGreaterThan(sizes[i][1]);
  }
  // Saved only under test-results/ (git-ignored), never committed
  await testInfo.attach("results", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

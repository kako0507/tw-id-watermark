import { describe, expect, it } from "vitest";
import { editorApplied, editorNoCrop } from "./editorSlice.js";
import reducer, {
  detectionFailed, detectionStarted, detectionSucceeded, itemAdded, itemDecoded, itemFailed, itemNote,
  itemRemoved, itemsCleared,
} from "./itemsSlice.js";
import { DEFAULT_SETTINGS, settingChanged, settingsReset } from "./settingsSlice.js";

const corners = [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 6 }, { x: 1, y: 6 }];
const licenseGuess = { aspect: "license", kind: "駕照", ratio: 1.42, features: { yellow: 0.35, chip: 0 } };
const run = (state, ...actions) => actions.reduce(reducer, state);
const added = (id = "a") => run(undefined, itemAdded({ id, name: `${id}.jpg`, aspect: "id1" }));
const ready = (id = "a") => run(added(id), itemDecoded({ id, width: 10, height: 8 }));

describe("items reducer", () => {
  it("adds an item in the decoding state", () => {
    const it = added().entities.a;
    expect(it).toMatchObject({ name: "a.jpg", status: "decoding", detection: "idle", corners: null, manual: false });
  });

  it("marks decoded and failed items", () => {
    expect(ready().entities.a).toMatchObject({ status: "ready", width: 10, height: 8 });
    expect(reducer(added(), itemFailed({ id: "a", error: "bad" })).entities.a).toMatchObject({ status: "error", error: "bad" });
  });

  it("ignores actions for unknown ids", () => {
    const s = ready();
    expect(reducer(s, itemDecoded({ id: "zzz", width: 1, height: 1 }))).toBe(s);
  });

  it("tracks detection progress", () => {
    expect(reducer(ready(), detectionStarted({ id: "a", needsLib: true })).entities.a.detection).toBe("loadingLib");
    expect(reducer(ready(), detectionStarted({ id: "a", needsLib: false })).entities.a.detection).toBe("detecting");
    const failed = reducer(ready(), detectionFailed({ id: "a", error: "offline" })).entities.a;
    expect(failed).toMatchObject({ detection: "failed", detectionError: "offline" });
  });

  it("applies a detection result when asked", () => {
    const it = reducer(ready(), detectionSucceeded({ id: "a", corners, guess: licenseGuess, cardType: "guess", apply: true })).entities.a;
    expect(it).toMatchObject({ detection: "done", detected: corners, corners, aspect: "license" });
  });

  it("only records the result when apply is false (editor re-detection)", () => {
    const it = reducer(ready(), detectionSucceeded({ id: "a", corners, guess: licenseGuess, cardType: "guess", apply: false })).entities.a;
    expect(it.detected).toEqual(corners);
    expect(it.corners).toBeNull();
  });

  it("never overrides a manual crop with a detection result", () => {
    const manual = reducer(ready(), editorApplied({ itemId: "a", corners, aspect: "points" }));
    const other = corners.map((p) => ({ x: p.x + 1, y: p.y }));
    const it = reducer(manual, detectionSucceeded({ id: "a", corners: other, guess: licenseGuess, cardType: "guess", apply: true })).entities.a;
    expect(it.corners).toEqual(corners);
    expect(it.aspect).toBe("points");
  });

  it("writes editor results back and marks them manual", () => {
    const applied = reducer(ready(), editorApplied({ itemId: "a", corners, aspect: "license" })).entities.a;
    expect(applied).toMatchObject({ corners, aspect: "license", manual: true });
    const noCrop = reducer(ready(), editorNoCrop({ itemId: "a" })).entities.a;
    expect(noCrop).toMatchObject({ corners: null, manual: true });
  });

  it("re-applies the card type to automatic items only", () => {
    let s = run(ready("a"), itemAdded({ id: "b", name: "b.jpg", aspect: "id1" }));
    s = reducer(s, detectionSucceeded({ id: "a", corners, guess: licenseGuess, cardType: "guess", apply: true }));
    s = reducer(s, editorApplied({ itemId: "b", corners, aspect: "id1" }));

    s = reducer(s, settingChanged({ key: "cardType", value: "points" }));
    expect(s.entities.a.aspect).toBe("points");
    expect(s.entities.b.aspect).toBe("id1");

    s = reducer(s, settingsReset());
    expect(s.entities.a.aspect).toBe("license");  // back to "guess" -> the detection guess
  });

  it("ignores unrelated setting changes", () => {
    const s = ready();
    expect(reducer(s, settingChanged({ key: "opacity", value: 0.2 }))).toBe(s);
  });

  it("removes and clears items", () => {
    const s = run(ready("a"), itemAdded({ id: "b", name: "b.jpg", aspect: "id1" }));
    expect(reducer(s, itemRemoved("a")).ids).toEqual(["b"]);
    expect(reducer(s, itemsCleared()).ids).toEqual([]);
  });
});

describe("itemNote", () => {
  const settings = { ...DEFAULT_SETTINGS };
  const base = ready().entities.a;

  it("describes progress", () => {
    expect(itemNote(added().entities.a, settings)).toBe("讀取中…");
    expect(itemNote({ ...base, detection: "loadingLib" }, settings)).toContain("下載偵測元件");
    expect(itemNote({ ...base, detection: "detecting" }, settings)).toBe("偵測證件中…");
  });

  it("names the guessed card type in guess mode", () => {
    const it = { ...base, detection: "done", corners, aspect: "license", guess: licenseGuess };
    expect(itemNote(it, settings)).toContain("判斷為駕照");
    expect(itemNote(it, { ...settings, cardType: "license" })).toContain("（駕照）");
  });

  it("shows the custom size for points", () => {
    const it = { ...base, manual: true, corners, aspect: "points" };
    expect(itemNote(it, { ...settings, customWidth: 90, customHeight: 55 })).toBe("已手動校正（自訂 90 × 55 mm）");
    expect(itemNote(it, settings)).toBe("已手動校正（依四個點）");
  });

  it("explains missing or failed detection", () => {
    expect(itemNote({ ...base, detection: "done" }, settings)).toContain("沒偵測到證件");
    expect(itemNote({ ...base, detection: "failed", detectionError: "離線" }, settings)).toContain("離線");
    expect(itemNote({ ...base, manual: true }, settings)).toBe("未裁切");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the browser-only pieces (image decoding, OpenCV, pixel analysis) with fakes
vi.mock("../lib/decode.js", () => ({ decodeImage: vi.fn() }));
vi.mock("../lib/opencv.js", () => ({
  isOpenCVLoaded: vi.fn(() => true),
  loadOpenCV: vi.fn(async () => ({ cv: {} })),
  detectCard: vi.fn(),
}));
vi.mock("../lib/classify.js", () => ({ classifyCard: vi.fn() }));
vi.mock("../lib/orient.js", () => ({ detectOrientation: vi.fn() }));

const { decodeImage } = await import("../lib/decode.js");
const { detectCard, loadOpenCV } = await import("../lib/opencv.js");
const { classifyCard } = await import("../lib/classify.js");
const { detectOrientation } = await import("../lib/orient.js");
const { createAppStore } = await import("./index.js");
const { settingChanged } = await import("./settingsSlice.js");
const { cornerDragEnded, cornerDragStarted, cornerMoved } = await import("./editorSlice.js");
const { selectAllItems } = await import("./itemsSlice.js");
const { addFiles, applyEditor, clearAll, openEditor, redetectInEditor, removeItem } = await import("./thunks.js");

const corners = [{ x: 10, y: 10 }, { x: 90, y: 12 }, { x: 88, y: 60 }, { x: 12, y: 58 }];
const bitmap = (width = 100, height = 70) => ({ width, height, close: vi.fn() });
const file = (name) => ({ name, type: "image/jpeg" });
const items = (store) => selectAllItems(store.getState());

let store;
beforeEach(() => {
  vi.clearAllMocks();
  store = createAppStore();
  decodeImage.mockImplementation(async () => bitmap());
  detectCard.mockReturnValue({ corners, laminated: null });
  classifyCard.mockReturnValue({ aspect: "license", kind: "駕照", ratio: 1.42, features: {} });
  detectOrientation.mockReturnValue({ turns: 0, score: 0.5 });
});

describe("addFiles", () => {
  it("decodes, detects and auto-crops each file", async () => {
    await store.dispatch(addFiles([file("a.jpg"), file("b.jpg")]));
    const [a, b] = items(store);
    expect(items(store)).toHaveLength(2);
    expect(a).toMatchObject({ name: "a.jpg", status: "ready", width: 100, detection: "done", corners, aspect: "license" });
    expect(b.status).toBe("ready");
    expect(detectCard).toHaveBeenCalledTimes(2);
  });

  it("keeps only serializable data in the store", async () => {
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(store.getState());
  });

  it("crops a laminated ID card to its lamination edge", async () => {
    const laminated = corners.map((p) => ({ x: p.x - 3, y: p.y - 3 }));
    detectCard.mockReturnValue({ corners, laminated });
    classifyCard.mockReturnValue({ aspect: "id1", kind: "身分證", ratio: 1.66, features: {} });
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0].corners).toEqual(laminated);
  });

  it("ignores the lamination fit for other card types", async () => {
    detectCard.mockReturnValue({ corners, laminated: corners.map((p) => ({ x: p.x - 3, y: p.y - 3 })) });
    classifyCard.mockReturnValue({ aspect: "id1", kind: "健保卡／晶片卡", ratio: 1.6, features: {} });
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0].corners).toEqual(corners);
  });

  it("turns the card upright by rotating the corners", async () => {
    detectOrientation.mockReturnValue({ turns: 1, score: 0.7 });
    await store.dispatch(addFiles([file("a.jpg")]));
    const it = items(store)[0];
    expect(it.corners).toEqual([corners[1], corners[2], corners[3], corners[0]]);
    expect(it.detected).toEqual(it.corners);
  });

  it("does not rotate when auto-rotate is off", async () => {
    store.dispatch(settingChanged({ key: "autoRotate", value: false }));
    detectOrientation.mockReturnValue({ turns: 2, score: 0.7 });
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0].corners).toEqual(corners);
    expect(detectOrientation).not.toHaveBeenCalled();
  });

  it("does not rotate cards of unknown type", async () => {
    classifyCard.mockReturnValue({ aspect: "points", kind: null, ratio: 1.9, features: {} });
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(detectOrientation).not.toHaveBeenCalled();
    expect(items(store)[0].corners).toEqual(corners);
  });

  it("skips detection when auto-crop is off", async () => {
    store.dispatch(settingChanged({ key: "autoCrop", value: false }));
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0]).toMatchObject({ status: "ready", detection: "idle", corners: null });
    expect(detectCard).not.toHaveBeenCalled();
  });

  it("leaves the photo uncropped when no card is found", async () => {
    detectCard.mockReturnValue({ corners: null, laminated: null });
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0]).toMatchObject({ detection: "done", detected: null, corners: null });
    expect(classifyCard).not.toHaveBeenCalled();
  });

  it("reports decode errors and carries on with the next file", async () => {
    decodeImage.mockRejectedValueOnce(new Error("無法讀取")).mockImplementation(async () => bitmap());
    await store.dispatch(addFiles([file("bad.txt"), file("ok.jpg")]));
    const [bad, ok] = items(store);
    expect(bad).toMatchObject({ status: "error", error: "無法讀取" });
    expect(ok.status).toBe("ready");
  });

  it("reports a detector that fails to load", async () => {
    loadOpenCV.mockRejectedValueOnce(new Error("偵測元件載入失敗"));
    await store.dispatch(addFiles([file("a.jpg")]));
    expect(items(store)[0]).toMatchObject({ detection: "failed", detectionError: "偵測元件載入失敗", corners: null });
  });

  it("drops a file removed while it was decoding", async () => {
    const bmp = bitmap();
    let finish;
    decodeImage.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(bmp); }));
    const pending = store.dispatch(addFiles([file("a.jpg")]));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    store.dispatch(removeItem(items(store)[0].id));
    finish();
    await pending;
    expect(items(store)).toHaveLength(0);
    expect(bmp.close).toHaveBeenCalled();
  });
});

describe("editor flow", () => {
  it("opens on the current crop, applies edits and marks them manual", async () => {
    await store.dispatch(addFiles([file("a.jpg")]));
    const id = items(store)[0].id;
    store.dispatch(openEditor(id));
    expect(store.getState().editor).toMatchObject({ itemId: id, corners, aspect: "license" });

    store.dispatch(cornerDragStarted(0));
    store.dispatch(cornerMoved({ x: 20, y: 20 }));
    store.dispatch(cornerDragEnded());
    store.dispatch(applyEditor());

    expect(store.getState().editor.itemId).toBeNull();
    expect(items(store)[0]).toMatchObject({ manual: true, aspect: "license" });
    expect(items(store)[0].corners[0]).toEqual({ x: 20, y: 20 });
  });

  it("detects automatically when opened on a photo that was never scanned", async () => {
    store.dispatch(settingChanged({ key: "autoCrop", value: false }));
    await store.dispatch(addFiles([file("a.jpg")]));
    const id = items(store)[0].id;
    store.dispatch(openEditor(id));
    await vi.waitFor(() => expect(store.getState().editor.status).toBe("detected"));
    expect(store.getState().editor.corners).toEqual(corners);
    expect(items(store)[0].corners).toBeNull();  // not applied until the user presses 套用
  });

  it("tells the user when re-detection finds nothing", async () => {
    await store.dispatch(addFiles([file("a.jpg")]));
    store.dispatch(openEditor(items(store)[0].id));
    detectCard.mockReturnValue({ corners: null, laminated: null });
    await store.dispatch(redetectInEditor());
    expect(store.getState().editor.status).toBe("notFound");
  });
});

describe("clearAll", () => {
  it("removes every item and frees the bitmaps", async () => {
    const bmp = bitmap();
    decodeImage.mockImplementation(async () => bmp);
    await store.dispatch(addFiles([file("a.jpg")]));
    store.dispatch(clearAll());
    expect(items(store)).toHaveLength(0);
    expect(bmp.close).toHaveBeenCalled();
  });
});

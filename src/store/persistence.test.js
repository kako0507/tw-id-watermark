// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createAppStore } from "./index.js";
import { loadSettings, persistSettings } from "./persistence.js";
import { DEFAULT_SETTINGS, settingChanged, settingsReset } from "./settingsSlice.js";

const KEY = "tw-id-watermark-settings";

afterEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("settings reducer", () => {
  it("changes known keys only and resets to defaults", () => {
    const store = createAppStore();
    store.dispatch(settingChanged({ key: "text", value: "僅供測試使用" }));
    store.dispatch(settingChanged({ key: "notASetting", value: 1 }));
    expect(store.getState().settings.text).toBe("僅供測試使用");
    expect(store.getState().settings).not.toHaveProperty("notASetting");
    store.dispatch(settingsReset());
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("loadSettings", () => {
  it("falls back to defaults", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("restores saved values but ignores wrong types and unknown keys", () => {
    localStorage.setItem(KEY, JSON.stringify({ text: "已儲存", opacity: "0.3", bogus: 1, customWidth: 90 }));
    const s = loadSettings();
    expect(s.text).toBe("已儲存");
    expect(s.opacity).toBe(DEFAULT_SETTINGS.opacity);
    expect(s.customWidth).toBe(90);
    expect(s).not.toHaveProperty("bogus");
  });

  it("survives corrupted storage", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("lets URL parameters override saved values, with type conversion", () => {
    localStorage.setItem(KEY, JSON.stringify({ text: "已儲存" }));
    history.replaceState(null, "", "/?text=%E5%83%85%E4%BE%9B&opacity=0.8&autoCrop=0&cardType=license");
    const s = loadSettings();
    expect(s).toMatchObject({ text: "僅供", opacity: 0.8, autoCrop: false, cardType: "license" });
  });
});

describe("persistSettings", () => {
  it("saves settings after a change, outside the reducer", () => {
    const store = createAppStore(loadSettings());
    persistSettings(store);
    expect(localStorage.getItem(KEY)).toBeNull();
    store.dispatch(settingChanged({ key: "angle", value: 45 }));
    expect(JSON.parse(localStorage.getItem(KEY)).angle).toBe(45);
  });
});

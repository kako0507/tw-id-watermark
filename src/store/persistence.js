import { DEFAULT_SETTINGS } from "./settingsSlice.js";

const STORAGE_KEY = "tw-id-watermark-settings";

// Read before creating the store: saved settings from localStorage, overridden by URL
// parameters (e.g. ?text=...)
export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch {}
  const s = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) s[key] = saved[key];
  }
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!params.has(key)) continue;
    const v = params.get(key);
    if (typeof DEFAULT_SETTINGS[key] === "number") s[key] = Number(v);
    else if (typeof DEFAULT_SETTINGS[key] === "boolean") s[key] = v === "1" || v === "true";
    else s[key] = v;
  }
  return s;
}

// Saved via store.subscribe, never inside a reducer (reducers must be side-effect free)
export function persistSettings(store) {
  let last = store.getState().settings;
  store.subscribe(() => {
    const settings = store.getState().settings;
    if (settings === last) return;
    last = settings;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  });
}

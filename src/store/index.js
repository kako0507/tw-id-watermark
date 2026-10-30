import { configureStore } from "@reduxjs/toolkit";
import editor from "./editorSlice.js";
import items from "./itemsSlice.js";
import settings from "./settingsSlice.js";

// The whole app has exactly one store (single source of truth).
// In development configureStore checks for state mutation and non-serializable actions/state
export function createAppStore(preloadedSettings) {
  return configureStore({
    reducer: { settings, items, editor },
    preloadedState: preloadedSettings ? { settings: preloadedSettings } : undefined,
  });
}

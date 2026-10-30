import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";
import { aspectName, customSize, pickAspect } from "../lib/cards.js";
import { DEFAULT_SETTINGS, settingChanged, settingsReset } from "./settingsSlice.js";
import { editorApplied, editorNoCrop } from "./editorSlice.js";

// Each image entry is plain serializable data; pixels live in lib/imageCache.js
const itemsAdapter = createEntityAdapter();

// Images the user has not adjusted follow the "card type" setting
function reapplyCardType(state, cardType) {
  for (const it of Object.values(state.entities)) {
    if (!it.manual) it.aspect = pickAspect(cardType, it.guess);
  }
}

const itemsSlice = createSlice({
  name: "items",
  initialState: itemsAdapter.getInitialState(),
  reducers: {
    itemAdded(state, { payload: { id, name, aspect } }) {
      itemsAdapter.addOne(state, {
        id,
        name,
        status: "decoding",   // decoding | ready | error
        error: null,
        width: 0,
        height: 0,
        detection: "idle",    // idle | loadingLib | detecting | done | failed
        detectionError: null,
        detected: null,       // Detected corners (null = none found)
        guess: null,          // Card type classification
        corners: null,        // Corners actually used for cropping (null = no crop)
        aspect,
        manual: false,        // Adjusted by the user; never changed automatically afterwards
      });
    },
    itemDecoded(state, { payload: { id, width, height } }) {
      const it = state.entities[id];
      if (!it) return;
      it.status = "ready";
      it.width = width;
      it.height = height;
    },
    itemFailed(state, { payload: { id, error } }) {
      const it = state.entities[id];
      if (!it) return;
      it.status = "error";
      it.error = error;
    },
    detectionStarted(state, { payload: { id, needsLib } }) {
      const it = state.entities[id];
      if (!it) return;
      it.detection = needsLib ? "loadingLib" : "detecting";
      it.detectionError = null;
    },
    // apply = use the result right away (when adding images); editor re-detection only records it
    detectionSucceeded(state, { payload: { id, corners, guess, cardType, apply } }) {
      const it = state.entities[id];
      if (!it) return;
      it.detection = "done";
      it.detected = corners;
      it.guess = guess;
      if (apply && corners && !it.manual) {
        it.corners = corners;
        it.aspect = pickAspect(cardType, guess);
      }
    },
    detectionFailed(state, { payload: { id, error } }) {
      const it = state.entities[id];
      if (!it) return;
      it.detection = "failed";
      it.detectionError = error;
    },
    itemRemoved: itemsAdapter.removeOne,
    itemsCleared: itemsAdapter.removeAll,
  },
  extraReducers: (builder) => {
    builder
      .addCase(settingChanged, (state, { payload: { key, value } }) => {
        if (key === "cardType") reapplyCardType(state, value);
      })
      .addCase(settingsReset, (state) => reapplyCardType(state, DEFAULT_SETTINGS.cardType))
      .addCase(editorApplied, (state, { payload: { itemId, corners, aspect } }) => {
        const it = state.entities[itemId];
        if (!it) return;
        it.corners = corners;
        it.aspect = aspect;
        it.manual = true;
      })
      .addCase(editorNoCrop, (state, { payload: { itemId } }) => {
        const it = state.entities[itemId];
        if (!it) return;
        it.corners = null;
        it.manual = true;
      });
  },
});

export const {
  itemAdded, itemDecoded, itemFailed, detectionStarted, detectionSucceeded, detectionFailed,
  itemRemoved, itemsCleared,
} = itemsSlice.actions;

export const {
  selectAll: selectAllItems,
  selectById: selectItemById,
  selectIds: selectItemIds,
  selectTotal: selectItemTotal,
} = itemsAdapter.getSelectors((state) => state.items);

// Status line under each card, derived purely from state
export function itemNote(it, settings) {
  const custom = customSize(settings);
  if (it.status === "decoding") return "讀取中…";
  if (it.status === "error") return "";
  if (it.detection === "loadingLib") return "下載偵測元件中（約 10MB，只有第一次）…";
  if (it.detection === "detecting") return "偵測證件中…";
  if (it.manual) return it.corners ? `已手動校正（${aspectName(it.aspect, custom)}）` : "未裁切";
  if (it.corners) {
    const name = settings.cardType === "guess" && it.guess && it.guess.kind ? `判斷為${it.guess.kind}` : aspectName(it.aspect, custom);
    return `已自動校正（${name}），不準可按「調整裁切」`;
  }
  if (it.detection === "failed") return `${it.detectionError}，可按「調整裁切」手動設定`;
  if (it.detection === "done") return "沒偵測到證件，可按「調整裁切」手動設定";
  return "";
}

export default itemsSlice.reducer;

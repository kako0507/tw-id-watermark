// All side effects (file decoding, OpenCV detection, downloads) live in thunks so reducers stay pure.
// Plain thunks instead of createAsyncThunk: File objects are not serializable and must
// not end up in action meta
import { nanoid } from "@reduxjs/toolkit";
import { CARD_SIZES, pickAspect } from "../lib/cards.js";
import { classifyCard } from "../lib/classify.js";
import { decodeImage } from "../lib/decode.js";
import { fullCorners, rotateCorners } from "../lib/geometry.js";
import { clearImages, getOriginal, getSource, removeImage, setOriginal } from "../lib/imageCache.js";
import { detectCard, isOpenCVLoaded, loadOpenCV } from "../lib/opencv.js";
import { detectOrientation } from "../lib/orient.js";
import { PDF_NAME, buildPdf, printSizeMm } from "../lib/print.js";
import { ensureFont, outputName, renderToBlob, renderWatermark, triggerDownload } from "../lib/watermark.js";
import {
  detectionFailed, detectionStarted, detectionSucceeded, itemAdded, itemDecoded, itemFailed,
  itemRemoved, itemsCleared, selectAllItems, selectItemById,
} from "./itemsSlice.js";
import { editorApplied, editorDetected, editorOpened, editorStatusChanged } from "./editorSlice.js";

export const addFiles = (files) => async (dispatch, getState) => {
  for (const file of files) {
    const id = nanoid();
    dispatch(itemAdded({ id, name: file.name, aspect: pickAspect(getState().settings.cardType, null) }));
    let bitmap;
    try {
      bitmap = await decodeImage(file);
    } catch (err) {
      dispatch(itemFailed({ id, error: err.message }));
      continue;
    }
    if (!selectItemById(getState(), id)) {  // Removed while decoding
      bitmap.close();
      continue;
    }
    setOriginal(id, bitmap);
    dispatch(itemDecoded({ id, width: bitmap.width, height: bitmap.height }));
    if (getState().settings.autoCrop) await dispatch(detectItem(id, { apply: true }));
  }
};

// Detect the card's corners and classify it; resolves to the corners or null
export const detectItem = (id, { apply }) => async (dispatch, getState) => {
  dispatch(detectionStarted({ id, needsLib: !isOpenCVLoaded() }));
  try {
    const { cv } = await loadOpenCV();
    const bitmap = getOriginal(id);
    if (!bitmap) return null;
    const found = detectCard(cv, bitmap);
    let corners = found.corners;
    let guess = corners ? classifyCard(bitmap, corners) : null;
    // The photo fits a laminated ID card: crop the whole card, lamination included, as long
    // as it still looks like an ID card (no chip, not a yellow license)
    if (found.laminated) {
      const idGuess = classifyCard(bitmap, found.laminated);
      if (idGuess.kind === "身分證") { corners = found.laminated; guess = idGuess; }
    }
    const { settings } = getState();
    // Only known card types have a fixed landscape layout to orient by
    if (corners && settings.autoRotate && CARD_SIZES[pickAspect(settings.cardType, guess)]) {
      corners = rotateCorners(corners, detectOrientation(bitmap, corners).turns);
    }
    dispatch(detectionSucceeded({ id, corners, guess, cardType: settings.cardType, apply }));
    return corners;
  } catch (err) {
    dispatch(detectionFailed({ id, error: err.message }));
    return null;
  }
};

export const openEditor = (id) => (dispatch, getState) => {
  const item = selectItemById(getState(), id);
  if (!item || item.status !== "ready") return;
  const corners = item.corners || item.detected || fullCorners(item.width, item.height, 0.08);
  dispatch(editorOpened({ itemId: id, corners, aspect: item.aspect }));
  if (!item.corners && item.detection === "idle") dispatch(redetectInEditor());
};

export const redetectInEditor = () => async (dispatch, getState) => {
  const id = getState().editor.itemId;
  if (!id) return;
  dispatch(editorStatusChanged({ status: isOpenCVLoaded() ? "detecting" : "loadingLib" }));
  const corners = await dispatch(detectItem(id, { apply: false }));
  const state = getState();
  if (state.editor.itemId !== id) return;  // Editor closed or switched to another image
  const item = selectItemById(state, id);
  if (item.detection === "failed") {
    dispatch(editorStatusChanged({ status: "error", error: item.detectionError }));
  } else if (corners) {
    dispatch(editorDetected({ corners, aspect: pickAspect(state.settings.cardType, item.guess) }));
  } else {
    dispatch(editorStatusChanged({ status: "notFound" }));
  }
};

export const applyEditor = () => (dispatch, getState) => {
  const { itemId, corners, aspect } = getState().editor;
  dispatch(editorApplied({ itemId, corners, aspect }));
};

export const removeItem = (id) => (dispatch) => {
  removeImage(id);
  dispatch(itemRemoved(id));
};

export const clearAll = () => (dispatch) => {
  clearImages();
  dispatch(itemsCleared());
};

async function downloadOne(item, settings) {
  const source = getSource(item, settings);
  if (!source) return;
  const name = outputName(item.name);
  triggerDownload(await renderToBlob(source, settings, name), name);
}

export const downloadItem = (id) => async (_, getState) => {
  const state = getState();
  const item = selectItemById(state, id);
  if (item && item.status === "ready") await downloadOne(item, state.settings);
};

export const downloadAll = () => async (_, getState) => {
  const state = getState();
  for (const item of selectAllItems(state)) {
    if (item.status !== "ready") continue;
    await downloadOne(item, state.settings);
    await new Promise((r) => setTimeout(r, 300));  // Small gap so the browser does not block consecutive downloads
  }
};

// All cards, watermarked, on A4 pages at their real size (print at 100% / "actual size")
export const exportPdf = () => async (_, getState) => {
  const { settings } = getState();
  await ensureFont(settings.text);
  const cards = [];
  for (const item of selectAllItems(getState())) {
    if (item.status !== "ready") continue;
    const source = getSource(item, settings);
    if (!source) continue;
    const canvas = document.createElement("canvas");
    renderWatermark(canvas, source, settings);
    const [w, h] = printSizeMm(item, settings, canvas.width, canvas.height);
    cards.push({ canvas, w, h });
  }
  if (cards.length) triggerDownload(await buildPdf(cards), PDF_NAME);
};

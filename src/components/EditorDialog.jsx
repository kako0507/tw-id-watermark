import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CARD_SIZES, POINTS_LABEL } from "../lib/cards.js";
import { dist, fullCorners } from "../lib/geometry.js";
import { getOriginal } from "../lib/imageCache.js";
import {
  cornerDragEnded, cornerDragStarted, cornerMoved, editorAspectChanged, editorClosed,
  editorCornersReset, editorNoCrop, editorRedone, editorRotated, editorUndone,
} from "../store/editorSlice.js";
import { selectItemById } from "../store/itemsSlice.js";
import { applyEditor, redetectInEditor } from "../store/thunks.js";
import CustomSizeInputs from "./CustomSizeInputs.jsx";

const STATUS_TEXT = {
  idle: "",
  loadingLib: "下載偵測元件中（約 10MB，只有第一次）…",
  detecting: "偵測中…",
  detected: "已偵測到證件，可再微調",
  notFound: "沒有偵測到證件，請手動拖曳四個角",
  rotated: "輸出方向已旋轉 90°",
};

// view = { disp: CSS px per source pixel, dpr, image: pre-scaled background }
function drawEditor(canvas, view, original, corners, drag) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const k = view.disp * view.dpr;
  const pts = corners.map((p) => ({ x: p.x * k, y: p.y * k }));
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const path = () => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(view.image, 0, 0);

  // Dim everything outside the quad
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill("evenodd");
  ctx.restore();

  path();
  ctx.lineWidth = 2 * view.dpr;
  ctx.strokeStyle = accent;
  ctx.stroke();

  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, (i === drag ? 12 : 9) * view.dpr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.lineWidth = 3 * view.dpr;
    ctx.strokeStyle = accent;
    ctx.stroke();
  });

  // Magnifier while dragging, shown in the top corner away from the finger
  if (drag >= 0) {
    const p = corners[drag];
    const R = 64 * view.dpr, zoom = 3;
    const lx = pts[drag].x < W / 2 ? W - R - 12 * view.dpr : R + 12 * view.dpr;
    const ly = R + 12 * view.dpr;
    const span = (2 * R) / (k * zoom);
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
    ctx.drawImage(original, p.x - span / 2, p.y - span / 2, span, span, lx - R, ly - R, 2 * R, 2 * R);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 * view.dpr;
    ctx.beginPath();
    ctx.moveTo(lx - R, ly); ctx.lineTo(lx + R, ly);
    ctx.moveTo(lx, ly - R); ctx.lineTo(lx, ly + R);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.lineWidth = 3 * view.dpr;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
}

export default function EditorDialog() {
  const editor = useSelector((state) => state.editor);
  const item = useSelector((state) => (editor.itemId ? selectItemById(state, editor.itemId) : null));
  const dispatch = useDispatch();
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(null);  // Drawing scale derived from DOM size, not app state
  const [layoutVersion, setLayoutVersion] = useState(0);
  const open = Boolean(item);

  // Layout effect (declared before the sizing one) so the dialog is visible and measurable
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setLayoutVersion((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.tagName === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) dispatch(editorUndone());
      else if (key === "y" || (key === "z" && e.shiftKey)) dispatch(editorRedone());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  // Size the canvas to the window and pre-scale the source as the background
  useLayoutEffect(() => {
    if (!open) return;
    const original = getOriginal(item.id);
    const canvas = canvasRef.current;
    const maxW = stageRef.current.clientWidth;
    const maxH = Math.max(240, window.innerHeight - 220);
    if (!original || !maxW) return;
    const disp = Math.min(maxW / original.width, maxH / original.height);
    const dpr = window.devicePixelRatio || 1;
    const cssW = original.width * disp, cssH = original.height * disp;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const image = document.createElement("canvas");
    image.width = canvas.width;
    image.height = canvas.height;
    image.getContext("2d").drawImage(original, 0, 0, image.width, image.height);
    viewRef.current = { disp, dpr, image };
  }, [open, item?.id, layoutVersion]);

  useEffect(() => {
    if (!open || !viewRef.current) return;
    drawEditor(canvasRef.current, viewRef.current, getOriginal(item.id), editor.corners, editor.drag);
  }, [open, item?.id, editor.corners, editor.drag, layoutVersion]);

  const toImage = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const { disp } = viewRef.current;
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / disp, 0), item.width),
      y: Math.min(Math.max((e.clientY - rect.top) / disp, 0), item.height),
    };
  }, [item]);

  const onPointerDown = (e) => {
    const p = toImage(e);
    let best = -1, bestD = 32 / viewRef.current.disp;  // Anything within 32 screen px counts as a hit
    editor.corners.forEach((c, i) => { const d = dist(c, p); if (d < bestD) { best = i; bestD = d; } });
    if (best < 0) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    dispatch(cornerDragStarted(best));
  };
  const onPointerMove = (e) => {
    if (editor.drag >= 0) dispatch(cornerMoved(toImage(e)));
  };
  const onPointerUp = () => {
    if (editor.drag >= 0) dispatch(cornerDragEnded());
  };

  const status = editor.status === "error" ? editor.error : STATUS_TEXT[editor.status];

  return (
    <dialog ref={dialogRef} className="editor" onCancel={(e) => { e.preventDefault(); dispatch(editorClosed()); }}>
      <div className="editor-head">
        <strong>調整證件四個角</strong>
        <span>拖曳圓點對準證件的四個角，拖曳時會出現放大鏡</span>
      </div>
      <div className="editor-stage" ref={stageRef}>
        <canvas ref={canvasRef} id="editCanvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
      </div>
      {open && (
        <div className="editor-bar">
          <button type="button" disabled={!editor.past.length} title="上一步（Ctrl+Z）"
            onClick={() => dispatch(editorUndone())}>↶ 上一步</button>
          <button type="button" disabled={!editor.future.length} title="下一步（Ctrl+Y）"
            onClick={() => dispatch(editorRedone())}>↷ 下一步</button>
          <button type="button" onClick={() => dispatch(redetectInEditor())}>自動偵測</button>
          <button type="button" onClick={() => dispatch(editorCornersReset(fullCorners(item.width, item.height)))}>整張圖</button>
          <button type="button" onClick={() => dispatch(editorRotated())}>旋轉 90°</button>
          <select aria-label="證件類型" value={editor.aspect} onChange={(e) => dispatch(editorAspectChanged(e.target.value))}>
            {Object.entries(CARD_SIZES).map(([key, card]) => <option key={key} value={key}>{card.label}</option>)}
            <option value="points">{POINTS_LABEL}</option>
          </select>
          {editor.aspect === "points" && <CustomSizeInputs compact />}
          <span className="status">{status}</span>
          <span className="spacer" />
          <button type="button" onClick={() => dispatch(editorNoCrop({ itemId: item.id }))}>不裁切</button>
          <button type="button" onClick={() => dispatch(editorClosed())}>取消</button>
          <button type="button" className="primary" onClick={() => dispatch(applyEditor())}>套用</button>
        </div>
      )}
    </dialog>
  );
}

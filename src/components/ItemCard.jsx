import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getSource } from "../lib/imageCache.js";
import { ensureFont, renderWatermark } from "../lib/watermark.js";
import { itemNote, selectItemById } from "../store/itemsSlice.js";
import { downloadItem, openEditor, removeItem } from "../store/thunks.js";

export default function ItemCard({ id }) {
  const item = useSelector((state) => selectItemById(state, id));
  const settings = useSelector((state) => state.settings);
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const ready = item.status === "ready";

  // The canvas is a projection of state: redraw when the item or settings change
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    ensureFont(settings.text).then(() => {
      const source = getSource(item, settings);
      if (alive && source && canvasRef.current) renderWatermark(canvasRef.current, source, settings);
    });
    return () => { alive = false; };
  }, [ready, item, settings]);

  return (
    <div className="card">
      {item.status === "error" && <div className="error">{item.error}</div>}
      {ready && <canvas ref={canvasRef} />}
      <div className="meta">
        <span className="name" title={item.name}>{item.name}</span>
        <span className="note">{itemNote(item, settings)}</span>
        {ready && <button type="button" onClick={() => dispatch(openEditor(id))}>調整裁切</button>}
        <span className="spacer" />
        <button type="button" onClick={() => dispatch(removeItem(id))}>移除</button>
        {ready && <button type="button" className="primary" onClick={() => dispatch(downloadItem(id))}>下載</button>}
      </div>
    </div>
  );
}

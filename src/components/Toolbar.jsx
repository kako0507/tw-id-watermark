import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectItemTotal } from "../store/itemsSlice.js";
import { clearAll, downloadAll, exportPdf } from "../store/thunks.js";

export default function Toolbar() {
  const count = useSelector(selectItemTotal);
  const dispatch = useDispatch();
  const [exporting, setExporting] = useState(false);  // Button feedback only, not app state

  const onExport = async () => {
    setExporting(true);
    try {
      await dispatch(exportPdf());
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <span className="count">{count ? `共 ${count} 張圖片` : "尚未加入圖片"}</span>
        <div className="actions">
          <button type="button" disabled={!count} onClick={() => dispatch(clearAll())}>清除全部</button>
          <button type="button" disabled={!count || exporting} onClick={onExport}>
            {exporting ? "匯出中…" : "匯出 A4 PDF"}
          </button>
          <button type="button" className="primary" disabled={!count} onClick={() => dispatch(downloadAll())}>全部下載</button>
        </div>
      </div>
      {count > 0 && (
        <p className="print-hint">A4 PDF 裡的證件是實際大小，列印時請選「實際大小」或縮放 100%，不要選「符合頁面大小」。</p>
      )}
    </>
  );
}

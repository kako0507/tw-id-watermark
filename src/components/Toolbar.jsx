import { useDispatch, useSelector } from "react-redux";
import { selectItemTotal } from "../store/itemsSlice.js";
import { clearAll, downloadAll } from "../store/thunks.js";

export default function Toolbar() {
  const count = useSelector(selectItemTotal);
  const dispatch = useDispatch();

  return (
    <div className="toolbar">
      <span className="count">{count ? `共 ${count} 張圖片` : "尚未加入圖片"}</span>
      <div className="actions">
        <button type="button" disabled={!count} onClick={() => dispatch(clearAll())}>清除全部</button>
        <button type="button" className="primary" disabled={!count} onClick={() => dispatch(downloadAll())}>全部下載</button>
      </div>
    </div>
  );
}

import { useDispatch, useSelector } from "react-redux";
import { settingChanged } from "../store/settingsSlice.js";

// Real card size (mm) for the "points" option. Blank (0) = keep the ratio measured
// from the four corners. Shared by the settings panel and the editor
export default function CustomSizeInputs({ compact = false }) {
  const width = useSelector((state) => state.settings.customWidth);
  const height = useSelector((state) => state.settings.customHeight);
  const dispatch = useDispatch();
  const set = (key) => (e) => dispatch(settingChanged({ key, value: Math.max(0, Number(e.target.value) || 0) }));

  return (
    <div className={compact ? "custom-size compact" : "custom-size"}>
      {!compact && <span className="custom-size-label">證件實際尺寸（選填）</span>}
      <div className="custom-size-row">
        <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="寬" aria-label="證件寬度（mm）"
          value={width || ""} onChange={set("customWidth")} />
        <span>×</span>
        <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="高" aria-label="證件高度（mm）"
          value={height || ""} onChange={set("customHeight")} />
        <span>mm</span>
      </div>
      {!compact && <p className="hint">留空就照拍到的四個角計算比例</p>}
    </div>
  );
}

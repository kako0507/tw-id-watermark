import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CARD_SIZES, POINTS_LABEL } from "../lib/cards.js";
import { settingChanged, settingsReset } from "../store/settingsSlice.js";
import CustomSizeInputs from "./CustomSizeInputs.jsx";

const SWATCHES = [
  ["#ff0000", "紅色"],
  ["#808080", "灰色"],
  ["#1f4fd8", "藍色"],
  ["#000000", "黑色"],
];

// The value while dragging is transient UI state; with debounceMs > 0 the action is
// dispatched only once the slider settles (re-cropping is expensive)
function Range({ id, label, value, min, max, step, format, onChange, debounceMs = 0 }) {
  const [local, setLocal] = useState(value);
  const timer = useRef(0);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handle = (e) => {
    const v = Number(e.target.value);
    setLocal(v);
    if (!debounceMs) return onChange(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounceMs);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label} <output>{format(local)}</output></label>
      <input type="range" id={id} min={min} max={max} step={step} value={local} onChange={handle} />
    </div>
  );
}

export default function SettingsPanel() {
  const s = useSelector((state) => state.settings);
  const dispatch = useDispatch();
  const set = (key) => (value) => dispatch(settingChanged({ key, value }));

  return (
    <aside className="panel settings" aria-label="設定">
      <div className="field check">
        <label>
          <input type="checkbox" checked={s.autoCrop} onChange={(e) => set("autoCrop")(e.target.checked)} />
          加入圖片時自動偵測證件，並校正成長方形
        </label>
        <label>
          <input type="checkbox" checked={s.autoRotate} onChange={(e) => set("autoRotate")(e.target.checked)} />
          自動轉正證件方向（橫放、文字朝上）
        </label>
      </div>
      <div className="field">
        <label htmlFor="cardType">證件類型（校正後的比例）</label>
        <select id="cardType" value={s.cardType} onChange={(e) => set("cardType")(e.target.value)}>
          <option value="guess">自動判斷</option>
          {Object.entries(CARD_SIZES).map(([key, card]) => <option key={key} value={key}>{card.label}</option>)}
          <option value="points">{POINTS_LABEL}</option>
        </select>
        {s.cardType === "points" && <CustomSizeInputs />}
      </div>
      <Range id="cropMargin" label="裁切保留邊緣" value={s.cropMargin} min={0} max={10} step={0.5}
        format={(v) => `${v} mm`} onChange={set("cropMargin")} debounceMs={200} />
      <hr />
      <div className="field">
        <label htmlFor="text">浮水印文字</label>
        <input type="text" id="text" value={s.text} onChange={(e) => set("text")(e.target.value)} />
      </div>
      <Range id="opacity" label="不透明度" value={s.opacity} min={0.1} max={1} step={0.05}
        format={(v) => `${Math.round(v * 100)}%`} onChange={set("opacity")} />
      <div className="field">
        <label htmlFor="color">顏色</label>
        <div className="color-row">
          <input type="color" id="color" value={s.color} onChange={(e) => set("color")(e.target.value)} />
          {SWATCHES.map(([color, name]) => (
            <button key={color} type="button" className="swatch" style={{ background: color }}
              aria-label={name} onClick={() => set("color")(color)} />
          ))}
        </div>
      </div>
      <Range id="angle" label="旋轉角度" value={s.angle} min={-90} max={90} step={5}
        format={(v) => `${v}°`} onChange={set("angle")} />
      <Range id="size" label="字體大小（短邊的 %）" value={s.size} min={3} max={20} step={0.5}
        format={(v) => `${v}%`} onChange={set("size")} />
      <Range id="spacing" label="平鋪間距" value={s.spacing} min={0.5} max={2.5} step={0.05}
        format={(v) => `${v.toFixed(2)}×`} onChange={set("spacing")} />
      <button type="button" onClick={() => dispatch(settingsReset())}>恢復預設值</button>
    </aside>
  );
}

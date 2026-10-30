import { useState } from "react";
import { useDispatch } from "react-redux";
import { addFiles } from "../store/thunks.js";

export default function DropZone() {
  const dispatch = useDispatch();
  const [over, setOver] = useState(false);  // Highlight while dragging over; purely visual, not app state

  const enter = (e) => { e.preventDefault(); setOver(true); };
  const leave = (e) => { e.preventDefault(); setOver(false); };

  return (
    <label className={over ? "drop over" : "drop"} onDragEnter={enter} onDragOver={enter} onDragLeave={leave}
      onDrop={(e) => { leave(e); dispatch(addFiles([...e.dataTransfer.files])); }}>
      <input type="file" id="file" multiple accept="image/*,.heic,.heif"
        onChange={(e) => { dispatch(addFiles([...e.target.files])); e.target.value = ""; }} />
      <strong>點這裡選擇圖片，或把圖片拖進來</strong>
      <span>可一次選多張</span>
    </label>
  );
}

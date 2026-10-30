import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { ensureFont, getSampleCard, renderWatermark } from "../lib/watermark.js";

export default function SamplePreview() {
  const settings = useSelector((state) => state.settings);
  const canvasRef = useRef(null);

  useEffect(() => {
    let alive = true;
    ensureFont(settings.text).then(() => {
      if (alive && canvasRef.current) renderWatermark(canvasRef.current, getSampleCard(), settings);
    });
    return () => { alive = false; };
  }, [settings]);

  return (
    <div>
      <div className="card"><canvas ref={canvasRef} aria-label="浮水印範例預覽" /></div>
      <p className="sample-note">↑ 範例預覽：調整左邊設定會即時更新，加入圖片後會套用同樣設定。</p>
    </div>
  );
}

const FONT_FAMILY = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export function ensureFont(text) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return document.fonts.load(`700 40px "Noto Sans TC"`, text || "字").catch(() => {});
}

// Draw source plus the tiled watermark onto the canvas
export function renderWatermark(canvas, source, o) {
  const width = source.width, height = source.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);
  if (!o.text.trim()) return;

  const size = Math.max(12, Math.round(Math.min(width, height) * o.size / 100));
  ctx.save();
  ctx.font = `700 ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.globalAlpha = o.opacity;
  ctx.fillStyle = o.color;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = Math.max(1, size / 15);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-o.angle * Math.PI / 180);  // Positive angle = counter-clockwise, rising to the right

  const draw = (x, y) => { ctx.strokeText(o.text, x, y); ctx.fillText(o.text, x, y); };
  // Tile the whole image so it is hard to crop out: staggered rows in rotated space,
  // spanning the diagonal so every corner is covered
  const textWidth = ctx.measureText(o.text).width;
  const stepX = (textWidth + size * 1.5) * o.spacing;
  const stepY = size * 4 * o.spacing;
  const reach = Math.hypot(width, height) / 2 + textWidth;
  const rows = Math.ceil(reach / stepY);
  for (let r = -rows; r <= rows; r++) {
    const offset = (r & 1) ? stepX / 2 : 0;
    const cols = Math.ceil(reach / stepX) + 1;
    for (let c = -cols; c <= cols; c++) draw(c * stepX + offset, r * stepY);
  }
  ctx.restore();
}

// Placeholder card shown before any image is added
let sampleCard = null;
export function getSampleCard() {
  if (!sampleCard) {
    const w = 1000, h = 630;
    sampleCard = document.createElement("canvas");
    sampleCard.width = w; sampleCard.height = h;
    const c = sampleCard.getContext("2d");
    c.fillStyle = "#e9ecef"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffffff"; c.beginPath(); c.roundRect(30, 30, w - 60, h - 60, 32); c.fill();
    c.fillStyle = "#cfd4da";
    c.fillRect(80, 90, 420, 44);
    for (let i = 0; i < 4; i++) c.fillRect(80, 200 + i * 80, 300 + (i % 2) * 120, 32);
    c.fillRect(680, 110, 230, 290);
    c.fillRect(80, 500, 840, 40);
  }
  return sampleCard;
}

export function outputName(name) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return ext === "png" ? `${base}_watermark.png` : `${base}_watermark.jpg`;
}

export async function renderToBlob(source, settings, fileName) {
  await ensureFont(settings.text);
  const canvas = document.createElement("canvas");
  renderWatermark(canvas, source, settings);
  const type = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
}

export function triggerDownload(blob, fileName) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

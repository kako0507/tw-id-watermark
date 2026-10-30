import { DEFAULT_LONG_MM, MAX_OUTPUT, cardRatio } from "./cards.js";

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Order as top-left, top-right, bottom-right, bottom-left
export function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  sorted.forEach((p, i) => { if (p.x + p.y < sorted[start].x + sorted[start].y) start = i; });
  return sorted.slice(start).concat(sorted.slice(0, start));
}

export function fullCorners(width, height, inset = 0) {
  const mx = width * inset, my = height * inset;
  return [{ x: mx, y: my }, { x: width - mx, y: my }, { x: width - mx, y: height - my }, { x: mx, y: height - my }];
}

// Solve the 8x8 linear system (Gaussian elimination)
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Homography that maps the four `from` points onto the four `to` points
function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}

// Output size in px. sizes = real card sizes in mm (from cardSizes()); null keeps the
// ratio measured from the four corners. Orientation follows the photo
export function outputSize(c, sizes, maxLong = MAX_OUTPUT) {
  let w = Math.max(dist(c[0], c[1]), dist(c[3], c[2]));
  let h = Math.max(dist(c[0], c[3]), dist(c[1], c[2]));
  if (sizes) {
    const { ratio } = cardRatio(sizes, Math.max(w, h) / Math.min(w, h));
    if (w >= h) h = w / ratio; else w = h / ratio;
  }
  const s = Math.min(1, maxLong / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// Each quarter turn makes the next corner the top-left, which rotates the corrected
// output 90° counter-clockwise. turns may be any integer
export function rotateCorners(corners, turns) {
  const k = ((turns % 4) + 4) % 4;
  return corners.slice(k).concat(corners.slice(0, k));
}

// Border in px for a margin in millimetres, scaled by the card's real long side
export function marginPx(cw, ch, sizes, marginMm) {
  const longMm = sizes ? cardRatio(sizes, Math.max(cw, ch) / Math.min(cw, ch)).longMm : DEFAULT_LONG_MM;
  return Math.round(marginMm * Math.max(cw, ch) / longMm);
}

// Perspective correction: map each output pixel back into the source and sample bilinearly
// marginMm = extra border around the card in millimetres; the card's own aspect ratio is unaffected
// maxLong caps the output's long side (small values give a fast preview for analysis)
export function warp(source, corners, sizes, marginMm = 0, maxLong = MAX_OUTPUT) {
  const [cw, ch] = outputSize(corners, sizes, maxLong);
  const pad = marginPx(cw, ch, sizes, marginMm);
  const ow = cw + pad * 2, oh = ch + pad * 2;
  const sw = source.width, sh = source.height;
  const sc = document.createElement("canvas");
  sc.width = sw; sc.height = sh;
  const sctx = sc.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(source, 0, 0);
  const sd = sctx.getImageData(0, 0, sw, sh).data;

  const H = homography([
    { x: pad, y: pad }, { x: pad + cw, y: pad }, { x: pad + cw, y: pad + ch }, { x: pad, y: pad + ch },
  ], corners);
  const out = document.createElement("canvas");
  out.width = ow; out.height = oh;
  const octx = out.getContext("2d");
  const od = octx.createImageData(ow, oh);
  const d = od.data;
  let i = 0;
  for (let y = 0; y < oh; y++) {
    const py = y + 0.5;
    for (let x = 0; x < ow; x++, i += 4) {
      const px = x + 0.5;
      const den = H[6] * px + H[7] * py + H[8];
      let sx = (H[0] * px + H[1] * py + H[2]) / den - 0.5;
      let sy = (H[3] * px + H[4] * py + H[5]) / den - 0.5;
      sx = Math.min(Math.max(sx, 0), sw - 1.001);
      sy = Math.min(Math.max(sy, 0), sh - 1.001);
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const a = (y0 * sw + x0) * 4, b = a + 4, c = a + sw * 4, e = c + 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[a + k] + (sd[b + k] - sd[a + k]) * fx;
        const bot = sd[c + k] + (sd[e + k] - sd[c + k]) * fx;
        d[i + k] = top + (bot - top) * fy;
      }
      d[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

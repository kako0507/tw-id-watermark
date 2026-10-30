import { nearestCard } from "./cards.js";
import { dist, orderCorners, polygonArea } from "./geometry.js";
import { bestLaminatedId, foregroundMask, refineQuad, sobel } from "./refine.js";

// OpenCV.js is ~10MB, so it is loaded from a CDN on first detection instead of bundled
const OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";

let cvLoader = null;

export function isOpenCVLoaded() {
  return Boolean(window.cv && window.cv.Mat);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error("偵測元件載入失敗，請檢查網路")); };
    document.head.appendChild(s);
  });
}

// Resolves to { cv } rather than cv: the Emscripten module may have a then(), and
// resolving with it directly would hang
export function loadOpenCV() {
  if (!cvLoader) {
    cvLoader = loadScript(OPENCV_URL).then(() => new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const cv = window.cv;
        if (cv instanceof Promise) { cv.then((m) => { window.cv = m; check(); }); return; }
        if (cv && cv.Mat) return resolve({ cv });
        if (Date.now() - started > 60000) return reject(new Error("偵測元件初始化逾時"));
        setTimeout(check, 50);
      };
      check();
    }));
    cvLoader.catch(() => { cvLoader = null; });
  }
  return cvLoader;
}

// Find the card in the photo.
// Returns { corners, laminated }: the card's four corners (null when none is found), and the
// lamination's corners when the photo fits a laminated ID card (paper card inside a plastic
// lamination, see refine.js), otherwise null
export function detectCard(cv, source) {
  const scale = Math.min(1, 800 / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  const small = document.createElement("canvas");
  small.width = w; small.height = h;
  small.getContext("2d").drawImage(source, 0, 0, w, h);

  const mats = [];
  const keep = (m) => { mats.push(m); return m; };
  const src = keep(cv.imread(small));
  const gray = keep(new cv.Mat()), blur = keep(new cv.Mat()), bin = keep(new cv.Mat());
  const kernel = keep(cv.Mat.ones(5, 5, cv.CV_8U));
  const imgArea = w * h;
  const margin = Math.max(w, h) * 0.015;
  const onBorder = (p) => p.x < margin || p.y < margin || p.x > w - margin || p.y > h - margin;
  const candidates = [];

  // Collect rough quad candidates from the binary image
  const collect = () => {
    const contours = new cv.MatVector(), hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const hull = new cv.Mat();
      cv.convexHull(cnt, hull);
      const area = cv.contourArea(hull);
      if (area > imgArea * 0.15 && area < imgArea * 0.97) {
        const peri = cv.arcLength(hull, true);
        // Cards have rounded corners: loosen the tolerance until four points remain
        for (const eps of [0.02, 0.035, 0.05]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          const d = approx.data32S;
          const pts = approx.rows === 4 ? [0, 1, 2, 3].map((k) => ({ x: d[k * 2], y: d[k * 2 + 1] })) : null;
          const fill = pts ? cv.contourArea(approx) / area : 0;
          approx.delete();
          if (!pts) continue;
          // The quad must nearly fill the shape; otherwise it is forced (e.g. a corner cut out by the
          // photo). Kept loose: edge refinement and scoring below reject poor quads anyway
          if (fill < 0.85) break;
          // Two or more corners on the photo edge usually mean the frame or a sleeve, not the card
          if (pts.filter(onBorder).length >= 2) break;
          candidates.push(orderCorners(pts));
          break;
        }
      }
      hull.delete();
      cnt.delete();
    }
    contours.delete();
    hierarchy.delete();
  };

  let grad, fg;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    grad = sobel(blur.data, w, h);
    fg = foregroundMask(src.data, w, h);
    // Method 1: edge detection at several thresholds
    for (const [lo, hi] of [[30, 90], [50, 150], [80, 220]]) {
      cv.Canny(blur, bin, lo, hi);
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel);
      collect();
    }
    // Low-contrast photos (light card on a light table): faint edges with gaps, so use a
    // lower threshold and close wider gaps
    cv.Canny(blur, bin, 20, 60);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, keep(cv.Mat.ones(9, 9, cv.CV_8U)));
    collect();
    // Method 2: brightness segmentation (cards are usually lighter than the desk; try both)
    // Method 3: chroma segmentation max(RGB)-min(RGB), good for tinted cards on grey/silver surfaces
    const chroma = keep(new cv.Mat(h, w, cv.CV_8UC1));
    const rgba = src.data, cd = chroma.data;
    for (let i = 0, j = 0; j < cd.length; i += 4, j++) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      cd[j] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    cv.GaussianBlur(chroma, chroma, new cv.Size(5, 5), 0);
    for (const channel of [blur, chroma]) {
      for (const type of [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]) {
        cv.threshold(channel, bin, 0, 255, type + cv.THRESH_OTSU);
        cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kernel);
        collect();
      }
    }
  } finally {
    mats.forEach((m) => m.delete());
  }

  // Contour corners are a few px off (rounded corners, thick edge bands), so snap every
  // candidate to the real edges first. Score = area x closeness to a card ratio x how much
  // of the outline sits on real edges; quads mixing the paper card and the lamination lose
  let best = null;
  const refined = [];
  for (const rough of candidates) {
    const { corners, support } = refineQuad(grad, rough, 20, fg);
    refined.push(corners);
    const c = corners.map((p) => ({ x: Math.min(Math.max(p.x, 0), w), y: Math.min(Math.max(p.y, 0), h) }));
    const area = polygonArea(c);
    if (area < imgArea * 0.15) continue;
    const ew = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2;
    const eh = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
    const ratio = Math.max(ew, eh) / Math.min(ew, eh);
    const fit = support.reduce((s, v) => s + v, 0) / 4;
    const score = area * Math.exp(-1.5 * nearestCard(ratio).diff) * fit * fit;
    if (!best || score > best.score) best = { score, corners: c };
  }
  const toSource = (pts) => pts.map((p) => ({ x: Math.min(Math.max(p.x, 0), w) / scale, y: Math.min(Math.max(p.y, 0), h) / scale }));
  const id = bestLaminatedId(grad, refined);
  return { corners: best ? toSource(best.corners) : null, laminated: id ? toSource(id.outer) : null };
}

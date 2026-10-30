// Precise card edges from a rough quad, and the lamination edge of an ID card.
// Pure JavaScript on gradient arrays, so it is unit-testable without OpenCV or a canvas.
import { applyHomography, dist, homography, solve } from "./geometry.js";

// |gradient| (3x3 Sobel on 0-255 grey) that counts as a real edge
export const GRAD_MIN = 25;

// A laminated ID card: the paper card sits centred inside the plastic lamination
export const ID_PAPER_MM = [79.7, 48];
export const ID_LAMINATED_MM = [85.6, 54];

// 3x3 Sobel of a greyscale image (one value per pixel)
export function sobel(gray, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1];
      const d = gray[i - 1], f = gray[i + 1];
      const g = gray[i + w - 1], k = gray[i + w], m = gray[i + w + 1];
      gx[i] = (c + 2 * f + m) - (a + 2 * d + g);
      gy[i] = (g + 2 * k + m) - (a + 2 * b + c);
    }
  }
  return { gx, gy, w, h };
}

// Gradient component along the unit normal n at a point (0 outside the image)
function gradAlong(grad, x, y, nx, ny) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= grad.w || yi >= grad.h) return 0;
  const i = yi * grad.w + xi;
  return Math.abs(grad.gx[i] * nx + grad.gy[i] * ny);
}

// Total-least-squares line { p, v } through points, refitted once without outliers
function fitLine(pts) {
  const fit = (ps) => {
    const mx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const my = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of ps) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { p: { x: mx, y: my }, v: { x: Math.cos(angle), y: Math.sin(angle) } };
  };
  const residual = (l, p) => Math.abs((p.x - l.p.x) * -l.v.y + (p.y - l.p.y) * l.v.x);
  const first = fit(pts);
  const res = pts.map((p) => residual(first, p));
  const median = [...res].sort((a, b) => a - b)[Math.floor(res.length / 2)];
  const kept = pts.filter((_, i) => res[i] <= Math.max(1.5, 2.5 * median));
  return kept.length >= 2 ? fit(kept) : first;
}

function lineThrough(a, b) {
  const L = dist(a, b) || 1;
  return { p: a, v: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } };
}

function intersect(l1, l2) {
  const det = l1.v.x * -l2.v.y - l1.v.y * -l2.v.x;
  if (Math.abs(det) < 1e-9) return null;
  const dx = l2.p.x - l1.p.x, dy = l2.p.y - l1.p.y;
  const t = (dx * -l2.v.y - dy * -l2.v.x) / det;
  return { x: l1.p.x + l1.v.x * t, y: l1.p.y + l1.v.y * t };
}

// Corner i is where side i-1 (ending at it) meets side i (starting at it)
function cornersFromLines(lines, fallback) {
  return lines.map((l, i) => intersect(lines[(i + 3) % 4], l) || fallback[i]);
}

// For each side of the quad, look up to `radius` px either way along the side's normal for
// the strongest edge, fit a line through those points, and report how much of the side
// sits on a real edge (support, 0-1)
export function refineSides(grad, quad, radius = 12, samples = 40) {
  return quad.map((a, i) => {
    const b = quad[(i + 1) % 4];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const pts = [];
    for (let s = 0; s < samples; s++) {
      const t = 0.1 + 0.8 * s / (samples - 1);
      const px = a.x + dx * t, py = a.y + dy * t;
      let bestK = 0, bestG = -1;
      for (let k = -radius; k <= radius; k++) {
        const g = gradAlong(grad, px + nx * k, py + ny * k, nx, ny);
        if (g > bestG) { bestG = g; bestK = k; }
      }
      if (bestG >= GRAD_MIN) pts.push({ x: px + nx * bestK, y: py + ny * bestK });
    }
    return {
      line: pts.length >= 6 ? fitLine(pts) : lineThrough(a, b),
      support: pts.length / samples,
    };
  });
}

// Snap a rough quad (TL, TR, BR, BL) to the image's edges
export function refineQuad(grad, quad, radius = 12) {
  const sides = refineSides(grad, quad, radius);
  return { corners: cornersFromLines(sides.map((s) => s.line), quad), support: sides.map((s) => s.support) };
}

function sideLengths(q) {
  return [(dist(q[0], q[1]) + dist(q[3], q[2])) / 2, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2];
}

// ---------- Laminated ID card: fit the lamination and the paper card together ----------
//
// Fitting each side on its own lets a quad mix both layers (e.g. top and left on the paper
// card, right and bottom on the lamination) and still sit on real edges everywhere. So the
// card is modelled as one rigid object, two rectangles in millimetres, and a single
// perspective transform is fitted to the edges of all eight sides at once.

const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

// The card's two outlines in millimetres, as TL, TR, BR, BL
export function idFrame(landscape = true) {
  const [ow, oh] = landscape ? ID_LAMINATED_MM : [...ID_LAMINATED_MM].reverse();
  const [pw, ph] = landscape ? ID_PAPER_MM : [...ID_PAPER_MM].reverse();
  return { outer: rect(0, 0, ow, oh), paper: rect((ow - pw) / 2, (oh - ph) / 2, pw, ph) };
}

// One Gauss-Newton step on the homography: move it so each mm point lands on its edge
// line. Only the distance across the edge counts (an edge says nothing about where along
// it a point belongs). matches: [{ m: mm point, q: point on the edge, n: unit normal }]
export function stepHomography(H, matches) {
  const JtJ = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Jtr = new Array(8).fill(0);
  for (const { m, q, n } of matches) {
    const D = H[6] * m.x + H[7] * m.y + 1;
    const u = (H[0] * m.x + H[1] * m.y + H[2]) / D;
    const v = (H[3] * m.x + H[4] * m.y + H[5]) / D;
    const r = n.x * (u - q.x) + n.y * (v - q.y);
    const s = n.x * u + n.y * v;
    const J = [n.x * m.x / D, n.x * m.y / D, n.x / D, n.y * m.x / D, n.y * m.y / D, n.y / D, -s * m.x / D, -s * m.y / D];
    for (let i = 0; i < 8; i++) {
      Jtr[i] += J[i] * r;
      for (let j = 0; j < 8; j++) JtJ[i][j] += J[i] * J[j];
    }
  }
  for (let i = 0; i < 8; i++) JtJ[i][i] *= 1 + 1e-6;  // tiny damping keeps the system solvable
  const delta = solve(JtJ, Jtr.map((v) => -v));
  if (delta.some((d) => !Number.isFinite(d))) return H;
  return [...H.slice(0, 8).map((h, i) => h + delta[i]), 1];
}

// Offset (px, kMin..kMax) along the normal to the edge closest to the point: the nearest
// local maximum of the gradient above GRAD_MIN, so a stronger line further away cannot
// pull the side off
function nearestEdge(grad, px, py, nx, ny, kMin, kMax) {
  const at = (k) => gradAlong(grad, px + nx * k, py + ny * k, nx, ny);
  let best = null;
  for (let k = kMin; k <= kMax; k++) {
    const v = at(k);
    if (v < GRAD_MIN || v < at(k - 1) || v < at(k + 1)) continue;
    if (best === null || Math.abs(k) < Math.abs(best)) best = k;
  }
  return best;
}

// Sample points along every side of the frame's two outlines (lamination, paper card) and
// look for the matching edge. The normal points into the card, and each side's search
// stops halfway to the other outline, so one layer can never latch onto the other's edge.
// Calls visit(mmPoint, imagePointOnEdge | null, sideIndex, normal) for each sample
function matchSides(grad, H, [outer, paper], radius, visit, samples = 20) {
  [outer, paper].forEach((outline, o) => outline.forEach((a, i) => {
    const b = outline[(i + 1) % 4];
    const pa = applyHomography(H, a), pb = applyHomography(H, b);
    const L = dist(pa, pb) || 1;
    const nx = -(pb.y - pa.y) / L, ny = (pb.x - pa.x) / L;
    // Gap (px) between this side and the same side of the other outline
    const other = o === 0 ? paper : outer;
    const qa = applyHomography(H, other[i]);
    const gap = Math.abs((qa.x - pa.x) * nx + (qa.y - pa.y) * ny);
    const half = Math.max(1, Math.floor(gap / 2) - 1);
    const [kMin, kMax] = o === 0 ? [-radius, Math.min(radius, half)] : [-Math.min(radius, half), radius];
    for (let s = 0; s < samples; s++) {
      const t = 0.12 + 0.76 * s / (samples - 1);  // stay clear of the rounded corners
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const p = applyHomography(H, m);
      const k = nearestEdge(grad, p.x, p.y, nx, ny, kMin, kMax);
      visit(m, k === null ? null : { x: p.x + nx * k, y: p.y + ny * k }, o * 4 + i, { x: nx, y: ny });
    }
  }));
}

// Fit the laminated ID card starting from a rough quad that is either its paper card
// (role "paper") or its lamination (role "outer"). Returns both outlines in image
// coordinates and how much of each side sits on a real edge, or null if the fit fails
export function fitLaminatedId(grad, seed, role) {
  const [w, h] = sideLengths(seed);
  const frame = idFrame(w >= h);
  const outlines = [frame.outer, frame.paper];
  let H = homography(frame[role], seed);
  // Search wide first, then narrow down; a few Gauss-Newton steps at each width
  for (const radius of [12, 12, 6, 6, 3, 3, 3]) {
    const matches = [];
    matchSides(grad, H, outlines, radius, (m, q, _, n) => { if (q) matches.push({ m, q, n }); });
    if (matches.length < 16) return null;
    H = stepHomography(H, matches);
  }
  const hits = new Array(8).fill(0), totals = new Array(8).fill(0);
  matchSides(grad, H, outlines, 2, (_, to, side) => { totals[side]++; if (to) hits[side]++; });
  const support = hits.map((n, i) => n / totals[i]);
  return {
    outer: frame.outer.map((p) => applyHomography(H, p)),
    paper: frame.paper.map((p) => applyHomography(H, p)),
    outerSupport: support.slice(0, 4),
    paperSupport: support.slice(4),
  };
}

// The paper card's edges must be clearly visible; the lamination's edges only help
export const MIN_PAPER_SUPPORT = 0.75;
// Evidence that the lamination is really there (on average this much of its outline on edges)
export const MIN_LAMINATION_SUPPORT = 0.3;

// Best laminated-ID fit over all seeds (each tried as paper card and as lamination), or null.
// A lone rectangle could be a paper card with invisible lamination or just a plain card;
// perspective can give a rectangle any ratio, so it only counts as a paper card when the
// lamination shows or its measured ratio is clearly the paper card's
export function bestLaminatedId(grad, seeds) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const paperRatio = ID_PAPER_MM[0] / ID_PAPER_MM[1], laminatedRatio = ID_LAMINATED_MM[0] / ID_LAMINATED_MM[1];
  let best = null;
  for (const seed of seeds) {
    for (const role of ["paper", "outer"]) {
      const fit = fitLaminatedId(grad, seed, role);
      if (!fit) continue;
      const paper = mean(fit.paperSupport), outer = mean(fit.outerSupport);
      if (paper < MIN_PAPER_SUPPORT || Math.min(...fit.paperSupport) < 0.4) continue;
      const [w, h] = sideLengths(fit.paper);
      const r = Math.max(w, h) / Math.min(w, h);
      const looksLikePaper = Math.abs(Math.log(r / paperRatio)) < Math.abs(Math.log(r / laminatedRatio));
      if (outer < MIN_LAMINATION_SUPPORT && !looksLikePaper) continue;
      const score = 0.7 * paper + 0.3 * outer;
      if (!best || score > best.score) best = { ...fit, score };
    }
  }
  return best;
}

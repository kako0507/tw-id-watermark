import { describe, expect, it } from "vitest";
import { applyHomography, homography } from "./geometry.js";
import { bestLaminatedId, fitLaminatedId, idFrame, refineQuad, sobel, stepHomography } from "./refine.js";

const W = 400, H = 300;

// Greyscale image: background, then filled axis-aligned rectangles [value, x0, y0, x1, y1]
function grey(background, rects) {
  const g = new Float32Array(W * H).fill(background);
  for (const [v, x0, y0, x1, y1] of rects) {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) g[y * W + x] = v;
    }
  }
  return g;
}
const image = (background, rects) => sobel(grey(background, rects), W, H);

const quad = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const maxError = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

describe("refineQuad", () => {
  const grad = image(80, [[220, 60, 50, 340, 230]]);

  it("snaps a rough quad onto the real edges", () => {
    const rough = [{ x: 66, y: 44 }, { x: 333, y: 57 }, { x: 346, y: 224 }, { x: 54, y: 236 }];
    const { corners, support } = refineQuad(grad, rough);
    expect(maxError(corners, quad(60, 50, 340, 230))).toBeLessThan(2);
    support.forEach((s) => expect(s).toBeGreaterThan(0.9));
  });

  it("reports low support for sides with no edge nearby", () => {
    const { support } = refineQuad(grad, quad(60, 50, 340, 290));  // bottom side runs through flat background
    expect(support[2]).toBe(0);
    expect(support[0]).toBeGreaterThan(0.9);
  });
});

describe("stepHomography", () => {
  it("converges onto the edge lines of a perspective rectangle", () => {
    const from = quad(0, 0, 85.6, 54), to = [{ x: 30, y: 20 }, { x: 360, y: 40 }, { x: 350, y: 250 }, { x: 20, y: 230 }];
    const truth = homography(from, to);
    // Edge observations: points along each side with the side's normal
    const matches = [];
    from.forEach((a, i) => {
      const b = from[(i + 1) % 4];
      const pa = applyHomography(truth, a), pb = applyHomography(truth, b);
      const L = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const n = { x: -(pb.y - pa.y) / L, y: (pb.x - pa.x) / L };
      for (let t = 0.1; t < 0.95; t += 0.1) {
        const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        matches.push({ m, q: applyHomography(truth, m), n });
      }
    });
    // Start 6-10 px off and iterate
    let H = homography(from, to.map((p, i) => ({ x: p.x + [6, -8, 5, -7][i], y: p.y + [-9, 6, 8, -5][i] })));
    for (let k = 0; k < 8; k++) H = stepHomography(H, matches);
    expect(maxError(from.map((p) => applyHomography(H, p)), to)).toBeLessThan(0.01);
  });
});

describe("laminated ID card", () => {
  // 4 px per mm, card placed at (20, 40)
  const S = 4, OX = 20, OY = 40;
  const frame = idFrame();
  const toPx = (pts) => pts.map((p) => ({ x: OX + p.x * S, y: OY + p.y * S }));
  const outer = toPx(frame.outer), paper = toPx(frame.paper);
  const box = (pts) => [pts[0].x, pts[0].y, pts[2].x, pts[2].y];

  // Dark desk, lighter translucent lamination, bright paper card
  const laminated = image(60, [[120, ...box(outer)], [230, ...box(paper)]]);

  it("fits both outlines starting from the paper card", () => {
    const fit = fitLaminatedId(laminated, paper.map((p, i) => ({ x: p.x + (i % 2 ? 4 : -3), y: p.y + 3 })), "paper");
    expect(maxError(fit.outer, outer)).toBeLessThan(1.5);
    expect(maxError(fit.paper, paper)).toBeLessThan(1.5);
    fit.paperSupport.concat(fit.outerSupport).forEach((s) => expect(s).toBeGreaterThan(0.9));
  });

  it("fits both outlines starting from the lamination", () => {
    const fit = fitLaminatedId(laminated, outer, "outer");
    expect(maxError(fit.outer, outer)).toBeLessThan(1.5);
  });

  it("prefers the consistent fit over a quad that mixes the two layers", () => {
    // Top/left on the paper card, right/bottom on the lamination: both fit some edges,
    // but only the true card lines up with both outlines
    const mixed = [paper[0], { x: outer[1].x, y: paper[1].y }, outer[2], { x: paper[3].x, y: outer[3].y }];
    const best = bestLaminatedId(laminated, [mixed, paper]);
    expect(maxError(best.outer, outer)).toBeLessThan(1.5);
  });

  it("is not pulled off by a printed line just inside the paper card", () => {
    const g = grey(60, [[120, ...box(outer)], [230, ...box(paper)]]);
    const lineY = Math.round(paper[0].y + 7);  // dark ruled line 7 px below the paper's top edge
    for (let x = Math.round(paper[0].x) + 10; x < paper[1].x - 10; x++) { g[lineY * W + x] = 40; g[(lineY + 1) * W + x] = 40; }
    const fit = fitLaminatedId(sobel(g, W, H), paper, "paper");
    expect(maxError(fit.paper, paper)).toBeLessThan(1.5);
  });

  it("predicts an invisible lamination edge from the paper card", () => {
    const paperOnly = image(60, [[230, ...box(paper)]]);
    const best = bestLaminatedId(paperOnly, [paper]);
    expect(maxError(best.outer, outer)).toBeLessThan(1.5);
    best.outerSupport.forEach((s) => expect(s).toBe(0));
  });

  it("rejects a plain card with no paper card inside", () => {
    const plain = image(60, [[230, ...box(outer)]]);
    expect(bestLaminatedId(plain, [outer])).toBeNull();
  });
});

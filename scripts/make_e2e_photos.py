"""Generate e2e test photos from the official ID card specimens (樣本).

Each specimen is turned into a laminated card (translucent plastic around the paper
card), placed on a desk with perspective, and saved in four orientations. The
manifest records where the lamination's corners really are, in upright card order
(top-left, top-right, bottom-right, bottom-left), so the e2e test can check both the
crop and the orientation.

Usage (from the repo root):
    pip install opencv-python-headless numpy
    python scripts/make_e2e_photos.py
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SPECIMENS = ROOT / "e2e" / "fixtures" / "specimens"
OUT = ROOT / "e2e" / "fixtures" / "photos"

# Boxes measured on the specimen images: (x0, y0, x1, y1) of the lamination outline and
# of the paper card outline
CARDS = {
    "front": {"file": "id-front.jpg", "outer": (9, 12, 1288, 820), "paper": (54, 57, 1244, 775)},
    "back": {"file": "id-back.jpg", "outer": (10, 14, 1187, 756), "paper": (48, 55, 1146, 715)},
}
DESK = (1600, 1200)
TURNS = [0, 1, 2, 3]  # quarter turns counter-clockwise


def rounded_mask(w, h, box, radius):
    mask = np.zeros((h, w), np.uint8)
    x0, y0, x1, y1 = box
    r = radius
    cv2.rectangle(mask, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(mask, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in [(x0 + r, y0 + r), (x1 - r, y0 + r), (x1 - r, y1 - r), (x0 + r, y1 - r)]:
        cv2.circle(mask, (cx, cy), r, 255, -1)
    return mask


def laminated_card(spec):
    """RGBA card cropped to the lamination: opaque paper, translucent plastic around it."""
    img = cv2.imdecode(np.fromfile(SPECIMENS / spec["file"], np.uint8), cv2.IMREAD_COLOR)
    ox0, oy0, ox1, oy1 = spec["outer"]
    px0, py0, px1, py1 = spec["paper"]
    card = img[oy0:oy1, ox0:ox1]
    h, w = card.shape[:2]

    # Paper: inset a few px to drop the specimen's drawn outline
    inset = 5
    paper_box = (px0 - ox0 + inset, py0 - oy0 + inset, px1 - ox0 - inset, py1 - oy0 - inset)
    paper = rounded_mask(w, h, paper_box, 22)
    plastic = rounded_mask(w, h, (0, 0, w - 1, h - 1), 34)

    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = (238, 240, 240)
    rgba[..., 3] = (plastic > 0) * 70                      # translucent plastic
    rim = cv2.subtract(plastic, cv2.erode(plastic, np.ones((5, 5), np.uint8)))
    rgba[rim > 0, 3] = 150                                 # slightly brighter rim
    rgba[paper > 0, :3] = card[paper > 0]
    rgba[paper > 0, 3] = 255
    return rgba


def desk(kind, rng):
    w, h = DESK
    if kind == "wood":
        img = np.zeros((h, w, 3), np.float32)
        img[:] = (55, 85, 122)                             # BGR brown
        for y in range(0, h, 5):
            k = rng.uniform(-18, 18)
            dy = int(rng.uniform(-20, 20))
            cv2.line(img, (0, y), (w, y + dy), (55 + k / 2, 85 + k, 122 + k), 5)
    else:
        img = np.full((h, w, 3), (196, 198, 200), np.float32)  # light grey table
    img += rng.normal(0, 4, img.shape)
    return np.clip(cv2.GaussianBlur(img, (0, 0), 1.2), 0, 255)


def photo(card, kind, seed):
    """Composite the card onto a desk with perspective; returns image and outer corners."""
    rng = np.random.default_rng(seed)
    bg = desk(kind, rng)
    h, w = card.shape[:2]
    W, H = DESK
    cw = W * 0.6
    ch = cw * h / w
    cx, cy = W / 2 + rng.uniform(-60, 60), H / 2 + rng.uniform(-40, 40)
    base = np.float32([[cx - cw / 2, cy - ch / 2], [cx + cw / 2, cy - ch / 2], [cx + cw / 2, cy + ch / 2], [cx - cw / 2, cy + ch / 2]])
    angle = np.deg2rad(rng.uniform(-7, 7))
    rot = np.float32([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    dst = (base - (cx, cy)) @ rot.T + (cx, cy)
    dst += rng.uniform(-0.035, 0.035, (4, 2)) * cw         # perspective
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(dst))
    warped = cv2.warpPerspective(card, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)).astype(np.float32)
    alpha = warped[..., 3:] / 255
    out = bg * (1 - alpha) + warped[..., :3] * alpha
    out = cv2.GaussianBlur(out, (0, 0), 0.7) + rng.normal(0, 2.5, out.shape)
    return np.clip(out, 0, 255).astype(np.uint8), dst


def rotate(img, corners, turns):
    """Rotate the photo counter-clockwise by quarter turns, moving the corners with it."""
    h, w = img.shape[:2]
    out = np.rot90(img, turns).copy()
    pts = corners.copy()
    for _ in range(turns):
        pts = np.stack([pts[:, 1], w - pts[:, 0]], axis=1)  # (x, y) -> (y, w - x)
        w, h = h, w
    return out, pts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    seed = 1
    for side, spec in CARDS.items():
        card = laminated_card(spec)
        for kind in ["wood", "grey"]:
            base, corners = photo(card, kind, seed)
            seed += 1
            for turns in TURNS:
                img, pts = rotate(base, corners, turns)
                name = f"id-{side}-{kind}-{turns * 90:03d}.jpg"
                cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tofile(OUT / name)
                manifest.append({
                    "file": name,
                    "side": side,
                    "background": kind,
                    "rotation": turns * 90,
                    "width": img.shape[1],
                    "height": img.shape[0],
                    # Lamination corners in upright card order: TL, TR, BR, BL
                    "corners": [[round(float(x), 1), round(float(y), 1)] for x, y in pts],
                })
                print("wrote", name)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

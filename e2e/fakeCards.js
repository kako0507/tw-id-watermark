// Fake card photos generated in the browser, so tests never need real ID photos
// (which contain personal data). Each fake card reproduces the layout cues of the
// real one and carries a magenta marker in its top-left corner, which the tests use
// to check the final orientation independently of the app's own logic.

export const MARKER = [208, 0, 208];

// Runs inside the page (serialized by page.evaluate), so it must be self-contained.
// Returns a JPEG data URL of a desk photo with the card rotated `turns` quarter turns
// counter-clockwise.
export function renderFakeCardPhoto({ type, turns, marker }) {
  const SIZES = { nhi: [856, 540], idFront: [856, 540], license: [850, 600] };
  const [cw, ch] = SIZES[type];
  const card = document.createElement("canvas");
  card.width = cw; card.height = ch;
  const c = card.getContext("2d");
  const rect = (color, x, y, w, h) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  const ellipse = (color, x, y, rx, ry) => { c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
  const photo = (x, y, w, h) => {
    rect("#e9ecef", x, y, w, h);
    ellipse("#2a1c14", x + w / 2, y + h * 0.38, w * 0.36, h * 0.3);  // hair
    ellipse("#e0a888", x + w / 2, y + h * 0.48, w * 0.3, h * 0.3);   // face
    rect("#e0a888", x + w * 0.38, y + h * 0.7, w * 0.24, h * 0.12);  // neck
    rect("#5b6770", x + w * 0.1, y + h * 0.8, w * 0.8, h * 0.2);     // shirt
  };
  const textLines = (x, y, widths, gap) => widths.forEach((w, i) => rect("#333333", x, y + i * gap, w, 14));

  c.save();
  c.beginPath();
  c.roundRect(0, 0, cw, ch, 36);
  c.clip();
  if (type === "nhi") {
    rect("#dfeee9", 0, 0, cw, ch);
    ellipse("#3a9a4a", 160, 80, 45, 45);                       // logo
    rect("#c9a03c", 90, 190, 150, 120);                        // gold chip
    rect("#a07a24", 120, 190, 6, 120); rect("#a07a24", 90, 245, 150, 6);
    textLines(300, 90, [380, 300], 40);
    textLines(300, 300, [260, 200, 160], 46);
    textLines(60, 470, [260], 0);
    photo(600, 170, 210, 330);
  } else if (type === "license") {
    rect("#f3e7a0", 0, 0, cw, ch);
    c.strokeStyle = "#222"; c.lineWidth = 3;
    for (let y = 180; y < ch - 30; y += 70) { c.beginPath(); c.moveTo(30, y); c.lineTo(cw - 30, y); c.stroke(); }
    rect("#d0202a", 300, 30, 130, 130);                        // red seal
    textLines(90, 60, [180, 520], 60);
    textLines(110, 200, [300, 260, 380, 320, 280], 70);
    photo(630, 30, 190, 260);
  } else {
    rect("#f1dde3", 0, 0, cw, ch);
    rect("#d0202a", 80, 40, 150, 100);                         // flag
    rect("#1f3fa8", 80, 40, 75, 50);
    textLines(260, 70, [300], 0);
    textLines(80, 220, [380, 300, 420, 340], 70);
    photo(600, 120, 210, 300);
  }
  rect(`rgb(${marker.join(",")})`, 18, 18, 46, 46);           // top-left marker
  c.restore();

  // Desk: wood-coloured streaks from a fixed seed so every run is identical
  const DW = 1600, DH = 1200;
  const desk = document.createElement("canvas");
  desk.width = DW; desk.height = DH;
  const d = desk.getContext("2d");
  d.fillStyle = "#7a5537";
  d.fillRect(0, 0, DW, DH);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < DH; y += 6) {
    const k = Math.round((rand() - 0.5) * 36);
    d.strokeStyle = `rgb(${122 + k},${85 + k},${55 + (k >> 1)})`;
    d.lineWidth = 6;
    d.beginPath(); d.moveTo(0, y); d.lineTo(DW, y + (rand() - 0.5) * 40); d.stroke();
  }
  d.save();
  d.translate(DW / 2, DH / 2);
  d.rotate(0.1);
  d.scale(1.2, 1.2);
  d.drawImage(card, -cw / 2, -ch / 2);
  d.restore();

  // Rotate the whole photo, as if it had been taken holding the phone differently
  const swap = turns % 2 === 1;
  const out = document.createElement("canvas");
  out.width = swap ? DH : DW;
  out.height = swap ? DW : DH;
  const o = out.getContext("2d");
  o.translate(out.width / 2, out.height / 2);
  o.rotate(-turns * Math.PI / 2);
  o.drawImage(desk, -DW / 2, -DH / 2);
  return out.toDataURL("image/jpeg", 0.92);
}

// Runs inside the page: where the marker ended up in a card's output canvas.
// Returns the marker's centroid as fractions of the width / height, or null.
export function findMarker({ index, marker }) {
  const canvas = document.querySelectorAll(".card canvas")[index];
  const W = 200, H = Math.round(200 * canvas.height / canvas.width);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const close = Math.abs(data[i] - marker[0]) < 60 && data[i + 1] < 80 && Math.abs(data[i + 2] - marker[2]) < 60;
      if (close) { sx += x; sy += y; n++; }
    }
  }
  return n ? { x: sx / n / W, y: sy / n / H, pixels: n } : null;
}

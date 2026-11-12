// Draws the little tray icon (a status-colored acorn-ish dot with a leaf) in code.
const { nativeImage } = require("electron");

const COLORS = {
  working: [93, 160, 79],
  approval: [240, 190, 60],
  done: [214, 92, 78],
  sleep: [160, 140, 120],
};

function trayIcon(state, size = 32) {
  const [r, g, b] = COLORS[state] || COLORS.sleep;
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2 + 2, R = size * 0.38;
  // leaf: an ellipse tilted up-right above the dot
  const lx = size * 0.62, ly = size * 0.2, la = size * 0.2, lb = size * 0.09, rot = -0.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let px = [0, 0, 0, 0];
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const dx = x + 0.5 - lx, dy = y + 0.5 - ly;
      const ux = dx * Math.cos(rot) - dy * Math.sin(rot), uy = dx * Math.sin(rot) + dy * Math.cos(rot);
      if ((ux * ux) / (la * la) + (uy * uy) / (lb * lb) <= 1) px = [88, 150, 70, 255];
      if (d <= R + 1.6) px = [59, 42, 32, 255];             // outline
      if (d <= R) px = [r, g, b, 255];                       // fill
      if (Math.hypot(x + 0.5 - (cx - R * 0.35), y + 0.5 - (cy - R * 0.35)) < R * 0.22) px = [255, 255, 255, 200]; // shine
      // BGRA
      buf[i] = px[2]; buf[i + 1] = px[1]; buf[i + 2] = px[0]; buf[i + 3] = px[3];
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

module.exports = { trayIcon };

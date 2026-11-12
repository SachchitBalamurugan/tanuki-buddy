// Paints the paper face of the wooden sign.
import * as THREE from "three";

export const SIGN = {
  working:  { paper: "#a9cf8f", edge: "#6d9a52", ink: "#2c4a22", kanji: "進行中", en: "working…" },
  approval: { paper: "#f3d374", edge: "#cf9f3a", ink: "#5c3f12", kanji: "確認",   en: "needs you!" },
  done:     { paper: "#e88f7b", edge: "#b95544", ink: "#4d1a12", kanji: "完了",   en: "all done" },
  sleep:    { paper: "#efe5cf", edge: "#bfae8e", ink: "#6b5a4b", kanji: "おやすみ", en: "napping… zzz" },
};
const SOURCE = { claude: { name: "Claude", dot: "#d97757" }, codex: { name: "Codex", dot: "#1f1f1f" } };

const W = 700, H = 450;
const canvas = document.createElement("canvas");
canvas.width = W; canvas.height = H;
const g = canvas.getContext("2d");
export const signTexture = new THREE.CanvasTexture(canvas);
signTexture.colorSpace = THREE.SRGBColorSpace;
signTexture.anisotropy = 4;

// deterministic washi-paper fibres
const fibres = Array.from({ length: 140 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return [r(1) * W, r(2) * H, 6 + r(3) * 26, r(4) * Math.PI, 0.05 + r(5) * 0.08];
});

const blooms = Array.from({ length: 14 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 39.3467 + n * 11.135) * 24634.6345) % 1 + 1) % 1;
  return [r(1) * W, r(2) * H, 60 + r(3) * 120, r(4)];
});
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function roundRect(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function drawSign({ state = "sleep", primary = null, count = 0 }) {
  const s = SIGN[state] || SIGN.sleep;
  g.clearRect(0, 0, W, H);
  roundRect(6, 6, W - 12, H - 12, 36);
  g.fillStyle = s.paper; g.fill();
  g.lineWidth = 10; g.strokeStyle = s.edge; g.stroke();

  g.save(); roundRect(6, 6, W - 12, H - 12, 36); g.clip();
  for (const [x, y, r, k] of blooms) {            // pigment blooms
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, k > 0.5 ? "rgba(255,250,235,0.22)" : hexA(s.edge, 0.16));
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.filter = "blur(16px)";                         // pigment pooling at the wet edge
  g.lineWidth = 46; g.strokeStyle = hexA(s.edge, 0.45);
  roundRect(6, 6, W - 12, H - 12, 36); g.stroke();
  g.filter = "none";
  for (const [x, y, len, a, alpha] of fibres) {
    g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.restore();

  g.fillStyle = s.ink; g.textAlign = "center"; g.textBaseline = "middle";
  const kanjiSize = s.kanji.length > 3 ? 128 : 168;
  g.font = `900 ${kanjiSize}px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "MS Mincho", serif`;
  g.save(); g.globalAlpha = 0.25; g.filter = "blur(3px)"; g.fillText(s.kanji, W / 2 + 2, 152); g.restore();
  g.fillText(s.kanji, W / 2, 150);
  g.font = `800 64px "Segoe UI Rounded", "Segoe UI", "Yu Gothic UI", sans-serif`;
  g.fillText(s.en, W / 2, 292);

  if (primary && state !== "sleep") {
    const src = SOURCE[primary.source] || SOURCE.claude;
    let label = src.name + (primary.project ? ` · ${primary.project}` : "");
    if (label.length > 22) label = label.slice(0, 21) + "…";
    if (count > 1) label += `  +${count - 1}`;
    g.font = `700 44px "Segoe UI", sans-serif`;
    const tw = g.measureText(label).width;
    const pillW = tw + 92, pillX = (W - pillW) / 2, pillY = 345;
    roundRect(pillX, pillY, pillW, 64, 32);
    g.fillStyle = "rgba(255,255,255,0.55)"; g.fill();
    g.beginPath(); g.arc(pillX + 38, pillY + 32, 15, 0, Math.PI * 2);
    g.fillStyle = src.dot; g.fill();
    g.fillStyle = s.ink; g.textAlign = "left";
    g.fillText(label, pillX + 64, pillY + 34);
  }
  signTexture.needsUpdate = true;
}

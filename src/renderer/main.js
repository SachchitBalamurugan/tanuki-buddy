import * as THREE from "three";
import { gsap } from "gsap";
import { buildTanuki } from "./tanuki.js";
import { drawSign, signTexture } from "./sign.js";
import { createAnimator } from "./anim.js";
import { createAmbience } from "./ambience.js";
import { chime } from "./chime.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const bubble = document.getElementById("bubble");

// --- three.js scene -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
camera.position.set(0.4, 2.05, 8);
camera.lookAt(0.4, 1.75, 0);

scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a9a5a, 1.6));
const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
key.position.set(-3, 5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe8ff, 0.9);
rim.position.set(3, 2, -4);
scene.add(rim);

const t = buildTanuki();
t.paper.material.map = signTexture;
t.paper.material.needsUpdate = true;
t.root.rotation.y = -0.18; // a slight three-quarter turn toward the viewer's left
scene.add(t.root);

const anim = createAnimator(t, scene, { reduce });
// Dev aid: index.html#icon renders a square face portrait for the app icon.
const ICON_MODE = location.hash === "#icon";
if (ICON_MODE) {
  t.signArm.visible = false;
  t.root.rotation.y = 0;
  camera.fov = 22;
  camera.position.set(0, 1.9, 6.9);
  camera.lookAt(0, 1.6, 0);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.32, 64), new THREE.MeshBasicMaterial({ color: 0xcfe2b2 }));
  disc.position.set(0, 1.55, -1.4);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.32, 1.4, 64), new THREE.MeshBasicMaterial({ color: 0x4b403b }));
  ring.position.copy(disc.position);
  scene.add(disc, ring);
}
const ambience = ICON_MODE ? { update() {}, setMood() {} } : createAmbience(scene, t.makeLeaf, { reduce });

function resize() {
  const w = innerWidth, h = innerHeight;
  if (ICON_MODE) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); return; }
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

gsap.ticker.add((time, deltaMs) => {
  ambience.update(time, deltaMs / 1000);
  renderer.render(scene, camera);
});

// --- status from the main process ---------------------------------------------------
let status = { state: "sleep", sessions: [], primary: null, count: 0, muted: false };
let signKey = "";
drawSign(status);
anim.setState(ICON_MODE ? "done" : "sleep");
ambience.setMood("sleep");

const NAME = { claude: "Claude", codex: "Codex" };
const LABEL = { working: "working", approval: "needs you", done: "done" };
function renderBubble() {
  if (!status.sessions.length) { bubble.innerHTML = "<b>おやすみ…</b><br>No Claude or Codex sessions yet."; return; }
  bubble.innerHTML = status.sessions.slice(0, 5).map((s) =>
    `<div class="row"><span class="dot ${s.state}"></span>${NAME[s.source]}${s.project ? ` · ${escapeHtml(s.project)}` : ""} <i>${LABEL[s.state] || s.state}</i></div>`
  ).join("") + (status.sessions.length > 5 ? `<div class="more">+${status.sessions.length - 5} more</div>` : "");
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

window.tanuki?.onStatus((s) => {
  const prev = status.state;
  status = s;
  const newKey = JSON.stringify([s.state, s.primary?.source, s.primary?.project, s.count]);
  if (s.state !== prev) {
    anim.flipSign(() => drawSign(s));
    anim.setState(s.state);
    ambience.setMood(s.state);
    if (s.transition && !s.muted && (s.state === "approval" || s.state === "done")) chime(s.state);
  } else if (newKey !== signKey) {
    drawSign(s);
  }
  signKey = newKey;
  renderBubble();
});

// --- hover / click-through / drag ------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovering = false, drag = null;
const hitTargets = [];
t.root.traverse((o) => { if (o.isMesh && o.material.side !== THREE.BackSide && !o.material.transparent) hitTargets.push(o); });
hitTargets.push(t.paper);

function hitTest(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(hitTargets, false).length > 0;
}

function setHover(v) {
  if (v === hovering) return;
  hovering = v;
  window.tanuki?.setHover(v);
  document.body.classList.toggle("hover", v);
  if (v) renderBubble();
}

addEventListener("mousemove", (e) => {
  if (drag) {
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    window.tanuki?.dragMove(dx, dy);
    return;
  }
  setHover(hitTest(e.clientX, e.clientY));
});
document.addEventListener("mouseleave", () => { if (!drag) setHover(false); });
addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !hovering) return;
  drag = { x: e.screenX, y: e.screenY, moved: false };
  window.tanuki?.dragStart();
});
addEventListener("mouseup", () => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  window.tanuki?.dragEnd();
  if (!moved) anim.poke();
});
addEventListener("contextmenu", (e) => { e.preventDefault(); if (hovering) window.tanuki?.contextMenu(); });

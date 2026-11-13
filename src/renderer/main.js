import * as THREE from "three";
import { gsap } from "gsap";
import { buildTanuki } from "./tanuki.js";
import { buildLog } from "./log.js";
import { drawSign, signTexture } from "./sign.js";
import { createAnimator } from "./anim.js";
import { createAmbience } from "./ambience.js";
import { chime } from "./chime.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const bubble = document.getElementById("bubble");
const grip = document.getElementById("grip");
const tuckBtn = document.getElementById("tuck");

// --- three.js scene -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// The ground: anything below y = -0.05 is cut away, so the tanuki can dive out of sight behind the log.
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)];

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
const holder = new THREE.Group(); // sinks into the ground when the tanuki hides
holder.add(t.root);
scene.add(holder);

const log = buildLog();
log.root.position.set(0.3, -0.8, 0.45);
log.root.rotation.y = -0.3;
log.root.visible = false;
log.mast.scale.setScalar(0.001);
scene.add(log.root);

const anim = createAnimator(t, holder, { reduce, log });
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
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

gsap.ticker.add((time, deltaMs) => {
  const dt = Math.min(deltaMs / 1000, 0.1);
  ambience.update(time, dt);
  if (log.root.visible) log.update(time, dt);
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
    log.setState(s.state);
    ambience.setMood(s.state);
    if (s.transition && !s.muted && (s.state === "approval" || s.state === "done")) chime(s.state);
  } else if (newKey !== signKey) {
    drawSign(s);
  }
  signKey = newKey;
  renderBubble();
});

// --- hiding under the log ---------------------------------------------------------------
let tucked = false;
function setTucked(v, { instant = false, report = true } = {}) {
  if (v === tucked && !instant) return;
  tucked = v;
  anim.tuck(v, instant);
  document.body.classList.toggle("tucked", v);
  tuckBtn.title = v ? "Come out" : "Hide under the log";
  if (report) window.tanuki?.setTucked(v);
}
window.tanuki?.onTuck(({ value, instant }) => setTucked(!!value, { instant, report: false }));
tuckBtn.addEventListener("click", () => setTucked(!tucked));

// --- hover / click-through / drag / resize ---------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovering = false, drag = null, resizing = null, uiTimer = 0;
const tanukiTargets = [];
t.root.traverse((o) => { if (o.isMesh && o.material.side !== THREE.BackSide && !o.material.transparent) tanukiTargets.push(o); });
tanukiTargets.push(t.paper);

function hitTest(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(tucked ? log.hitTargets : tanukiTargets, false).length > 0;
}
const overUI = (x, y) => !!document.elementFromPoint(x, y)?.closest("#ui");

// The buttons fade in while you hover the tanuki (or the log) and linger a moment after you leave,
// so you can reach them across the transparent gap.
function showUI(v) {
  clearTimeout(uiTimer);
  if (v) document.body.classList.add("ui");
  else uiTimer = setTimeout(() => document.body.classList.remove("ui"), 1400);
}

function setHover(v) {
  if (v === hovering) return;
  hovering = v;
  window.tanuki?.setHover(v);
  document.body.classList.toggle("hover", v);
  showUI(v);
  if (v) renderBubble();
}

addEventListener("mousemove", (e) => {
  if (resizing) return;
  if (drag) {
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    window.tanuki?.dragMove(dx, dy);
    return;
  }
  const onUI = overUI(e.clientX, e.clientY);
  setHover(onUI || hitTest(e.clientX, e.clientY));
});
document.addEventListener("mouseleave", () => { if (!drag && !resizing) setHover(false); });
addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !hovering || resizing || e.target.closest?.("#ui")) return;
  drag = { x: e.screenX, y: e.screenY, moved: false };
  window.tanuki?.dragStart();
});
addEventListener("mouseup", () => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  window.tanuki?.dragEnd();
  if (!moved) tucked ? setTucked(false) : anim.poke();
});
addEventListener("contextmenu", (e) => { e.preventDefault(); if (hovering) window.tanuki?.contextMenu(); });

// resize grip: drag up/left to grow, down/right to shrink (the bottom-right corner stays put)
grip.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  grip.setPointerCapture(e.pointerId);
  resizing = { x: e.screenX, y: e.screenY };
  document.body.classList.add("resizing");
  window.tanuki?.resizeStart();
});
grip.addEventListener("pointermove", (e) => {
  if (resizing) window.tanuki?.resizeMove(e.screenX - resizing.x, e.screenY - resizing.y);
});
const endResize = () => {
  if (!resizing) return;
  resizing = null;
  document.body.classList.remove("resizing");
  window.tanuki?.resizeEnd();
};
grip.addEventListener("pointerup", endResize);
grip.addEventListener("lostpointercapture", endResize);
grip.addEventListener("dblclick", () => window.tanuki?.resizeReset());

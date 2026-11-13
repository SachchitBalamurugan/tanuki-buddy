// The tanuki's hideout: a mossy log tied with a shimenawa rope, with a little hata flag on a bamboo pole.
// The flag's colour and how hard it flaps follow the status (green / yellow / red / napping).
import * as THREE from "three";
import { gsap } from "gsap";
import { toon, part, leafGeometry, PALETTE } from "./tanuki.js";
import { SIGN } from "./sign.js";

const WAVE = {
  working:  { amp: 0.05,  freq: 5.5, droop: 0.02 },
  approval: { amp: 0.085, freq: 12,  droop: 0.0 },
  done:     { amp: 0.035, freq: 3.2, droop: 0.03 },
  sleep:    { amp: 0.014, freq: 1.4, droop: 0.1 },
};
const MARK = { working: "進", approval: "確", done: "完", sleep: "休" };

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// cut end of the log: pale heartwood, wobbly growth rings, a crack, an ink rim
const capTexture = () => canvasTex(256, 256, (g) => {
  g.fillStyle = "#a77b4f"; g.fillRect(0, 0, 256, 256);
  g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.fillStyle = "#e3c597"; g.fill();
  for (let r = 14; r < 112; r += 13 + (r % 7)) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const rr = r + Math.sin(a * 3 + r) * 2.2 + Math.sin(a * 7) * 1.1;
      const x = 131 + Math.cos(a) * rr, y = 124 + Math.sin(a) * rr;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(150,104,62,${0.35 + (r % 3) * 0.1})`; g.lineWidth = 3; g.stroke();
  }
  g.strokeStyle = "rgba(110,72,40,0.55)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(131, 124); g.lineTo(170, 150); g.lineTo(196, 152); g.stroke();
  g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.strokeStyle = "#7a5534"; g.lineWidth = 16; g.stroke();
  g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.strokeStyle = "#4b403b"; g.lineWidth = 9; g.stroke();
});

const shadowTexture = () => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(40,30,20,0.36)"); gr.addColorStop(1, "rgba(40,30,20,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// The flag waves in the vertex shader; the pole-side edge stays pinned.
const FLAG_VERT = /* glsl */ `
  uniform float uPhase, uAmp, uDroop;
  varying vec2 vUv; varying float vShade; varying vec3 vW;
  void main() {
    vUv = uv;
    float u = uv.x;
    float ph = u * 7.0 - uPhase;
    vec3 p = position;
    p.z += sin(ph) * uAmp * u * 1.3;
    p.y += sin(ph * 0.6 + 1.3) * uAmp * 0.25 * u - uDroop * u * u;
    p.x -= uDroop * 0.4 * u * u;
    vShade = cos(ph) * u;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FLAG_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv; varying float vShade; varying vec3 vW;
  void main() {
    if (vW.y < -0.05) discard;
    vec4 c = texture2D(uMap, vUv);
    c.rgb *= 0.9 + 0.14 * vShade;
    gl_FragColor = vec4(c.rgb, 1.0);
    #include <colorspace_fragment>
  }`;

export function buildLog() {
  const C = PALETTE, R = 0.3, L = 1.9;
  const root = new THREE.Group();          // rises out of / sinks into the ground
  const body = new THREE.Group();          // the log itself, axis along x, rocks a little
  body.position.y = R;
  root.add(body);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L + 0.8, 1.0), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.05, 0.004, 0.05);
  root.add(shadow);

  // bark + cut ends
  part(body, new THREE.CylinderGeometry(R, R * 1.03, L, 32, 1, true), toon(0x8a6142, { fur: 1, side: THREE.DoubleSide }),
    { rot: [0, 0, Math.PI / 2], outline: 0.02 });
  const capMat = new THREE.MeshBasicMaterial({ map: capTexture() });
  [-1, 1].forEach((s) => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(s < 0 ? R * 1.03 : R, 40), capMat);
    cap.position.x = s * L / 2; cap.rotation.y = s * Math.PI / 2;
    body.add(cap);
  });

  // soft clumps of moss sitting along the top of the log
  const moss = [toon(0x7fa653, { fur: 1 }), toon(0x93b862, { fur: 1 }), toon(0x6d9448, { fur: 1 })];
  const blob = new THREE.SphereGeometry(1, 18, 12);
  [[-0.55, 5], [-0.05, 4], [0.62, 4]].forEach(([cx, n], ci) => {
    for (let i = 0; i < n; i++) {
      const r = 0.06 + ((i * 37 + ci * 11) % 5) * 0.012;
      const x = cx + (i - (n - 1) / 2) * 0.085, z = ((i * 53 + ci * 29) % 7 - 3) * 0.03;
      const y = Math.sqrt(Math.max(0, R * R - z * z)) - 0.01;   // sit on the curved bark
      part(body, blob, moss[(i + ci) % 3], { pos: [x, y, z], scale: [r * 1.25, r * 0.55, r], outline: 0.012 });
    }
  });

  // a tiny mushroom on the left end
  part(body, new THREE.CylinderGeometry(0.028, 0.036, 0.11, 10), C.cream, { pos: [-0.7, R + 0.05, 0.06], outline: 0.01 });
  const cap = part(body, new THREE.SphereGeometry(0.075, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9603f,
    { pos: [-0.7, R + 0.1, 0.06], scale: [1, 0.75, 1], outline: 0.012 });
  [[0.03, 0.05, 0.04], [-0.035, 0.045, 0.035], [0.0, 0.07, -0.01]].forEach((p) =>
    part(cap, new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfbf3df }), { pos: p, outline: 0 }));

  // shimenawa: a twisted straw rope with zig-zag shide paper hanging from it
  const straw = toon(0xd9c27c, { fur: 1 });
  [-0.38, -0.29].forEach((x) =>
    part(body, new THREE.TorusGeometry(R + 0.03, 0.038, 10, 44), straw, { pos: [x, 0, 0], rot: [0, Math.PI / 2, 0], outline: 0.014 }));
  const paperMat = new THREE.MeshBasicMaterial({ color: 0xfbf6ea, side: THREE.DoubleSide });
  const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.DoubleSide });
  [[0, 0], [0.026, -0.068], [0, -0.136]].forEach(([dx, dy]) => {
    const ink = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.088), inkMat);
    ink.position.set(-0.345 + dx, -0.02 + dy, R + 0.072);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.074), paperMat);
    paper.position.set(-0.345 + dx, -0.02 + dy, R + 0.078);
    body.add(ink, paper);
  });

  // a few grass blades bedding the log into the ground
  const grassMats = [0x8fbf63, 0x7aab55, 0xa3c978].map((c) => toon(c, { side: THREE.DoubleSide }));
  [[-0.85, 0.32, 4], [0.55, 0.36, 5], [1.05, 0.12, 3], [-0.2, 0.38, 3]].forEach(([x, z, n]) => {
    for (let i = 0; i < n; i++) {
      const blade = new THREE.Mesh(leafGeometry(0.14 + Math.random() * 0.12, 0.04), grassMats[i % 3]);
      blade.position.set(x + (i - n / 2) * 0.04, 0, z + Math.random() * 0.05);
      blade.rotation.set(0, Math.random() * 0.8 - 0.4, (i - (n - 1) / 2) * 0.32);
      root.add(blade);
    }
  });

  // bamboo pole + flag (the "mast" springs up when the tanuki hides)
  const mast = new THREE.Group();
  mast.position.set(0.42, R - 0.05, 0.02);
  mast.rotation.z = -0.06;
  body.add(mast);
  part(mast, new THREE.CylinderGeometry(0.024, 0.03, 1.2, 10), toon(0x95ae5e, { fur: 0.4 }), { pos: [0, 0.6, 0], outline: 0.012 });
  [0.26, 0.6, 0.94].forEach((y) =>
    part(mast, new THREE.TorusGeometry(0.026, 0.008, 6, 14), toon(0x6f8a45), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 }));
  part(mast, new THREE.SphereGeometry(0.04, 14, 10), toon(0xe0b84a), { pos: [0, 1.22, 0], outline: 0.012 });

  const FW = 0.66, FH = 0.44;
  const fc = document.createElement("canvas"); fc.width = 256; fc.height = 174;
  const flagTex = new THREE.CanvasTexture(fc); flagTex.colorSpace = THREE.SRGBColorSpace;
  const uniforms = { uMap: { value: flagTex }, uPhase: { value: 0 }, uAmp: { value: WAVE.sleep.amp }, uDroop: { value: WAVE.sleep.droop } };
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH, 20, 6).translate(FW / 2, 0, 0),
    new THREE.ShaderMaterial({ uniforms, vertexShader: FLAG_VERT, fragmentShader: FLAG_FRAG, side: THREE.DoubleSide }));
  flag.position.set(0.02, 1.17 - FH / 2, 0);
  mast.add(flag);

  function drawFlag(state) {
    const s = SIGN[state] || SIGN.sleep, g = fc.getContext("2d");
    g.fillStyle = s.paper; g.fillRect(0, 0, 256, 174);
    const gr = g.createRadialGradient(140, 80, 10, 128, 87, 170);
    gr.addColorStop(0, "rgba(255,250,235,0.3)"); gr.addColorStop(1, hexA(s.edge, 0.45));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 174);
    g.lineWidth = 14; g.strokeStyle = s.edge; g.strokeRect(9, 9, 238, 156);
    g.lineWidth = 7; g.strokeStyle = "#4b403b"; g.strokeRect(3, 3, 250, 168);
    g.beginPath(); g.arc(128, 87, 54, 0, Math.PI * 2); g.fillStyle = "rgba(255,252,242,0.88)"; g.fill();
    g.fillStyle = s.ink; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 76px "Yu Mincho", "YuMincho", "MS Mincho", serif`;
    g.fillText(MARK[state] || MARK.sleep, 128, 91);
    flagTex.needsUpdate = true;
  }

  let state = "sleep", freq = WAVE.sleep.freq, wiggle = 0;
  drawFlag(state);

  function setState(next) {
    if (!WAVE[next] || next === state) return;
    state = next;
    drawFlag(next);
    const w = WAVE[next];
    gsap.to(uniforms.uAmp, { value: w.amp, duration: 0.6 });
    gsap.to(uniforms.uDroop, { value: w.droop, duration: 0.8 });
    gsap.to({ f: freq }, { f: w.freq, duration: 0.6, onUpdate() { freq = this.targets()[0].f; } });
  }

  // called every frame
  function update(time, dt) {
    uniforms.uPhase.value += dt * freq;
    wiggle += ((state === "approval" ? 1 : 0) - wiggle) * Math.min(1, dt * 4);
    mast.rotation.z = -0.06 + Math.sin(time * 9) * 0.08 * wiggle;
    body.position.y = R + Math.abs(Math.sin(time * 4.5)) * 0.035 * wiggle;
  }

  const hitTargets = [];
  root.traverse((o) => { if (o.isMesh && o !== shadow && o.material.side !== THREE.BackSide) hitTargets.push(o); });

  return { root, body, mast, flag, hitTargets, setState, update };
}

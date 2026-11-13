// The forest tanuki, built entirely from primitives with hand-painted shading + soft ink outlines.
import * as THREE from "three";

export const PALETTE = {
  // soft, warm-grey fur and muted countryside pigments
  fur: 0x8e8a86, furLight: 0xa39f9a, dark: 0x4f4b4a, cream: 0xf0e8d7, nose: 0x2e2a29,
  eye: 0x1f1b1a, blush: 0xef9b92, leaf: 0x8cbf5e, leafDark: 0x557f3a, scarf: 0xc4553f,
  wood: 0xa77b4f, woodDark: 0x6f4f33, ink: 0x4b403b, grass: 0x8fbf63,
};
const FURRY = new Set([PALETTE.fur, PALETTE.furLight, PALETTE.dark, PALETTE.cream]);

// Hand-painted look: soft two-tone cel bands with wobbly watercolor edges, cool lilac
// shadows, warm sunlit highlights, pigment blotches, and brushed fur streaks.
const PAINT_VERT = /* glsl */ `
  varying vec3 vP; varying vec3 vN; varying vec3 vW;
  void main() {
    vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
    vP = position * s;                       // stable "paint space": doesn't swim when parts move
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const PAINT_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uFur; uniform vec3 uLightDir;
  varying vec3 vP; varying vec3 vN; varying vec3 vW;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    if (vW.y < -0.05) discard;                            // the ground: things sink out of sight
    vec3 n = normalize(gl_FrontFacing ? vN : -vN);
    vec3 v = normalize(cameraPosition - vW);
    float l = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
    float wob = (fbm(vP * 5.0) - 0.5) * 0.16;              // watercolor bleed on the shadow edge
    float lit = smoothstep(0.40, 0.50, l + wob);
    float sun = smoothstep(0.80, 0.90, l + wob * 0.8);
    vec3 shade = uColor * vec3(0.66, 0.66, 0.80);           // cool, lilac-blue shadow
    vec3 col = mix(shade, uColor, lit);
    col = mix(col, uColor * vec3(1.07, 1.05, 0.97) + vec3(0.025, 0.02, 0.0), sun * 0.8); // warm sunlight
    col *= 0.95 + 0.09 * fbm(vP * 2.6 + 3.1);               // pigment pooling
    float streak = noise(vP * vec3(55.0, 9.0, 55.0));      // brushed fur
    col *= 1.0 - uFur * 0.09 * smoothstep(0.45, 0.95, streak);
    col += uFur * 0.035 * smoothstep(0.75, 1.0, noise(vP * vec3(40.0, 7.0, 40.0) + 7.0));
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);        // soft sky bounce on the edges
    col += rim * vec3(0.06, 0.07, 0.09) * lit;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export const toon = (color, extra = {}) => new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(color) },
    uFur: { value: extra.fur ?? (FURRY.has(color) ? 1 : 0) },
    uLightDir: { value: new THREE.Vector3(-0.55, 0.85, 0.6).normalize() },
  },
  vertexShader: PAINT_VERT,
  fragmentShader: PAINT_FRAG,
  side: extra.side ?? THREE.FrontSide,
});

// Inverted-hull ink outline: push vertices out along their normals by a fixed amount.
const outlineCache = new Map();
function outlineMat(thickness) {
  const key = thickness.toFixed(4);
  if (!outlineCache.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${key};`);
    };
    m.customProgramCacheKey = () => "outline-" + key;
    outlineCache.set(key, m);
  }
  return outlineCache.get(key);
}

const sphere = (r) => new THREE.SphereGeometry(r, 40, 28);

/** Adds a toon mesh (+ optional outline) to `parent`. */
export function part(parent, geo, mat, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], outline = 0.02, name } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  if (name) m.name = name;
  if (outline) {
    const avg = (scale[0] + scale[1] + scale[2]) / 3;
    m.add(new THREE.Mesh(geo, outlineMat(outline / avg)));
  }
  parent.add(m);
  return m;
}

export function leafGeometry(len = 0.5, wid = 0.2) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * 0.25, wid * 0.9, len * 0.75, 0, len);
  s.bezierCurveTo(-wid * 0.9, len * 0.75, -wid, len * 0.25, 0, 0);
  return new THREE.ShapeGeometry(s, 16);
}

function makeLeaf(len, wid, color = PALETTE.leaf) {
  const g = new THREE.Group();
  const geo = leafGeometry(len, wid);
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PALETTE.leafDark, side: THREE.DoubleSide }));
  edge.scale.setScalar(1.12);
  edge.position.set(0, -len * 0.04, -0.004);
  const face = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide }));
  const vein = new THREE.Mesh(new THREE.PlaneGeometry(0.012, len * 0.85), new THREE.MeshBasicMaterial({ color: PALETTE.leafDark, side: THREE.DoubleSide }));
  vein.position.set(0, len * 0.45, 0.003);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, len * 0.25, 6), toon(PALETTE.leafDark));
  stem.position.y = -len * 0.1;
  g.add(edge, face, vein, stem);
  return g;
}

export function buildTanuki() {
  const C = PALETTE;
  const root = new THREE.Group();

  // --- ground: soft shadow + a few grass tufts -------------------------------
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(40,30,20,0.38)"); grad.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.15, 0.005, 0.1);
  root.add(shadow);
  // soft painted grass blades, a few clover-green tufts around the feet
  const grassMats = [0x8fbf63, 0x7aab55, 0xa3c978].map((c) => toon(c, { side: THREE.DoubleSide }));
  [[-0.95, 0.35, 4], [0.95, 0.55, 5], [-0.35, 0.78, 3], [1.4, 0.1, 4]].forEach(([x, z, n]) => {
    for (let i = 0; i < n; i++) {
      const blade = new THREE.Mesh(leafGeometry(0.2 + Math.random() * 0.16, 0.045), grassMats[i % 3]);
      blade.position.set(x + (i - n / 2) * 0.045, 0, z + Math.random() * 0.06);
      blade.rotation.set(0, Math.random() * 0.8 - 0.4, (i - (n - 1) / 2) * 0.32);
      root.add(blade);
    }
  });

  // --- torso (breathes) -------------------------------------------------------
  const torso = new THREE.Group();
  root.add(torso);
  part(torso, sphere(0.78), C.fur, { pos: [0, 0.78, 0], scale: [1, 0.95, 0.88] });
  part(torso, sphere(0.56), C.cream, { pos: [0, 0.7, 0.42], scale: [1, 1.05, 0.55], outline: 0.012 });
  // shrine-red scarf with a little knot
  part(torso, new THREE.TorusGeometry(0.56, 0.095, 14, 48), C.scarf, { pos: [0, 1.3, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], outline: 0.02 });
  part(torso, sphere(0.11), C.scarf, { pos: [0.28, 1.25, 0.47], outline: 0.02 });
  part(torso, new THREE.ConeGeometry(0.1, 0.32, 12), C.scarf, { pos: [0.34, 1.07, 0.5], rot: [0.2, 0, 0.35], outline: 0.02 });

  // feet
  [-1, 1].forEach((s) => part(root, sphere(0.24), C.dark, { pos: [s * 0.36, 0.1, 0.42], scale: [1, 0.6, 1.2] }));

  // --- tail (wags) ---------------------------------------------------------------
  const tail = new THREE.Group();
  tail.position.set(-0.55, 0.42, -0.42);
  root.add(tail);
  [[0, 0, 0, 0.26, C.fur], [-0.2, 0.14, -0.04, 0.27, C.dark], [-0.34, 0.33, -0.07, 0.25, C.fur], [-0.41, 0.54, -0.09, 0.22, C.dark], [-0.38, 0.73, -0.09, 0.17, C.dark]]
    .forEach(([x, y, z, r, col]) => part(tail, sphere(r), col, { pos: [x, y, z], outline: 0.02 }));

  // --- resting arm on belly ---------------------------------------------------
  const armRest = new THREE.Group();
  armRest.position.set(-0.6, 1.05, 0.25);
  root.add(armRest);
  part(armRest, sphere(0.16), C.dark, { pos: [0.08, -0.14, 0.12], scale: [1, 1.6, 1], rot: [0.3, 0, -0.75] });

  // --- sign arm: shoulder pivot -> paw -> stick -> board -------------------------
  const signArm = new THREE.Group();
  signArm.position.set(0.62, 1.1, 0.2);
  root.add(signArm);
  part(signArm, sphere(0.15), C.dark, { pos: [0.21, 0.11, 0.06], scale: [1, 1.75, 1], rot: [0, 0, -1.09] });
  part(signArm, new THREE.CylinderGeometry(0.045, 0.052, 1.9, 10), toon(C.wood, { fur: 0.7 }), { pos: [0.46, 0.6, -0.035], outline: 0.016 });
  part(signArm, sphere(0.15), C.dark, { pos: [0.44, 0.24, 0.16] }); // paw gripping the stick

  const board = new THREE.Group(); // flips around Y when the sign changes
  board.position.set(0.46, 1.6, 0.06);
  signArm.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.05, 0.08), toon(C.wood, { fur: 0.7 }));
  const frameInk = new THREE.Mesh(frame.geometry, new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }));
  frameInk.scale.set(1.025, 1.04, 1.4);
  board.add(frameInk, frame);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  paper.position.z = 0.042;
  board.add(paper);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), toon(C.woodDark));
  back.position.z = -0.042; back.rotation.y = Math.PI;
  board.add(back);
  [-1, 1].forEach((s) => part(board, sphere(0.035), C.woodDark, { pos: [s * 0.66, 0.42, 0.05], outline: 0 }));

  // --- head ---------------------------------------------------------------------
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0.05);
  root.add(head);
  part(head, sphere(0.62), C.furLight, { scale: [1.12, 0.9, 0.95] });
  part(head, sphere(0.27), C.cream, { pos: [0, -0.17, 0.46], scale: [1.35, 0.85, 0.8], outline: 0.014 });
  [-1, 1].forEach((s) => part(head, sphere(0.2), C.cream, { pos: [s * 0.56, -0.2, 0.16], scale: [1, 0.8, 0.8] }));
  [-1, 1].forEach((s) => part(head, sphere(0.19), C.dark, { pos: [s * 0.25, 0.0, 0.5], scale: [1.25, 0.85, 0.5], rot: [0, 0, s * 0.35], outline: 0 }));

  const eyesOpen = [], eyesClosed = [];
  const closedGeo = new THREE.TorusGeometry(0.065, 0.019, 8, 18, Math.PI);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.24, 0.02, 0.6);
    head.add(eye);
    part(eye, sphere(0.085), new THREE.MeshBasicMaterial({ color: C.eye }), { scale: [1, 1.15, 0.6], outline: 0 });
    part(eye, sphere(0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), { pos: [0.03, 0.045, 0.05], outline: 0 });
    part(eye, sphere(0.014), new THREE.MeshBasicMaterial({ color: 0xffffff }), { pos: [-0.03, -0.03, 0.05], outline: 0 });
    eyesOpen.push(eye);
    const closed = new THREE.Mesh(closedGeo, new THREE.MeshBasicMaterial({ color: C.eye }));
    closed.position.set(s * 0.24, 0.0, 0.62);
    closed.visible = false;
    head.add(closed);
    eyesClosed.push(closed);
  });

  part(head, sphere(0.075), C.nose, { pos: [0, -0.07, 0.7], scale: [1.3, 0.9, 0.9], outline: 0 });
  part(head, sphere(0.018), new THREE.MeshBasicMaterial({ color: 0xffffff }), { pos: [0.025, -0.045, 0.765], outline: 0 });
  const mouthGeo = new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI);
  [-1, 1].forEach((s) => {
    const m = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: C.nose }));
    m.position.set(s * 0.044, -0.16, 0.69); m.rotation.z = Math.PI;
    head.add(m);
  });
  const blushMat = new THREE.MeshBasicMaterial({ color: C.blush, transparent: true, opacity: 0.6 });
  [-1, 1].forEach((s) => part(head, sphere(0.09), blushMat, { pos: [s * 0.43, -0.14, 0.44], scale: [1.3, 0.7, 0.3], outline: 0 }));

  const ears = [-1, 1].map((s) => {
    const ear = new THREE.Group();
    ear.position.set(s * 0.42, 0.36, -0.02);
    ear.rotation.z = -s * 0.35;
    head.add(ear);
    part(ear, sphere(0.2), C.dark, { pos: [0, 0.12, 0], scale: [0.9, 1.05, 0.55] });
    part(ear, sphere(0.12), C.cream, { pos: [0, 0.1, 0.07], scale: [0.8, 0.9, 0.4], outline: 0 });
    return ear;
  });

  // the tanuki's famous leaf, perched on its head
  const leaf = makeLeaf(0.5, 0.2);
  leaf.position.set(-0.02, 0.5, 0.12);
  leaf.rotation.set(-0.2, 0.1, -0.3);
  head.add(leaf);

  return { root, torso, head, tail, armRest, signArm, board, paper, eyesOpen, eyesClosed, ears, leaf, makeLeaf };
}

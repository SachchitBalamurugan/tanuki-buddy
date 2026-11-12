// Fireflies and drifting leaves. Cheap: a handful of sprites/meshes updated per frame.
import * as THREE from "three";

export function createAmbience(scene, makeLeaf, { reduce = false } = {}) {
  const glow = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,210,1)"); gr.addColorStop(0.25, "rgba(230,255,140,0.8)"); gr.addColorStop(1, "rgba(200,255,120,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const flies = Array.from({ length: 9 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, color: 0xfff6a8 }));
    s.scale.setScalar(0.12 + Math.random() * 0.08);
    s.userData = {
      base: new THREE.Vector3(-1.3 + Math.random() * 3.2, 0.3 + Math.random() * 2.6, -0.8 + Math.random() * 1.2),
      phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.4,
    };
    scene.add(s);
    return s;
  });

  const leafColors = [0x9ccc65, 0xe0a33a, 0xd9653b];
  const leaves = Array.from({ length: 3 }, (_, i) => {
    const l = makeLeaf(0.18, 0.08, leafColors[i]);
    l.userData = { phase: Math.random() * 10, speed: 0.12 + Math.random() * 0.1, x: -1 + Math.random() * 2.6, y: 3.6 + i * 1.3 };
    scene.add(l);
    return l;
  });

  let mood = "sleep";
  const setMood = (m) => { mood = m; };

  function update(time, dt) {
    const night = mood === "sleep" ? 1 : mood === "done" ? 0.55 : 0.3;
    flies.forEach((f, i) => {
      const u = f.userData, t = time * u.speed + u.phase;
      f.position.set(u.base.x + Math.sin(t) * 0.25, u.base.y + Math.sin(t * 1.3) * 0.18, u.base.z + Math.cos(t * 0.7) * 0.2);
      const flicker = 0.5 + 0.5 * Math.sin(time * 2.2 + u.phase * 3);
      f.material.opacity = (i < 3 + night * 6 ? 1 : 0) * night * (0.35 + 0.65 * flicker);
    });
    leaves.forEach((l) => {
      const u = l.userData;
      if (reduce) { l.visible = false; return; }
      u.y -= dt * u.speed * (mood === "approval" ? 1.6 : 1);
      if (u.y < -0.3) { u.y = 3.7; u.x = -1 + Math.random() * 2.6; }
      const t = time * 0.9 + u.phase;
      l.position.set(u.x + Math.sin(t) * 0.35, u.y, 0.3 + Math.cos(t * 0.5) * 0.3);
      l.rotation.set(Math.sin(t * 1.3) * 0.9, t * 0.6, Math.cos(t) * 0.8);
    });
  }
  return { update, setMood };
}

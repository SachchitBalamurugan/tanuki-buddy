// All character motion: GSAP timelines driving Three.js object properties.
import * as THREE from "three";
import { gsap } from "gsap";

function textSprite(text, { bg = null, fg = "#3b2a20", size = 0.5, font = "900 150px 'Segoe UI', sans-serif" } = {}) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  if (bg) {
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2);
    g.fillStyle = bg; g.fill(); g.lineWidth = 14; g.strokeStyle = "#3b2a20"; g.stroke();
  }
  g.fillStyle = fg; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  s.scale.setScalar(size);
  return s;
}

// `stage` is the group that holds the tanuki (it sinks when hiding); `log` is the hideout from log.js.
export function createAnimator(t, stage, { reduce = false, log = null } = {}) {
  gsap.defaults({ ease: "sine.inOut" });
  const bang = textSprite("!", { bg: "#f7d35e", size: 0.55 });
  bang.position.set(-0.55, 2.95, 0.4);
  const note = textSprite("♪", { fg: "#3f7a32", size: 0.42, font: "900 190px 'Segoe UI Symbol', sans-serif" });
  const zs = [0, 1, 2].map(() => textSprite("z", { fg: "#7c6a8f", size: 0.32, font: "italic 900 170px 'Segoe UI', sans-serif" }));
  stage.add(bang, note, ...zs);

  let eyeMode = "open";
  function setEyes(mode) {
    eyeMode = mode;
    t.eyesOpen.forEach((e) => { e.visible = mode === "open"; });
    t.eyesClosed.forEach((e) => { e.visible = mode !== "open"; e.rotation.z = mode === "sleep" ? Math.PI : 0; });
  }

  // --- always-on life: breathing + blinking ----------------------------------------
  if (!reduce) {
    gsap.to(t.torso.scale, { y: 1.025, x: 0.99, z: 0.99, duration: 1.8, repeat: -1, yoyo: true });
    gsap.to(t.head.position, { y: "+=0.025", duration: 1.8, repeat: -1, yoyo: true });
    gsap.to(t.leaf.rotation, { z: "-=0.12", duration: 2.6, repeat: -1, yoyo: true });
  }
  (function blink() {
    if (eyeMode === "open") {
      gsap.timeline()
        .to(t.eyesOpen.map((e) => e.scale), { y: 0.1, duration: 0.07, ease: "power1.in" })
        .to(t.eyesOpen.map((e) => e.scale), { y: 1, duration: 0.1, ease: "power1.out" });
    }
    gsap.delayedCall(2.5 + Math.random() * 3.5, blink);
  })();

  // --- per-state choreography ------------------------------------------------------
  let current = null, master = null;

  function neutral(tl, armZ, armY) {
    tl.to(t.root.position, { y: 0, duration: 0.35, ease: "power2.out" }, 0)
      .to(t.root.rotation, { z: 0, duration: 0.4 }, 0)
      .to(t.head.rotation, { x: 0, y: 0, z: 0, duration: 0.5 }, 0)
      .to(t.tail.rotation, { z: 0, duration: 0.5 }, 0)
      .to(t.ears.map((e) => e.scale), { x: 1, y: 1, duration: 0.3 }, 0)
      .to(t.eyesOpen.map((e) => e.scale), { x: 1, y: 1, z: 1, duration: 0.2 }, 0)
      .to(t.signArm.rotation, { z: armZ, duration: 0.6, ease: "back.out(1.6)" }, 0)
      .to(t.signArm.position, { y: 1.1 + armY, duration: 0.6, ease: "back.out(1.6)" }, 0)
      .to([bang.material, note.material, ...zs.map((z) => z.material)], { opacity: 0, duration: 0.25 }, 0);
  }

  const states = {
    working(tl) {
      setEyes("open");
      neutral(tl, 0, 0);
      if (reduce) return;
      const loop = gsap.timeline({ repeat: -1, defaults: { duration: 1.1 } });
      loop.to(t.head.rotation, { z: 0.07, yoyo: true, repeat: 1 }, 0)
        .to(t.signArm.rotation, { z: 0.045, yoyo: true, repeat: 1 }, 0.15)
        .to(t.tail.rotation, { z: 0.15, yoyo: true, repeat: 1 }, 0)
        .to(t.head.rotation, { z: -0.07, yoyo: true, repeat: 1 }, 2.2)
        .to(t.signArm.rotation, { z: -0.045, yoyo: true, repeat: 1 }, 2.35)
        .to(t.tail.rotation, { z: -0.12, yoyo: true, repeat: 1 }, 2.2)
        .fromTo(note.position, { x: -0.55, y: 2.45 }, { x: -0.8, y: 3.15, duration: 2.2, ease: "power1.out" }, 0.4)
        .fromTo(note.material, { opacity: 0 }, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1, repeatDelay: 1.2 }, 0.4)
        .fromTo(note.material, { rotation: -0.2 }, { rotation: 0.25, duration: 2.2 }, 0.4);
      tl.add(loop, 0.6);
    },

    approval(tl) {
      setEyes("open");
      neutral(tl, 0.05, 0.08);
      tl.to(t.eyesOpen.map((e) => e.scale), { x: 1.15, y: 1.2, duration: 0.25, ease: "back.out(3)" }, 0)
        .to(t.ears.map((e) => e.scale), { y: 1.18, duration: 0.25, ease: "back.out(3)" }, 0)
        .fromTo(bang.scale, { x: 0.01, y: 0.01 }, { x: 0.55, y: 0.55, duration: 0.5, ease: "elastic.out(1, 0.45)" }, 0.1)
        .to(bang.material, { opacity: 1, duration: 0.15 }, 0.1);
      if (reduce) return;
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      loop.to(t.torso.scale, { y: 0.93, x: 1.05, duration: 0.12, ease: "power2.in" })
        .to(t.root.position, { y: 0.2, duration: 0.24, ease: "power2.out" })
        .to(t.torso.scale, { y: 1.03, x: 0.98, duration: 0.24, ease: "power2.out" }, "<")
        .to(t.root.position, { y: 0, duration: 0.22, ease: "power2.in" })
        .to(t.torso.scale, { y: 0.94, x: 1.05, duration: 0.08, ease: "power2.out" })
        .to(t.torso.scale, { y: 1, x: 1, duration: 0.25, ease: "back.out(2)" })
        .to(t.signArm.rotation, { z: -0.14, duration: 0.18, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0)
        .to(bang.scale, { x: 0.62, y: 0.62, duration: 0.18, yoyo: true, repeat: 1 }, 0.3)
        .to(bang.position, { y: 3.05, duration: 0.18, yoyo: true, repeat: 1 }, 0.3);
      tl.add(loop, 0.5);
    },

    done(tl) {
      neutral(tl, -0.06, -0.08);
      setEyes("happy");
      if (!reduce) {
        tl.to(t.torso.scale, { y: 1.1, x: 0.96, duration: 0.45, ease: "power2.out" }, 0.1)
          .to(t.head.rotation, { x: -0.18, duration: 0.45, ease: "power2.out" }, 0.1)
          .to(t.torso.scale, { y: 1, x: 1, duration: 0.6, ease: "back.out(2)" }, 0.65)
          .to(t.head.rotation, { x: 0, duration: 0.6 }, 0.65);
      }
      tl.call(() => setEyes("open"), null, 2.6);
      if (reduce) return;
      const loop = gsap.timeline({ repeat: -1 });
      loop.to(t.head.rotation, { x: 0.07, duration: 1.6, yoyo: true, repeat: 1 })
        .to(t.tail.rotation, { z: 0.1, duration: 1.6, yoyo: true, repeat: 1 }, 0);
      tl.add(loop, 1.3);
    },

    sleep(tl) {
      neutral(tl, -0.08, -0.25);
      setEyes("sleep");
      tl.to(t.head.rotation, { z: 0.22, x: 0.15, duration: 1.2, ease: "power2.inOut" }, 0)
        .to(t.ears.map((e) => e.scale), { y: 0.85, duration: 0.8 }, 0);
      if (reduce) return;
      const loop = gsap.timeline({ repeat: -1 });
      zs.forEach((z, i) => {
        loop.fromTo(z.position, { x: -0.35, y: 2.35, z: 0.4 }, { x: -0.75 - i * 0.05, y: 3.1, duration: 2.4, ease: "power1.out" }, i * 0.8)
          .fromTo(z.material, { opacity: 0 }, { opacity: 0.9, duration: 0.5, yoyo: true, repeat: 1, repeatDelay: 1.4 }, i * 0.8)
          .fromTo(z.scale, { x: 0.15, y: 0.15 }, { x: 0.34, y: 0.34, duration: 2.4 }, i * 0.8);
      });
      tl.add(loop, 0.8);
    },
  };

  function setState(state) {
    if (state === current || !states[state]) return;
    current = state;
    master?.kill();
    master = gsap.timeline();
    states[state](master);
  }

  // flip the sign board around, swapping the face at the halfway point
  function flipSign(redraw) {
    if (reduce) return redraw();
    gsap.timeline()
      .to(t.board.rotation, { y: Math.PI / 2, duration: 0.16, ease: "power2.in", onComplete: redraw })
      .to(t.board.rotation, { y: 0, duration: 0.45, ease: "back.out(2.2)" });
  }

  // a little giggle when you click it
  function poke() {
    const was = eyeMode;
    gsap.timeline()
      .call(() => setEyes("happy"))
      .to(t.root.position, { y: 0.18, duration: 0.16, ease: "power2.out" })
      .to(t.root.position, { y: 0, duration: 0.2, ease: "bounce.out" })
      .to(t.root.rotation, { z: 0.08, duration: 0.1, yoyo: true, repeat: 3 }, 0)
      .call(() => setEyes(was === "sleep" && current !== "sleep" ? "open" : current === "sleep" ? "sleep" : "open"), null, 0.9);
  }

  // hide under the log (or pop back out). Ground clipping in the shaders makes the tanuki vanish below y=0.
  const HIDDEN_Y = -3.6, BACK_Z = -0.8; // dive down *behind* the log, not through it
  let tuckTl = null;
  function tuck(hide, instant = false) {
    if (!log) return;
    tuckTl?.kill();
    gsap.killTweensOf([stage.position, stage.scale, log.root.position, log.mast.scale, log.body.rotation]);
    if (instant || reduce) {
      stage.visible = !hide; log.root.visible = hide;
      stage.position.y = hide ? HIDDEN_Y : 0;
      stage.position.z = hide ? BACK_Z : 0;
      stage.scale.setScalar(hide ? 0.6 : 1);
      log.root.position.y = hide ? 0 : -0.8;
      log.mast.scale.setScalar(hide ? 1 : 0.001);
      log.body.rotation.x = 0;
      return;
    }
    const tiny = { x: 0.001, y: 0.001, z: 0.001 };
    tuckTl = gsap.timeline();
    if (hide) {
      tuckTl.set(log.root, { visible: true }, 0)
        .set(log.mast.scale, tiny, 0)
        .fromTo(log.root.position, { y: -0.8 }, { y: 0, duration: 0.45, ease: "back.out(1.7)" }, 0)  // log pops up
        .to(stage.position, { y: 0.25, z: BACK_Z, duration: 0.2, ease: "power2.out" }, 0.18)         // little hop back…
        .to(stage.position, { y: HIDDEN_Y, duration: 0.45, ease: "power3.in" }, 0.38)                 // …and dive!
        .to(stage.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 0.45, ease: "power2.in" }, 0.38)
        .to(log.body.rotation, { x: 0.06, duration: 0.07, yoyo: true, repeat: 3 }, 0.7)                // log jostles
        .set(stage, { visible: false }, 0.85)
        .to(log.mast.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: "elastic.out(1, 0.5)" }, 0.8);  // flag springs up
    } else {
      tuckTl.set(stage, { visible: true }, 0)
        .to(log.mast.scale, { ...tiny, duration: 0.22, ease: "back.in(2)" }, 0)
        .fromTo(stage.position, { y: HIDDEN_Y, z: BACK_Z }, { y: 0, duration: 0.6, ease: "back.out(1.3)" }, 0.15)
        .to(stage.position, { z: 0, duration: 0.35, ease: "power2.inOut" }, 0.8)                      // step forward once the log is gone
        .fromTo(stage.scale, { x: 0.6, y: 0.6, z: 0.6 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: "back.out(1.3)" }, 0.15)
        .to(log.root.position, { y: -0.8, duration: 0.35, ease: "power2.in" }, 0.45)
        .set(log.root, { visible: false }, 0.8);
    }
  }

  return { setState, flipSign, poke, tuck, get state() { return current; } };
}

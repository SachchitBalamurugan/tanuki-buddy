// A synthesized fūrin (glass wind-bell): inharmonic sine partials with long decays.
let ctx;
const audio = () => (ctx ||= new AudioContext());

function strike(at, base, gain) {
  const ac = audio();
  const out = ac.createGain(); out.gain.value = gain; out.connect(ac.destination);
  [[1, 0.5, 2.6], [2.76, 0.24, 1.8], [5.4, 0.1, 1.1], [8.93, 0.05, 0.7]].forEach(([mult, amp, decay]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.value = base * mult * (1 + (Math.random() - 0.5) * 0.004);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(out);
    o.start(at); o.stop(at + decay + 0.05);
  });
  // the paper strip's tiny clapper "tick"
  const len = Math.floor(ac.sampleRate * 0.02);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), ng = ac.createGain();
  hp.type = "highpass"; hp.frequency.value = 3000; ng.gain.value = 0.12;
  n.buffer = buf; n.connect(hp).connect(ng).connect(out); n.start(at);
}

export function chime(kind) {
  try {
    const ac = audio();
    if (ac.state === "suspended") ac.resume();
    const now = ac.currentTime + 0.02;
    const jitter = 1 + (Math.random() - 0.5) * 0.05;
    if (kind === "approval") {
      strike(now, 1760 * jitter, 0.22);
      strike(now + 0.28, 2093 * jitter, 0.18);
    } else if (kind === "done") {
      strike(now, 1318 * jitter, 0.14);
    }
  } catch { /* audio is a nicety */ }
}

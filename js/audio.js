// Engine note and tyre noise, synthesized so there are no sound files to download.
export class Audio {
  constructor() { this.ctx = null; this.muted = false; }
  start() {
    if (this.ctx) { this.ctx.resume && this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx, master = c.createGain(); master.gain.value = this.muted ? 0 : 0.5; master.connect(c.destination);
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 3;
    const g = c.createGain(); g.gain.value = 0; o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(master); o1.start(); o2.start();
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 5;
    const sg = c.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(master); ns.start();
    this.n = { master, o1, o2, filt, g, sg, buf };
  }
  setMuted(m) { this.muted = m; if (this.n) this.n.master.gain.value = m ? 0 : 0.5; }
  suspend() { this.ctx && this.ctx.suspend && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume && this.ctx.resume(); }
  update(car, throttle, paused) {
    if (!this.n) return;
    const t = this.ctx.currentTime, x = car.rpm / car.spec.redline;
    if (!Number.isFinite(x)) return;
    const fr = 40 + x * 150 + (car.limiter ? Math.random() * 12 : 0);
    this.n.o1.frequency.setTargetAtTime(fr, t, 0.03); this.n.o2.frequency.setTargetAtTime(fr, t, 0.03);
    this.n.filt.frequency.setTargetAtTime(400 + x * 1300 + throttle * 600 + (car.nos ? 700 : 0), t, 0.06);
    this.n.g.gain.setTargetAtTime(paused ? 0 : 0.05 + throttle * 0.07, t, 0.08);
    this.n.sg.gain.setTargetAtTime(paused ? 0 : (car.drifting ? Math.min(0.1, Math.abs(car.l) * 0.012) : 0), t, 0.05);
  }
  thump(v) {
    if (!this.n || this.muted) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.n.buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(Math.min(0.8, v * 0.05), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.45);
    s.connect(f); f.connect(g); g.connect(this.n.master); s.start(); s.stop(c.currentTime + 0.5);
  }
  blip(freq, dur = 0.15, type = 'square', vol = 0.1) {
    if (!this.n || this.muted) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.n.master); o.start(); o.stop(c.currentTime + dur);
  }
}

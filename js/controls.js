import { clamp, DEG } from './util.js';

/* Tilt, touch and keyboard all feed one input object:
   steer -1..1 (+ = left), throttle 0..1, brake 0..1, nos, drift, and gear shift events. */
export class Controls {
  constructor() {
    this.mode = 'tilt';             // 'tilt' or 'touch'
    this.tilt = { listening: false, ok: false, roll: 0, pitch: 0, roll0: 0, pitch0: 0, last: 0 };
    this.btn = { left: 0, right: 0, gas: 0, brake: 0, nos: 0, drift: 0 };
    this.keys = { left: 0, right: 0, gas: 0, brake: 0, nos: 0, drift: 0 };
    this.out = { steer: 0, throttle: 0, brake: 0, nos: false, drift: false };
    this.shifts = [];
    this.invert = false;
    this.sens = 1; this.dz = 2.5; // tilt sensitivity and dead zone, set in Settings
    this._bindKeys();
  }

  async enableTilt() {
    try {
      const DOE = window.DeviceOrientationEvent;
      if (!DOE) return false;
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
      if (!this.tilt.listening) { window.addEventListener('deviceorientation', e => this._orient(e)); this.tilt.listening = true; }
      // wait briefly for a first reading; desktops never send one
      await new Promise(r => setTimeout(r, 600));
      return this.tilt.ok;
    } catch (e) { return false; }
  }
  _screenAngle() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    return ((a % 360) + 360) % 360;
  }
  _orient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * DEG, g = e.gamma * DEG;
    // "up" direction in the phone's own coordinates
    const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    // screen axes in phone coordinates for the current rotation
    const a = this._screenAngle();
    let rx = 1, ry = 0; // screen right
    if (a === 90) { rx = 0; ry = -1; } else if (a === 270) { rx = 0; ry = 1; } else if (a === 180) { rx = -1; ry = 0; }
    const sx = ux * rx + uy * ry;
    this.tilt.roll = Math.asin(clamp(sx, -1, 1));   // phone turned like a steering wheel
    this.tilt.pitch = Math.asin(clamp(uz, -1, 1));  // screen tipped back (toward the sky) or forward
    this.tilt.ok = true; this.tilt.last = performance.now();
  }
  calibrate() { this.tilt.roll0 = this.tilt.roll; this.tilt.pitch0 = this.tilt.pitch; }
  get tiltLive() { return this.tilt.ok && performance.now() - this.tilt.last < 1500; }

  // Each finger presses whatever button is under it, and slides from one to the next
  // without lifting, like real pedals and a gear lever under your thumbs.
  bindButtons(root) {
    const fingers = new Map(); // pointer id -> button element
    const keyEl = (x, y) => { const el = document.elementFromPoint(x, y); return el && root.contains(el) ? el.closest('[data-k]') : null; };
    const press = el => {
      el.classList.add('on'); const k = el.dataset.k;
      if (k === 'up' || k === 'down') { this.shifts.push(k === 'up' ? 1 : -1); navigator.vibrate && navigator.vibrate(8); }
      else this.btn[k] = (this.btn[k] || 0) + 1;
    };
    const release = el => {
      const k = el.dataset.k;
      if (k in this.btn) this.btn[k] = Math.max(0, this.btn[k] - 1);
      if (![...fingers.values()].includes(el)) el.classList.remove('on');
    };
    const move = e => {
      if (!fingers.has(e.pointerId)) return;
      const was = fingers.get(e.pointerId), now = keyEl(e.clientX, e.clientY);
      if (now === was) return;
      if (now) fingers.set(e.pointerId, now); else fingers.set(e.pointerId, null);
      if (was) release(was);
      if (now) press(now);
    };
    const up = e => { if (!fingers.has(e.pointerId)) return; const was = fingers.get(e.pointerId); fingers.delete(e.pointerId); if (was) release(was); };
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest && e.target.closest('[data-k]'); if (!el || !root.contains(el)) return;
      e.preventDefault();
      try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      fingers.set(e.pointerId, el); press(el);
    });
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', e => e.preventDefault());
    this._fingers = fingers;
  }
  _bindKeys() {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'nos', ShiftRight: 'nos', Space: 'drift' };
    addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (map[e.code]) { this.keys[map[e.code]] = 1; e.preventDefault(); }
      if (!e.repeat && (e.code === 'KeyE' || e.code === 'KeyX')) this.shifts.push(1);
      if (!e.repeat && (e.code === 'KeyQ' || e.code === 'KeyZ')) this.shifts.push(-1);
    });
    addEventListener('keyup', e => { if (map[e.code]) this.keys[map[e.code]] = 0; });
  }
  clear() { for (const o of [this.btn, this.keys]) for (const k in o) o[k] = 0; this.shifts.length = 0; this._fingers && this._fingers.clear(); document.querySelectorAll('.on[data-k]').forEach(el => el.classList.remove('on')); }

  update(dt) {
    const o = this.out, k = this.keys, b = this.btn;
    let steer = (k.left || b.left ? 1 : 0) - (k.right || b.right ? 1 : 0);
    let thr = (k.gas || b.gas) ? 1 : 0, brk = (k.brake || b.brake) ? 1 : 0;
    if (this.mode === 'tilt' && this.tiltLive) {
      const t = this.tilt;
      const roll = (t.roll - t.roll0) / DEG, pitch = ((t.pitch - t.pitch0) / DEG) * (this.invert ? -1 : 1);
      const dz = this.dz;
      const sr = Math.abs(roll) < dz ? 0 : (roll - Math.sign(roll) * dz) * this.sens / 24;
      if (!steer) steer = clamp(sr, -1, 1);
      // tip the top of the phone away from you to accelerate, toward you to brake
      if (!thr) thr = clamp((pitch - 3) / 16, 0, 1);
      if (!brk) brk = clamp((-pitch - 4) / 14, 0, 1);
    }
    const a = Math.min(1, dt * 14);
    // buttons are all-or-nothing, so ease the wheel in like a thumb rolling onto it
    o.steer += (steer - o.steer) * (this.mode === 'tilt' ? a : Math.min(1, dt * (steer ? 5 : 9))); o.throttle += (thr - o.throttle) * a; o.brake += (brk - o.brake) * a;
    o.nos = !!(k.nos || b.nos); o.drift = !!(k.drift || b.drift);
    return o;
  }
}

import * as THREE from 'three';
import { clamp } from './util.js';

/* Original cars. Brands and names are invented for this game. */
export const CARS = {
  zephyr: { id: 'zephyr', brand: 'Hikari', name: 'Zephyr', cls: 'Tuner coupe', price: 0, top: 54, accel: 15, grip: 7, turn: 2.5, redline: 8200,
    L: 4.3, Wd: 1.86, H: 0.5, cab: [0.8, 0.46, 0.44, -0.2], spoiler: 'wing', scoop: false, stripe: true },
  vandal: { id: 'vandal', brand: 'Brannock', name: 'Vandal', cls: 'Muscle', price: 4000, top: 61, accel: 17.5, grip: 5.8, turn: 2.25, redline: 6900,
    L: 4.8, Wd: 2.0, H: 0.56, cab: [0.8, 0.44, 0.36, -0.65], spoiler: 'lip', scoop: true, stripe: true },
  strix: { id: 'strix', brand: 'Ravelle', name: 'Strix', cls: 'Mid-engine exotic', price: 9000, top: 71, accel: 21, grip: 8, turn: 2.7, redline: 8800,
    L: 4.55, Wd: 2.06, H: 0.42, cab: [0.72, 0.4, 0.38, 0.05], spoiler: 'ducktail', scoop: false, stripe: false }
};
export const RATIOS = [3.4, 2.3, 1.7, 1.32, 1.06, 0.88];
const IDLE = 900;

/* ---------------- model ---------------- */
let shared = null;
function sharedParts(T) {
  if (shared) return shared;
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 16); wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8); rimGeo.rotateZ(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.13, 1, 8); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -0.5);
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
  shared = {
    wheelGeo, rimGeo, flameGeo,
    wheelMat: new THREE.MeshLambertMaterial({ color: 0x0b0b10 }),
    rimMat: new THREE.MeshPhongMaterial({ color: 0xb8bccc, shininess: 90 }),
    glassMat: new THREE.MeshPhongMaterial({ color: 0x0d1015, shininess: 120, specular: 0x998877 }),
    headMat: new THREE.MeshBasicMaterial({ color: 0xfff3d6 }),
    darkMat: new THREE.MeshLambertMaterial({ color: 0x111116 }),
    shadowMat: new THREE.MeshBasicMaterial({ map: T.glow, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
    flameMat: new THREE.MeshBasicMaterial({ color: 0x66ccff, ...add }),
    beamMat: new THREE.MeshBasicMaterial({ map: T.beam, opacity: 0.36, ...add }),
    add
  };
  return shared;
}
function taper(w, h, l, top, fr, rr) {
  const g = new THREE.BoxGeometry(w, h, l), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) { p.setX(k, p.getX(k) * top); const z = p.getZ(k); p.setZ(k, z > 0 ? z - fr : z + rr); }
  g.computeVertexNormals(); return g;
}
function box(w, h, l, mat, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); parent.add(m); return m; }
function plane(w, l, mat, y, z, parent) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); parent.add(m); return m; }

export function buildCar(spec, paint, glow, T, { beam = true } = {}) {
  const S = sharedParts(T);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const pc = new THREE.Color(paint);
  const pm = new THREE.MeshPhongMaterial({ color: pc, shininess: 90, specular: 0x777777, emissive: pc.clone().multiplyScalar(0.12) });
  const { L, Wd, H } = spec, base = 0.36, top = base + H;
  const ch = new THREE.Mesh(taper(Wd, H, L, 0.94, 0.3, 0.12), pm); ch.position.y = base + H / 2; body.add(ch);
  const [cw, chh, cl, cz] = spec.cab;
  const cab = new THREE.Mesh(taper(Wd * cw, chh, L * cl + 0.6, 0.8, 0.45, 0.35), S.glassMat); cab.position.set(0, top + chh / 2 - 0.02, cz); body.add(cab);
  box(Wd * cw * 0.78, 0.05, L * cl - 0.3, pm, 0, top + chh - 0.01, cz - 0.05, body);
  if (spec.spoiler === 'wing') { box(Wd * 0.96, 0.06, 0.42, pm, 0, top + 0.48, -L / 2 + 0.28, body); box(0.06, 0.46, 0.14, S.darkMat, Wd * 0.3, top + 0.22, -L / 2 + 0.3, body); box(0.06, 0.46, 0.14, S.darkMat, -Wd * 0.3, top + 0.22, -L / 2 + 0.3, body); }
  if (spec.spoiler === 'lip') box(Wd * 0.82, 0.09, 0.2, pm, 0, top + 0.04, -L / 2 + 0.14, body);
  if (spec.spoiler === 'ducktail') { const d = box(Wd * 0.86, 0.14, 0.36, pm, 0, top + 0.05, -L / 2 + 0.2, body); d.rotation.x = -0.35; }
  if (spec.scoop) { box(0.72, 0.15, 0.95, pm, 0, top + 0.06, L / 2 - 1.25, body); box(0.5, 0.08, 0.04, S.darkMat, 0, top + 0.08, L / 2 - 0.78, body); }
  if (spec.stripe) {
    const sm = new THREE.MeshPhongMaterial({ color: pc.getHSL({}).l > 0.6 ? 0x15131f : 0xf3f0ff, shininess: 60 });
    box(0.16, 0.02, L * 0.9, sm, 0.16, top + 0.005, 0, body); box(0.16, 0.02, L * 0.9, sm, -0.16, top + 0.005, 0, body);
  }
  box(Wd * 0.98, 0.06, 0.3, S.darkMat, 0, base + 0.02, L / 2 - 0.1, body);
  box(0.08, 0.12, L * 0.6, S.darkMat, Wd / 2, base + 0.04, 0, body); box(0.08, 0.12, L * 0.6, S.darkMat, -Wd / 2, base + 0.04, 0, body);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x7a0010 });
  for (const s of [1, -1]) { box(0.44, 0.12, 0.05, S.headMat, s * (Wd / 2 - 0.36), base + H * 0.62, L / 2 - 0.12, body); box(0.52, 0.1, 0.05, tailMat, s * (Wd / 2 - 0.38), base + H * 0.68, -L / 2 + 0.03, body); }
  box(Wd * 0.5, 0.05, 0.05, tailMat, 0, base + H * 0.68, -L / 2 + 0.03, body);
  const wheels = [], pivots = [];
  for (const [x, z, front] of [[Wd / 2 - 0.1, L / 2 - 0.85, 1], [-(Wd / 2 - 0.1), L / 2 - 0.85, 1], [Wd / 2 - 0.1, -L / 2 + 0.82, 0], [-(Wd / 2 - 0.1), -L / 2 + 0.82, 0]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.37, z); g.add(piv);
    const w = new THREE.Group(); w.add(new THREE.Mesh(S.wheelGeo, S.wheelMat)); w.add(new THREE.Mesh(S.rimGeo, S.rimMat)); piv.add(w);
    wheels.push(w); if (front) pivots.push(piv);
  }
  plane(Wd + 0.8, L + 0.9, S.shadowMat, 0.045, 0, g);
  if (glow) plane(Wd + 1.8, L + 2, new THREE.MeshBasicMaterial({ map: T.glow, color: glow, ...S.add }), 0.07, 0, g);
  if (beam) plane(10, 24, S.beamMat, 0.065, L / 2 + 11.8, g);
  const flames = [];
  for (const s of [1, -1]) { const f = new THREE.Mesh(S.flameGeo, S.flameMat); f.position.set(s * 0.35, base + 0.12, -L / 2); f.visible = false; g.add(f); flames.push(f); }
  // inertia barrier: an invisible shell that shimmers when something hits it too fast
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shellMat);
  shell.scale.set(Wd * 0.8, 0.95, L * 0.62); shell.position.y = 0.75; g.add(shell);
  return { g, body, wheels, pivots, tailMat, flames, shell };
}

/* ---------------- driving model ---------------- */
export class Car {
  constructor(spec) { this.setSpec(spec); this.reset(0, 0, 0); this.auto = false; }
  setSpec(spec) { this.spec = spec; this.k = spec.redline / (spec.top * RATIOS[5]); }
  reset(x, z, h) {
    Object.assign(this, { x, z, h, vx: 0, vz: 0, f: 0, l: 0, steer: 0, gear: 1, rpm: IDLE, shiftT: 0, nitro: 0.6, nos: false, braking: false,
      reverse: false, limiter: false, barrier: 0, drifting: false });
  }
  shift(d) {
    if (this.reverse) return;
    const g = clamp(this.gear + d, 1, 6);
    if (g !== this.gear) { this.gear = g; this.shiftT = 0.16; return true; }
    return false;
  }
  torque(x) { return clamp(0.38 + 1.3 * x - 0.85 * x * x, 0.22, 1); }
  // in = { steer -1..1 (+ = left), throttle 0..1, brake 0..1, nos, drift }
  step(dt, inp, locked) {
    const s = this.spec, fx = Math.sin(this.h), fz = Math.cos(this.h);
    let f = this.vx * fx + this.vz * fz, l = this.vx * fz - this.vz * fx;
    const thr = locked ? 0 : inp.throttle, brk = locked ? 0 : inp.brake, hb = !locked && inp.drift;
    // reverse when stopped and holding the brake
    if (!locked && brk > 0.3 && f < 0.6 && thr < 0.1) this.reverse = true;
    if (thr > 0.1 && f > -0.6) this.reverse = false;
    const ratio = RATIOS[this.gear - 1];
    this.rpm = this.reverse ? IDLE + Math.abs(f) * 3.4 * this.k : Math.max(IDLE, Math.abs(f) * ratio * this.k);
    if (this.auto && !this.reverse) {
      if (this.rpm > s.redline * 0.93 && this.gear < 6) this.shift(1);
      else if (this.rpm < s.redline * 0.42 && this.gear > 1) this.shift(-1);
    }
    const nos = !locked && inp.nos && this.nitro > 0.01 && f > 4 && thr > 0.1;
    this.limiter = this.rpm >= s.redline && !this.reverse;
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.reverse) {
      if (brk > 0.1) f = Math.max(-10, f - 7 * brk * dt);
      if (thr > 0.1 && f < 0) f += 20 * thr * dt;
    } else {
      if (thr > 0 && this.shiftT <= 0 && !this.limiter) {
        const x = this.rpm / s.redline;
        f += s.accel * 1.25 * this.torque(x) * Math.pow(ratio / RATIOS[0], 0.6) * thr * (nos ? 1.7 : 1) * dt;
      }
      if (brk > 0) f = f > 0.5 ? f - 30 * brk * dt : Math.max(0, f - 6 * dt);
    }
    if (this.limiter) this.rpm = s.redline * (0.97 + Math.random() * 0.03);
    // rolling resistance and air drag
    const roll = (1.1 + Math.abs(f) * 0.03) * dt * (thr > 0 ? 0.4 : 1);
    f = Math.abs(f) < roll ? 0 : f - Math.sign(f) * roll;
    f -= Math.sign(f) * f * f * (s.accel * 0.32 / (s.top * s.top)) * dt;
    if (hb) f -= f * 0.5 * dt;
    const sp = Math.abs(f);
    let grip = s.grip;
    if (hb) grip = 1.1; else if (this.drifting && thr > 0.4 && Math.abs(l) > 2) grip = s.grip * 0.42;
    l *= Math.exp(-grip * dt);
    this.steer += (inp.steer - this.steer) * Math.min(1, dt * 8);
    const spdF = clamp(sp / 7, 0, 1) * (1 - 0.42 * clamp(sp / s.top, 0, 1));
    const yaw = this.steer * s.turn * spdF * (f >= 0 ? 1 : -1) * (hb ? 1.45 : 1);
    this.nitro = nos ? Math.max(0, this.nitro - 0.27 * dt) : Math.min(1, this.nitro + 0.01 * dt);
    this.vx = f * fx + l * fz; this.vz = f * fz - l * fx; this.h += yaw * dt;
    if (locked) { this.vx = this.vz = 0; f = l = 0; }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.f = f; this.l = l; this.nos = nos; this.braking = (brk > 0.2 && f > 0.5) || hb;
    this.drifting = Math.abs(l) > 3 && sp > 9 && !locked;
    if (this.barrier > 0) this.barrier = Math.max(0, this.barrier - dt * 2.2);
  }
  hit(speed) { if (speed > 3) this.barrier = Math.min(1, 0.35 + speed * 0.05); }
  get kmh() { return Math.abs(this.f) * 3.6; }
  get gearLabel() { return this.reverse ? 'R' : String(this.gear); }
}

export function syncModel(m, car, dt) {
  m.g.position.set(car.x, 0, car.z); m.g.rotation.y = car.h;
  m.body.rotation.z = clamp(-car.l * 0.012, -0.08, 0.08);
  for (const w of m.wheels) w.rotation.x += car.f * dt / 0.37;
  for (const p of m.pivots) p.rotation.y = car.steer * 0.45;
  m.tailMat.color.setHex(car.braking || car.reverse ? 0xff2030 : 0x7a0010);
  for (const f of m.flames) { f.visible = car.nos; f.scale.set(1, 1, 0.7 + Math.random() * 0.7); }
  m.shell.material.opacity = car.barrier * 0.55;
  m.shell.rotation.y += dt * 2;
}

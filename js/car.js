import * as THREE from 'three';
import { clamp } from './util.js';
import { SHAPES, buildBody } from './carmodel.js';
import { liveryTexture, addDecals } from './livery.js';

/* Cars. Brands and names are invented for this game; each one is
   inspired by a real street car (see carmodel.js) without copying badges.
   starter: true means you can pick it as your first car. */
export const CARS = {
  kaze: { id: 'kaze', brand: 'Hikari', name: 'Kaze', cls: 'Drift coupe', starter: true, price: 3000, top: 52, accel: 13.6, grip: 6.2, turn: 2.65, redline: 7400, stripe: false },
  hornet: { id: 'hornet', brand: 'Tachi', name: 'Hornet', cls: 'Hot hatch', starter: true, price: 2500, top: 50, accel: 13.2, grip: 6.9, turn: 2.75, redline: 8600, stripe: false },
  vortex: { id: 'vortex', brand: 'Mazura', name: 'Vortex', cls: 'Rotary coupe', starter: true, price: 3500, top: 53, accel: 13.6, grip: 7, turn: 2.6, redline: 9000, stripe: false },
  dreier: { id: 'dreier', brand: 'Brauer', name: 'Dreier', cls: 'Sports coupe', starter: true, price: 3500, top: 54, accel: 14, grip: 6.6, turn: 2.45, redline: 7000, stripe: false },
  ronin: { id: 'ronin', brand: 'Kagero', name: 'Ronin', cls: 'Lightweight drift hatch', starter: true, price: 3000, top: 50, accel: 12.9, grip: 6.0, turn: 2.85, redline: 7600, stripe: false },
  solstice: { id: 'solstice', brand: 'Sanko', name: 'Solstice', cls: 'Turbo coupe', price: 5000, top: 54, accel: 14.2, grip: 6.4, turn: 2.4, redline: 7200, stripe: true },
  zephyr: { id: 'zephyr', brand: 'Hikari', name: 'Zephyr', cls: 'Tuner coupe', price: 8000, top: 58, accel: 16.5, grip: 7.4, turn: 2.5, redline: 8200, stripe: true },
  vandal: { id: 'vandal', brand: 'Brannock', name: 'Vandal', cls: 'Muscle', price: 9500, top: 61, accel: 17.5, grip: 5.8, turn: 2.25, redline: 6900, stripe: true },
  strix: { id: 'strix', brand: 'Ravelle', name: 'Strix', cls: 'Mid-engine exotic', price: 18000, top: 71, accel: 21, grip: 8, turn: 2.7, redline: 8800, stripe: false }
};
for (const c of Object.values(CARS)) { c.L = SHAPES[c.id].L; c.Wd = SHAPES[c.id].W; }
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
    glassMat: new THREE.MeshPhongMaterial({ color: 0x0d1015, shininess: 120, specular: 0x998877, side: THREE.DoubleSide, envMap: T.env, reflectivity: 0.45, combine: THREE.MixOperation }),
    env: T.env,
    headMat: new THREE.MeshBasicMaterial({ color: 0xfff3d6 }),
    darkMat: new THREE.MeshLambertMaterial({ color: 0x111116 }),
    shadowMat: new THREE.MeshBasicMaterial({ map: T.glow, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
    flameMat: new THREE.MeshBasicMaterial({ color: 0x66ccff, ...add }),
    beamMat: new THREE.MeshBasicMaterial({ map: T.beam, opacity: 0.36, ...add }),
    add
  };
  return shared;
}
export function buildCar(spec, paint, glow, T, { beam = true, rims = null, vinyl = null, vinylColor = null, decals = false } = {}) {
  const S = sharedParts(T), sh = SHAPES[spec.id];
  const g = new THREE.Group(), pc = new THREE.Color(paint);
  const pm = new THREE.MeshPhongMaterial({ color: pc, shininess: 110, specular: 0x8a8a8a, emissive: pc.clone().multiplyScalar(pc.getHSL({}).l > 0.6 ? 0.02 : 0.08), envMap: S.env, reflectivity: 0.25, combine: THREE.MixOperation });
  if (vinyl) { pm.map = liveryTexture(paint, vinyl, vinylColor, SHAPES[spec.id].L); pm.userData.ownMap = true; pm.color.set(0xffffff); }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x7a0010 });
  const stripe = new THREE.MeshPhongMaterial({ color: pc.getHSL({}).l > 0.6 ? 0x15131f : 0xf3f0ff, shininess: 60, side: THREE.DoubleSide });
  const { group: body } = buildBody(sh, { paint: pm, glass: S.glassMat, head: S.headMat, tail: tailMat, dark: S.darkMat, stripe }, spec);
  g.add(body);
  body.position.y = spec.rideH || 0;
  if (decals) addDecals(body, T, sh);
  const rimMat = rims ? new THREE.MeshPhongMaterial({ color: rims, shininess: 90 }) : S.rimMat;
  const { L, W, R } = sh, wheels = [], pivots = [], Z = u => u * L - L / 2;
  for (const [u, front] of [[sh.axles[1], 1], [sh.axles[0], 0]]) for (const sx of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(sx * (W / 2 - 0.14), R, Z(u)); piv.rotation.z = sx * (spec.camber || 0) * 0.14; g.add(piv);
    const w = new THREE.Group(), t = new THREE.Mesh(S.wheelGeo, S.wheelMat), r = new THREE.Mesh(S.rimGeo, rimMat);
    t.scale.set(1, R / 0.37, R / 0.37); r.scale.set(1, R / 0.37, R / 0.37); w.add(t); w.add(r); piv.add(w);
    wheels.push(w); if (front) pivots.push(piv);
  }
  plane(W + 0.8, L + 0.9, S.shadowMat, 0.045, 0, g);
  if (glow) plane(W + 1.8, L + 2, new THREE.MeshBasicMaterial({ map: T.glow, color: glow, ...S.add }), 0.07, 0, g);
  if (beam) plane(10, 24, S.beamMat, 0.065, L / 2 + 11.8, g);
  const flames = [];
  for (const s of [1, -1]) { const f = new THREE.Mesh(S.flameGeo, S.flameMat); f.position.set(s * 0.35, 0.36, -L / 2); f.visible = false; g.add(f); flames.push(f); }
  // inertia barrier: an invisible shell that shimmers when something hits it too fast
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shellMat);
  shell.scale.set(W * 0.8, 0.95, L * 0.62); shell.position.y = 0.75; g.add(shell);
  // tail lamp positions for light trails
  const tails = [new THREE.Vector3(0.6, 0.8, -L / 2), new THREE.Vector3(-0.6, 0.8, -L / 2)];
  return { g, body, wheels, pivots, tailMat, flames, shell, tails, R };
}
function plane(w, l, mat, y, z, parent) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); parent.add(m); return m; }

// free everything a car model made for itself; the shared wheel and glass parts stay
export function disposeCar(m, T) {
  const S = sharedParts(T), keepGeo = new Set([S.wheelGeo, S.rimGeo, S.flameGeo]), keepMat = new Set([S.wheelMat, S.rimMat, S.glassMat, S.headMat, S.darkMat, S.shadowMat, S.flameMat, S.beamMat]);
  m.g.parent && m.g.parent.remove(m.g);
  m.g.traverse(o => { if (o.geometry && !keepGeo.has(o.geometry)) o.geometry.dispose(); if (o.material && !keepMat.has(o.material)) { if (o.material.userData.ownMap && o.material.map) o.material.map.dispose(); o.material.dispose(); } });
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
    if (g !== this.gear) { this.gear = g; this.shiftT = this.spec.shiftT || 0.16; return true; }
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
        f += s.accel * 1.25 * this.torque(x) * Math.pow(ratio / RATIOS[0], 0.6) * thr * (nos ? (s.nos || 1.7) : 1) * dt;
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
    this.nitro = nos ? Math.max(0, this.nitro - (s.nosDrain || 0.27) * dt) : Math.min(1, this.nitro + 0.01 * dt);
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
  for (const w of m.wheels) w.rotation.x += car.f * dt / (m.R || 0.37);
  for (const p of m.pivots) p.rotation.y = car.steer * 0.45;
  m.tailMat.color.setHex(car.braking || car.reverse ? 0xff2030 : 0x7a0010);
  for (const f of m.flames) { f.visible = car.nos; f.scale.set(1, 1, 0.7 + Math.random() * 0.7); }
  m.shell.material.opacity = car.barrier * 0.55;
  m.shell.rotation.y += dt * 2;
}

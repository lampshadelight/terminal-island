import * as THREE from 'three';
import { clamp, lerp, wrapA, DEG, canvasTex } from './util.js';
import { CARS, RATIOS, Car, buildCar, syncModel } from './car.js';
import { collide } from './world.js';
import { PAL } from './textures.js';
import { save, persist, money } from './save.js';

/* ------------------------------------------------------------------
   Race events. Each one has a glowing marker somewhere on the island;
   drive into it to see the event card.
   Circuit and drift races are played in landscape on the streets.
   Drag and roll races are played in portrait: hold the phone level,
   tip it forward for gas, and keep your lane.
   ------------------------------------------------------------------ */
const P = pts => pts.map(([x, z]) => ({ x, z }));
const rivalSpec = (id, k) => ({ ...CARS[id], accel: CARS[id].accel * k });

export const TYPES = {
  circuit: { label: 'Circuit race', color: PAL.orange },
  drift: { label: 'Drift', color: PAL.amber },
  drag: { label: 'Drag race', color: PAL.softRed },
  roll: { label: 'Roll race', color: PAL.teal }
};

export const EVENTS = [
  { id: 'neon-loop', type: 'circuit', name: 'Neon Loop', where: 'Neon Row', marker: { x: 60, z: -288 }, laps: 2, prize: 1200, traffic: true,
    path: P([[0, -288], [288, -288], [288, 96], [96, 96], [96, 288], [-192, 288], [-192, -96], [0, -96]]),
    rivals: [{ name: 'Kestrel', spec: rivalSpec('hornet', 1), paint: '#FFC400' }, { name: 'Mox', spec: rivalSpec('dreier', 0.98), paint: '#249689' }, { name: 'Juno', spec: rivalSpec('vortex', 0.96), paint: '#587AF9' }],
    blurb: 'Two laps through the towers of Neon Row against three local drivers. Drive through every checkpoint gate.' },
  { id: 'harbour-drift', type: 'drift', name: 'Harbour Drift', where: 'Dockside', marker: { x: 60, z: 1210 }, laps: 2, prize: 1000, target: 6000, traffic: false,
    path: P([[0, 1210], [240, 1210], [240, 1430], [0, 1430]]),
    blurb: 'Two laps around the container yards. Slide the car to score: the longer the drift, the higher the multiplier. Touching a barrier mid-drift loses the points you were building.' },
  { id: 'quay-quarter', type: 'drag', name: 'Quay Quarter', where: 'Dockside', marker: { x: -400, z: 1650 }, prize: 900, traffic: false,
    strip: { cz: 1650, x0: -440, len: 402 }, rivals: [{ name: 'Brick', spec: rivalSpec('kaze', 0.98), paint: '#FF4500' }],
    blurb: 'A quarter mile down the quay. Shift at the top of the rev bar for a perfect shift. Hold the phone upright and level.' },
  { id: 'runway-roll', type: 'roll', name: 'Runway Roll', where: 'Old Terminal', marker: { x: -1700, z: 225 }, prize: 1100, traffic: false,
    strip: { cz: 250, x0: -1630, len: 600, roll: 60 / 3.6 }, rivals: [{ name: 'Sable', spec: rivalSpec('dreier', 0.93), paint: '#FFFFFF' }],
    blurb: 'Both cars roll down the old runway at 60 km/h. When the lights change, it is flat out for 600 metres. Hold the phone upright and level.' },
  // club boss races: hidden until you have won the club's qualifying races
  { id: 'kings-crown', type: 'circuit', club: 'kings', needs: ['neon-loop'], name: 'Crown of Neon Row', where: 'Neon Row', marker: { x: 288, z: -150 }, laps: 3, prize: 4000, traffic: true,
    path: P([[0, -288], [288, -288], [288, 96], [96, 96], [96, 288], [-192, 288], [-192, -96], [0, -96]]),
    rivals: [{ name: 'Vex', boss: true, spec: rivalSpec('zephyr', 1.04), paint: '#1A1A1E' }, { name: 'Halo', spec: rivalSpec('vandal', 1), paint: '#BF0003' }, { name: 'Pike', spec: rivalSpec('solstice', 1), paint: '#FFC400' }],
    blurb: 'The Kings run Neon Row. Three laps against their boss Vex and two of the crew. Beat Vex to take the crown.' },
  { id: 'union-final', type: 'drift', club: 'union', needs: ['harbour-drift'], name: 'Union Final', where: 'Dockside', marker: { x: 240, z: 1320 }, laps: 3, prize: 3500, target: 11000, traffic: false,
    path: P([[0, 1210], [240, 1210], [240, 1430], [0, 1430]]),
    blurb: 'The Harbour Drift Union boss, Reika, set 11,000 points over three laps of the yards. Beat her score to join the Union.' },
  { id: 'syndicate-long', type: 'drag', club: 'syndicate', needs: ['quay-quarter', 'runway-roll'], name: 'Syndicate Long Run', where: 'Old Terminal', marker: { x: -1720, z: 268 }, prize: 4500, traffic: false,
    strip: { cz: 250, x0: -1645, len: 760 }, rivals: [{ name: 'Marlow', boss: true, spec: rivalSpec('zephyr', 1.02), paint: '#B8BCC4' }],
    blurb: 'The Runway Syndicate only race the long way: 760 metres from a standing start against their boss, Marlow. Hold the phone upright and level.' }
];

export const CLUBS = {
  kings: { name: 'The Kings', where: 'Neon Row', boss: 'Vex', event: 'kings-crown', type: 'circuit', reward: 'Kings crown on your record and $4,000' },
  union: { name: 'Harbour Drift Union', where: 'Dockside', boss: 'Reika', event: 'union-final', type: 'drift', reward: 'Union membership and $3,500' },
  syndicate: { name: 'Runway Syndicate', where: 'Old Terminal', boss: 'Marlow', event: 'syndicate-long', type: 'drag', reward: 'Syndicate membership and $4,500' }
};
// live races: the friend's car is a puppet moved by their phone
export const LIVE_EVENTS = ['neon-loop', 'quay-quarter', 'runway-roll'];
export function liveEvent(id, friend) {
  const base = EVENTS.find(e => e.id === id), f = friend.car;
  return { ...base, live: true, prize: 0, traffic: false, rivals: [{ name: friend.name || 'Your friend', live: true, spec: f.spec, paint: f.paint, glow: f.glow, opts: f.opts }],
    blurb: `Live race against ${friend.name || 'your friend'}.` };
}
export const unlocked = ev => !ev.needs || ev.needs.every(id => save.wins[id]);
const evById = id => EVENTS.find(e => e.id === id);
export function clubsHtml() {
  return Object.entries(CLUBS).map(([k, c]) => {
    const ev = evById(c.event), open = unlocked(ev), beaten = !!save.clubs[k], col = TYPES[c.type].color;
    const need = ev.needs.map(id => `${save.wins[id] ? '✓' : '○'} Win ${evById(id).name}`).join('<br>');
    const state = beaten ? `<span class="pill" style="--c:${col}">Boss beaten</span>` : open ? `<span class="pill" style="--c:${col}">Boss race open · find the marker in ${c.where}</span>` : `<span class="pill">Locked</span>`;
    return `<div class="item"><div class="item-main"><b>${c.name}</b><div class="small dim">${c.where} · boss: ${c.boss}</div><div class="small" style="margin-top:6px">${need}</div><div class="small dim" style="margin-top:6px">Reward: ${c.reward}</div></div><div>${state}</div></div>`;
  }).join('');
}

const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
export const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
function syncFL(c) { const fx = Math.sin(c.h), fz = Math.cos(c.h); c.f = c.vx * fx + c.vz * fz; c.l = c.vx * fz - c.vz * fx; }
// inertia barriers between two cars: push apart and bounce, no damage
export function pushApart(a, b, R = 3.4) {
  const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz;
  if (d2 >= R * R || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (R - d) / 2;
  a.x += nx * pen; a.z += nz * pen; b.x -= nx * pen; b.z -= nz * pen;
  const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rv < 0) { const j = -rv * 0.6; a.vx += j * nx; a.vz += j * nz; b.vx -= j * nx; b.vz -= j * nz; }
  syncFL(a); syncFL(b);
  return -rv;
}

export class Race {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, T, car, model, hud, controls, audio, ui
    this.active = null; this.near = null; this.models = new Map(); this.temp = [];
    this.markers = EVENTS.map(ev => this._marker(ev));
    this.showMarkers();
    this.gate = this._gate(); this.scene.add(this.gate); this.gate.visible = false;
    this.el = id => document.getElementById(id);
  }
  showMarkers() { EVENTS.forEach((ev, i) => { this.markers[i].visible = unlocked(ev); }); }
  get portrait() { return !!(this.active && this.active.strip); }
  get locked() { return !!this.active && (this.phase === 'count' && !this.active.strip?.roll); }

  /* ---------- markers and the event card ---------- */
  _marker(ev) {
    const col = new THREE.Color(TYPES[ev.type].color), g = new THREE.Group();
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 70, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, opacity: 0.22, ...add }));
    beam.position.y = 35; g.add(beam);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: this.T.glow, color: col, opacity: 0.9, ...add }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
    if (ev.club) { const crown = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.25, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', ...add })); crown.rotation.x = Math.PI / 2; crown.position.y = 6; g.add(crown); beam.scale.set(1.3, 1.4, 1.3); }
    g.position.set(ev.marker.x, 0, ev.marker.z); this.scene.add(g);
    return g;
  }
  checkMarkers(car) {
    if (this.near) { if (Math.hypot(car.x - this.near.marker.x, car.z - this.near.marker.z) > 16) this.near = null; return; }
    for (const ev of EVENTS) if (unlocked(ev) && Math.hypot(car.x - ev.marker.x, car.z - ev.marker.z) < 7) { this.near = ev; this.offer(ev); return; }
  }
  offer(ev) {
    const t = TYPES[ev.type], $ = this.el;
    $('evType').textContent = ev.club ? `Boss race · ${CLUBS[ev.club].name}` : `${t.label} · ${ev.where}`; $('evType').style.color = t.color;
    $('evName').textContent = ev.name; $('evBlurb').textContent = ev.blurb;
    const pills = [];
    if (ev.laps) pills.push(`${ev.laps} laps`);
    if (ev.strip) pills.push(`${ev.strip.len} m`, 'Portrait');
    if (ev.rivals) pills.push(`${ev.rivals.length} rival${ev.rivals.length > 1 ? 's' : ''}`);
    if (ev.target) pills.push(`Target ${ev.target.toLocaleString('en-US')} pts`);
    pills.push(`Prize ${money(ev.prize)}`);
    if (save.best[ev.id]) pills.push(`Best ${ev.type === 'drift' ? save.best[ev.id].toLocaleString('en-US') + ' pts' : fmtTime(save.best[ev.id])}`);
    $('evPills').innerHTML = pills.map(p => `<span class="pill" style="--c:${t.color}">${p}</span>`).join('');
    $('evNote').textContent = ev.strip
      ? (this.controls.mode === 'tilt' ? 'Turn the phone upright. Keep it level: if it tips past the zone on the balance bar, the car drifts out of its lane. The zone gets smaller as you go faster. Leaving your lane, getting too close to the wall or losing balance ends the run.'
        : 'Touch controls: the car holds its lane by itself. Gas and NOS on the right, gears on the left.')
      : 'Gears are manual unless you switched to automatic in the pause menu.';
    this.ui.modal('eventCard');
    this.pending = ev;
  }

  /* ---------- start, restart, leave ---------- */
  start(ev = this.pending) {
    this.cleanup(true);
    const car = this.car;
    this.active = ev; this.phase = 'count'; this.t = 3.6; this.clock = 0; this.shown = 0; this.calibrated = false;
    this.ready = { me: false, them: false }; this.sendT = 0;
    this.cp = 0; this.score = 0; this.drift = { t: 0, pending: 0, idle: 0, mult: 1 }; this.wobble = 0; this.resultShown = false; this.finishT = null;
    for (const m of this.markers) m.visible = false;
    this.ui.setTraffic(ev.traffic);
    car.nitro = 1; car.barrier = 0;
    this.rivals = (ev.rivals || []).map((r, i) => {
      const c = new Car(r.spec); c.auto = true; c.nitro = 1;
      const key = r.spec.id + r.paint + (r.live ? JSON.stringify(r.opts || {}) + r.spec.rideH + r.spec.camber : '');
      let m = this.models.get(key);
      if (!m) { m = buildCar(r.spec, r.paint, r.glow ? new THREE.Color(r.glow).getHex() : new THREE.Color(r.paint).getHex(), this.T, r.opts || {}); this.models.set(key, m); }
      this.scene.add(m.g);
      return { ...r, car: c, m, cp: 0, lane: [3, -3, 0][i % 3], stuck: 0, done: null, react: 0.2 + Math.random() * 0.2, nosAt: 0.35 + Math.random() * 0.3 };
    });
    if (ev.strip) this._startStrip(ev); else this._startPath(ev);
    this.saveCalib = { r: this.controls.tilt.roll0, p: this.controls.tilt.pitch0 };
    this.ui.raceUi(true, ev);
    this.hud.setTicker([`${TYPES[ev.type].label}: ${ev.name}`, ev.laps ? `${ev.laps} laps` : `${ev.strip.len} metres`, ev.target ? `Target ${ev.target.toLocaleString('en-US')} points` : `${(ev.rivals || []).length + 1} cars`, ev.live ? 'Live race' : `Prize ${money(ev.prize)}`]);
    this.hud.setPlace(ev.name);
    this.hud.say(ev.strip ? 'Hold the phone upright and level' : 'Get ready', 2600);
  }
  _startPath(ev) {
    const p = ev.path, a = p[0], b = p[1], h = Math.atan2(b.x - a.x, b.z - a.z), fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    const slot = (k) => { const row = Math.floor(k / 2), side = k % 2 ? -1 : 1; return { x: a.x - fx * (8 + row * 9) + rx * side * 3.5, z: a.z - fz * (8 + row * 9) + rz * side * 3.5 }; };
    // live: the host takes pole and the guest lines up beside, on both phones
    const mine = ev.live ? (this.net.role === 'host' ? 0 : 1) : this.rivals.length;
    const s = slot(mine); this.car.reset(s.x, s.z, h); this.car.nitro = 1;
    this.rivals.forEach((r, i) => { const q = slot(ev.live ? 1 - mine : i); r.car.reset(q.x, q.z, h); r.car.nitro = 1; });
    this.cpCount = p.length * ev.laps;
    this._placeGate();
  }
  _startStrip(ev) {
    const s = ev.strip, h = Math.PI / 2, x = s.roll ? s.x0 - s.roll * 3.6 : s.x0;
    this.laneZ = s.cz + 3.5; this.car.reset(x, this.laneZ, h); this.car.nitro = 1;
    this.rivals.forEach(r => { r.laneZ = s.cz - 3.5; r.car.reset(x, r.laneZ, h); r.car.auto = true; });
    if (s.roll) for (const c of [this.car, ...this.rivals.map(r => r.car)]) { c.gear = 3; c.vx = s.roll; c.vz = 0; syncFL(c); }
    this.finishX = s.x0 + s.len;
    this._buildStrip(s);
  }
  restart() { const ev = this.active; this.cleanup(); this.start(ev); }
  leave() { if (this.active && this.active.live && this.phase !== 'done' && this.phase !== 'aborted') this.net.send({ t: 'leave' }); this.cleanup(); }
  cleanup(keepUi) {
    if (!this.active) return;
    for (const r of this.rivals || []) this.scene.remove(r.m.g);
    for (const o of this.temp) { this.scene.remove(o); o.traverse(n => { n.geometry && n.geometry.dispose(); if (n.material) { n.material.map && n.material.map.dispose(); n.material.dispose(); } }); }
    this.temp = []; this.rivals = []; this.gate.visible = false;
    if (this.saveCalib) { this.controls.tilt.roll0 = this.saveCalib.r; this.controls.tilt.pitch0 = this.saveCalib.p; }
    this.active = null;
    this.showMarkers();
    this.near = null; this.ui.setTraffic(true);
    if (!keepUi) { this.ui.raceUi(false); this.hud.setTicker(this.hud.defaultTicker); }
  }

  /* ---------- input: straight races steer by balance ---------- */
  input(inp, dt) {
    const ev = this.active, out = { steer: inp.steer, throttle: inp.throttle, brake: inp.brake, nos: inp.nos, drift: inp.drift };
    const over = this.phase === 'done' || this.phase === 'aborted';
    if (over) { out.throttle = 0; out.brake = 1; out.nos = false; out.drift = false; }
    if (!ev.strip) return out;
    out.drift = false;
    const c = this.controls, top = this.car.spec.top;
    const x = clamp(0.65 * Math.abs(this.car.f) / top + 0.35 * out.throttle, 0, 1);
    this.dz = lerp(9, 2.5, x);
    if (c.mode === 'tilt' && c.tiltLive) {
      const r = (c.tilt.roll - c.tilt.roll0) / DEG;
      this.roll = r;
      const ex = Math.max(0, Math.abs(r) - this.dz);
      out.steer = Math.sign(r) * clamp(ex / 22, 0, 0.5);
      if (this.phase === 'go') {
        if (ex > 0) this.wobble += dt * (1 + ex / 5); else this.wobble = Math.max(0, this.wobble - dt * 1.5);
        if (this.wobble >= 1.3 || ex > 22) this.abort('You lost your balance');
      }
    } else { this.roll = 0; out.steer = clamp(inp.steer, -1, 1) * 0.12; }
    if (over) out.steer = 0;
    return out;
  }
  onShift(d, ratio) {
    if (!this.active || this.phase !== 'go' || d < 0) return;
    if (ratio > 0.86 && ratio < 0.985) { this.hud.say('Perfect shift', 1200); this.audio.blip(880, 0.08, 'sine', 0.08); this.car.vx += Math.sin(this.car.h) * 0.9; this.car.vz += Math.cos(this.car.h) * 0.9; syncFL(this.car); }
    else if (ratio < 0.7) this.hud.say('Early shift', 1000);
  }
  onHit(speed) {
    if (!this.active || this.phase !== 'go') return;
    if (this.active.type === 'drift' && this.drift.pending > 0 && speed > 3) { this.drift.pending = 0; this.drift.t = 0; this.drift.mult = 1; this.hud.say('Drift lost', 1400); }
  }
  abort(why) {
    if (this.phase !== 'go') return;
    if (this.active.live) this.net.send({ t: 'abort' });
    this.phase = 'aborted'; this.car.barrier = 1; this.audio.thump(12);
    navigator.vibrate && navigator.vibrate([30, 40, 30]);
    this.hud.say('Run aborted', 2500);
    setTimeout(() => this.ui.results({ label: TYPES[this.active.type].label, title: 'Run aborted', text: why + '.', pills: [], win: false }), 1100);
  }

  /* ---------- per frame ---------- */
  update(dt) {
    const ev = this.active; if (!ev) return;
    const car = this.car;
    if (this.phase === 'count') {
      if (ev.strip && this.ui.needRotate()) { this.ui.count(''); return; }
      if (ev.live) {
        if (!this.ready.me) { this.ready.me = true; this.net.send({ t: 'ready' }); }
        if (!this.ready.them) { this.ui.count(''); this.hud.say(`Waiting for ${this.rivals[0].name}`, 600); this._sync(dt); return; }
      }
      if (!this.calibrated && this.t < 3.0) { if (this.controls.mode === 'tilt') this.controls.calibrate(); this.calibrated = true; }
      this.t -= dt;
      const n = Math.ceil(this.t);
      if (n !== this.shown && n <= 3 && n >= 1) { this.shown = n; this.ui.count(String(n)); this.audio.blip(440, 0.14, 'square', 0.08); this._lights(3 - n + 1); }
      // rev the engine on the line
      if (!ev.strip?.roll) car.rpm = Math.max(car.rpm, 900 + this.controls.out.throttle * (car.spec.redline - 900) * (0.9 + Math.random() * 0.1));
      if (ev.strip?.roll) this._cruise(dt);
      if (this.t <= 0) { this.phase = 'go'; this.ui.count('GO', true); this.audio.blip(880, 0.35, 'square', 0.1); this._lights(4); setTimeout(() => this.ui.count(null), 700); }
      this._sync(dt); this.ui.raceHud(this._hudInfo());
      return;
    }
    if (this.phase === 'go' || this.phase === 'done') this.clock += this.phase === 'go' ? dt : 0;
    // rivals
    for (const r of this.rivals) if (r.live) this._puppet(r, dt);
    for (let s = 0; s < 2; s++) for (const r of this.rivals) {
      if (r.live) continue;
      const inp = ev.strip ? this._aiStrip(r) : this._aiPath(r, dt / 2);
      r.car.step(dt / 2, inp, false);
      if (ev.strip) { r.car.z = r.laneZ; r.car.h = Math.PI / 2; r.car.vz = 0; syncFL(r.car); }
      else if (collide(r.car, 1.7)) syncFL(r.car);
    }
    if (!ev.strip) {
      for (const r of this.rivals) { if (r.live) continue; const v = pushApart(car, r.car); if (v > 3) { car.hit(v); r.car.hit(v); this.audio.thump(v); this.onHit(v); } }
      for (let i = 0; i < this.rivals.length; i++) for (let j = i + 1; j < this.rivals.length; j++) pushApart(this.rivals[i].car, this.rivals[j].car);
    }
    if (ev.strip) this._stripRules(dt); else this._pathRules(dt);
    if (ev.live) this._sendState(dt);
    this._sync(dt);
    this.ui.raceHud(this._hudInfo());
  }
  /* ---------- live: the friend's car follows their phone ---------- */
  _puppet(r, dt) {
    const n = r.net, c = r.car; if (!n) return;
    const k = 1 - Math.exp(-dt * 12);
    // where they will be by now, from their last report
    const age = Math.min(0.5, (performance.now() - n.at) / 1000), px = n.x + n.vx * age, pz = n.z + n.vz * age;
    c.x += (px - c.x) * k; c.vx = n.vx; c.f = n.f; c.rpm = n.rpm; c.gear = n.gear;
    if (this.active.strip) { c.z = r.laneZ; c.h = Math.PI / 2; c.vz = 0; }
    else { c.z += (pz - c.z) * k; c.vz = n.vz; c.h += wrapA(n.h - c.h) * k; }
    r.cp = n.cp;
  }
  _sendState(dt) {
    this.sendT -= dt; if (this.sendT > 0) return; this.sendT = 1 / 15;
    const c = this.car;
    this.net.send({ t: 's', x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz, f: c.f, rpm: c.rpm, gear: c.gear, cp: this.cp });
  }
  // a message from the friend's phone during a live race
  onNet(d) {
    const ev = this.active; if (!ev || !ev.live) return;
    const r = this.rivals[0]; if (!r) return;
    if (d.t === 'ready') this.ready.them = true;
    if (d.t === 's') {
      // their strip lane is ours mirrored: only the distance down the strip matters
      r.net = { ...d, at: performance.now() };
      if (ev.strip) r.net.x = d.x;
    }
    if (d.t === 'fin' && r.done == null) { r.done = d.time; if (this.phase === 'go') this.hud.say(`${r.name} finished in ${fmtTime(d.time)}`, 2400); else if (this.phase === 'done') this._liveResult(); }
    if (d.t === 'abort' || d.t === 'leave') { r.out = true; this.hud.say(d.t === 'abort' ? `${r.name}'s run was aborted` : `${r.name} left the race`, 2600); if (this.phase === 'done') this._liveResult(); }
  }

  _sync(dt) { for (const r of this.rivals) syncModel(r.m, r.car, dt); }
  _cruise() {
    const v = this.active.strip.roll;
    for (const c of [this.car, ...this.rivals.map(r => r.car)]) { c.vx = v; c.vz = 0; c.h = Math.PI / 2; syncFL(c); c.rpm = Math.abs(c.f) * RATIOS[c.gear - 1] * c.k; }
    this.car.z = this.laneZ;
    for (const r of this.rivals) { r.car.x = this.car.x; r.car.z = r.laneZ; }
  }

  /* ---------- circuit and drift ---------- */
  _target(r) { const p = this.active.path; return p[(r.cp + 1) % p.length]; }
  _aiPath(r, dt) {
    const p = this.active.path, N = p.length, c = r.car, wp = this._target(r), nx = p[(r.cp + 2) % N];
    const hin = Math.atan2(wp.x - p[r.cp % N].x, wp.z - p[r.cp % N].z), hout = Math.atan2(nx.x - wp.x, nx.z - wp.z);
    const tx = wp.x + -Math.cos(hin) * r.lane, tz = wp.z + Math.sin(hin) * r.lane;
    const dist = Math.hypot(wp.x - c.x, wp.z - c.z);
    if (dist < 15) { r.cp++; if (r.cp >= this.cpCount && !r.done) r.done = this.clock; }
    if (this.phase !== 'go' || r.done) return { steer: 0, throttle: 0, brake: 1, nos: false, drift: false };
    const aim = dist < 30 ? Math.atan2(nx.x - c.x, nx.z - c.z) * 0.35 + Math.atan2(tx - c.x, tz - c.z) * 0.65 : Math.atan2(tx - c.x, tz - c.z);
    const steer = clamp(wrapA(aim - c.h) * 2.4, -1, 1);
    const turn = Math.abs(wrapA(hout - hin));
    const vCorner = turn > 1 ? 13.5 : turn > 0.3 ? 22 : 70;
    // rubber band a little so the race stays close
    const gap = this._progress(r) - this._progress(this);
    const skill = gap > 1.5 ? 0.93 : gap < -1.5 ? 1.08 : 1;
    const vT = Math.sqrt(vCorner * vCorner + 2 * 8 * Math.max(0, dist - 10)) * skill;
    if (Math.abs(c.f) < 1.5) r.stuck += dt; else r.stuck = 0;
    if (r.stuck > 2.5) { const a = p[r.cp % N]; c.reset(a.x, a.z, hin); c.auto = true; r.stuck = 0; }
    return { steer, throttle: c.f < vT ? 1 : 0, brake: c.f > vT + 2 ? 1 : 0, nos: dist > 120 && c.f > 15 && c.nitro > 0.1, drift: false };
  }
  _progress(o) {
    const p = this.active.path, N = p.length, a = p[o.cp % N], b = p[(o.cp + 1) % N], c = o.car || this.car;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, d = Math.hypot(b.x - c.x, b.z - c.z);
    return o.cp + clamp(1 - d / L, -1, 1);
  }
  _pathRules(dt) {
    const ev = this.active, car = this.car, wp = this._target(this);
    if (this.phase === 'go' && Math.hypot(wp.x - car.x, wp.z - car.z) < 16) {
      this.cp++;
      this.audio.blip(this.cp % ev.path.length === 0 ? 990 : 660, 0.08, 'sine', 0.07);
      if (this.cp % ev.path.length === 0 && this.cp < this.cpCount) this.hud.say(`Lap ${this.cp / ev.path.length + 1} of ${ev.laps}`, 2000);
      if (this.cp >= this.cpCount) this._finish();
      else this._placeGate();
    }
    if (ev.type === 'drift' && this.phase === 'go') {
      const d = this.drift;
      if (car.drifting && car.kmh > 30) {
        d.t += dt; d.idle = 0; d.mult = Math.min(5, 1 + Math.floor(d.t / 1.5));
        d.pending += Math.abs(car.l) * Math.abs(car.f) * dt * 0.9 * d.mult;
      } else if (d.pending > 0) {
        d.idle += dt;
        if (d.idle > 0.45) { const pts = Math.round(d.pending); this.score += pts; this.hud.say(`+${pts.toLocaleString('en-US')}${d.mult > 1 ? '  ×' + d.mult : ''}`, 1300); d.pending = 0; d.t = 0; d.mult = 1; }
      }
    }
  }
  _placeGate() {
    const p = this.active.path, N = p.length, a = p[this.cp % N], b = p[(this.cp + 1) % N];
    this.gate.position.set(b.x, 0, b.z); this.gate.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const last = this.cp + 1 >= this.cpCount;
    this.gate.userData.mat.color.set(last ? '#ffffff' : PAL.amber); this.gate.userData.glow.color.set(last ? '#ffffff' : PAL.amber);
    this.gate.visible = true;
  }
  _gate() {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: PAL.amber });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), mat); m.position.set(s * 10.5, 4, 0); g.add(m); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(21.7, 0.6, 0.7), mat); top.position.y = 8; g.add(top);
    const glow = new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(21, 8), glow); sheet.position.y = 4; g.add(sheet);
    g.userData = { mat, glow };
    return g;
  }

  /* ---------- drag and roll ---------- */
  _aiStrip(r) {
    const c = r.car;
    if (this.phase === 'count' || r.done != null) return { steer: 0, throttle: 0, brake: r.done != null ? 1 : 0, nos: false, drift: false };
    const go = this.clock > r.react;
    const prog = (c.x - this.active.strip.x0) / this.active.strip.len;
    return { steer: 0, throttle: go ? 1 : 0, brake: 0, nos: go && prog > r.nosAt, drift: false };
  }
  _stripRules() {
    const car = this.car, s = this.active.strip;
    for (const r of this.rivals) if (r.done == null && r.car.x >= this.finishX) r.done = this.clock;
    if (this.phase !== 'go') return;
    // lane: the line to the rival's lane is at cz, the wall is 7.5 m out on your side
    const half = car.spec.Wd / 2;
    if (car.z - half < s.cz) return this.abort('You crossed into the other lane');
    if (s.cz + 7.5 - (car.z + half) < 0.5) return this.abort('You got too close to the wall');
    if (Math.abs(wrapA(car.h - Math.PI / 2)) > 0.6) return this.abort('You turned out of your lane');
    if (car.x >= this.finishX) this._finish();
  }
  _lights(n) {
    if (!this.lightMats) return;
    this.lightMats.forEach((m, i) => m.color.set(n >= 4 ? PAL.teal : i < n ? PAL.amber : '#1a1a1a'));
  }
  _buildStrip(s) {
    const g = new THREE.Group(), x0 = s.x0 - (s.roll ? 80 : 20), x1 = s.x0 + s.len + 160, L = x1 - x0, cx = (x0 + x1) / 2;
    const flat = (w, l, color, x, z, y = 0.06, opacity = 1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, w), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 1; g.add(m); return m;
    };
    flat(0.25, L, '#ffffff', cx, s.cz, 0.07, 0.85);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x4a4b50 }));
      wall.position.set(cx, 0.45, s.cz + side * 7.75); g.add(wall);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, 0.52), new THREE.MeshBasicMaterial({ color: PAL.amber }));
      strip.position.set(cx, 0.86, s.cz + side * 7.75); g.add(strip);
    }
    // start and finish lines
    flat(15, 0.6, '#ffffff', s.x0, s.cz, 0.08);
    const chk = canvasTex(64, 16, (c, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 4, j * 4, 4, 4); } });
    chk.magFilter = THREE.NearestFilter;
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(3, 15), new THREE.MeshBasicMaterial({ map: chk, depthWrite: false }));
    fin.rotation.x = -Math.PI / 2; fin.rotation.z = Math.PI / 2; fin.position.set(this.finishX, 0.08, s.cz); fin.renderOrder = 1; g.add(fin);
    // gantries: lights at the start, a sign at the finish
    const frame = (x, color) => {
      const m = new THREE.MeshLambertMaterial({ color: 0x2a2b30 });
      for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), m); p.position.set(x, 3.75, s.cz + side * 8.3); g.add(p); }
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 17.2), m); b.position.set(x, 7.2, s.cz); g.add(b);
    };
    frame(s.x0, 0); frame(this.finishX, 0);
    this.lightMats = [];
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({ color: '#1a1a1a' });
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.7), mat); l.position.set(s.x0 - 0.5, 7.2, s.cz + side * (1.5 + i * 1.1)); g.add(l);
      this.lightMats.push(mat);
    }
    const word = this.T.word('FINISH', '#ffffff', 512, 128);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: word, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    sign.position.set(this.finishX - 0.5, 9.2, s.cz); sign.rotation.y = -Math.PI / 2; g.add(sign);
    this.scene.add(g); this.temp.push(g);
  }

  /* ---------- finishing ---------- */
  _finish() {
    if (this.phase !== 'go') return;
    this.phase = 'done'; this.finishT = this.clock; this.gate.visible = false;
    const ev = this.active, t = TYPES[ev.type];
    if (ev.live) { this.net.send({ t: 'fin', time: this.finishT }); this.hud.say('Finished', 2000); this._liveResult(); return; }
    let place = 1, win, title, text, prize = 0;
    const pills = [];
    if (ev.type === 'drift') {
      this.score += Math.round(this.drift.pending); this.drift.pending = 0;
      win = this.score >= ev.target;
      title = win ? 'Target beaten' : 'Short of the target';
      text = `You scored ${this.score.toLocaleString('en-US')} points. The target was ${ev.target.toLocaleString('en-US')}.`;
      pills.push(`${this.score.toLocaleString('en-US')} pts`);
      if (win) prize = ev.prize;
      if (!save.best[ev.id] || this.score > save.best[ev.id]) save.best[ev.id] = this.score;
    } else {
      // rivals still racing are placed by how far along they are
      for (const r of this.rivals) {
        if (r.done != null) { if (r.done < this.finishT) place++; }
        else if (!ev.strip && this._progress(r) > this.cpCount) place++;
      }
      win = place === 1;
      title = win ? 'You won' : `You finished ${ordinal(place)}`;
      text = `Time ${fmtTime(this.finishT)}.` + (ev.strip && this.rivals[0] ? (this.rivals[0].done != null ? ` ${this.rivals[0].name} ran ${fmtTime(this.rivals[0].done)}.` : ` ${this.rivals[0].name} was still on the strip.`) : '');
      pills.push(fmtTime(this.finishT), `${ordinal(place)} of ${this.rivals.length + 1}`);
      prize = win ? ev.prize : place === 2 ? Math.round(ev.prize * 0.35) : 0;
      if (!save.best[ev.id] || this.finishT < save.best[ev.id]) save.best[ev.id] = this.finishT;
    }
    // a boss win only counts if you beat the boss (circuit) or the target/rival
    if (win && ev.club && !save.clubs[ev.club]) { save.clubs[ev.club] = true; const c = CLUBS[ev.club]; title = `You beat ${c.boss}`; text += ` You are now part of ${c.name}.`; }
    const before = EVENTS.filter(e => e.club && unlocked(e)).map(e => e.id);
    if (win) save.wins[ev.id] = (save.wins[ev.id] || 0) + 1;
    for (const e of EVENTS) if (e.club && unlocked(e) && !before.includes(e.id)) { const c = CLUBS[e.club]; text += ` ${c.name} heard about this. ${c.boss}'s boss race is now on the map in ${c.where}.`; pills.push('Boss race unlocked'); }
    if (prize) { save.cash += prize; pills.push(`+${money(prize)}`); }
    persist();
    this.hud.say(win ? 'Finished: you won' : 'Finished', 2500);
    setTimeout(() => this.ui.results({ label: t.label, title, text, pills, win, color: t.color }), 1500);
  }

  _liveResult() {
    const ev = this.active, t = TYPES[ev.type], r = this.rivals[0], me = this.finishT;
    const theirs = r.out ? null : r.done;
    let title, text, win = false;
    if (theirs != null) { win = me < theirs; title = win ? `You beat ${r.name}` : `${r.name} won`; text = `You ran ${fmtTime(me)}. ${r.name} ran ${fmtTime(theirs)}.`; }
    else if (r.out) { win = true; title = 'You won'; text = `You ran ${fmtTime(me)}. ${r.name} did not finish.`; }
    else { win = true; title = 'You crossed the line first'; text = `You ran ${fmtTime(me)}. ${r.name} is still racing.`; }
    clearTimeout(this.resT);
    this.resT = setTimeout(() => this.ui.results({ label: 'Live race', title, text, pills: [fmtTime(me), ev.name], win, color: t.color, live: true }), theirs != null || r.out ? 300 : 1500);
  }

  _hudInfo() {
    const ev = this.active, info = { type: ev.type, time: fmtTime(this.phase === 'done' ? this.finishT : this.clock) };
    if (ev.type === 'drift') { info.big = this.score.toLocaleString('en-US'); info.unit = 'points'; info.l1 = 'LAP'; info.v1 = `${Math.min(ev.laps, Math.floor(this.cp / ev.path.length) + 1)}/${ev.laps}`; info.pending = this.drift.pending > 0 ? `+${Math.round(this.drift.pending).toLocaleString('en-US')} ×${this.drift.mult}` : ''; }
    else if (ev.type === 'circuit') {
      const me = this._progress(this); let place = 1;
      for (const r of this.rivals) if ((r.done != null && (this.finishT == null || r.done < this.finishT)) || (r.done == null && this.finishT == null && this._progress(r) > me)) place++;
      info.big = ordinal(place); info.unit = `of ${this.rivals.length + 1}`; info.l1 = 'LAP'; info.v1 = `${Math.min(ev.laps, Math.floor(this.cp / ev.path.length) + 1)}/${ev.laps}`;
    } else {
      const s = ev.strip, len = s.len, r = this.rivals[0];
      info.you = clamp((this.car.x - s.x0) / len, 0, 1); info.rival = r ? clamp((r.car.x - s.x0) / len, 0, 1) : 0;
      info.big = Math.max(0, Math.round(this.finishX - this.car.x)) + ''; info.unit = 'm to go'; info.l1 = 'GAP';
      const gap = r ? (this.car.x - r.car.x) : 0; info.v1 = (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' m';
      info.roll = this.roll || 0; info.dz = this.dz || 9; info.wobble = clamp(this.wobble / 1.3, 0, 1); info.tilt = this.controls.mode === 'tilt' && this.controls.tiltLive;
    }
    return info;
  }
  marks() {
    if (!this.active) return EVENTS.filter(unlocked).map(ev => ({ x: ev.marker.x, z: ev.marker.z, c: TYPES[ev.type].color }));
    const out = this.rivals.map(r => ({ x: r.car.x, z: r.car.z, c: r.paint, small: true }));
    if (this.active.path && this.gate.visible) out.push({ x: this.gate.position.x, z: this.gate.position.z, c: '#ffffff', ring: true });
    return out;
  }
}

import { SPOTS } from './world.js';
import * as THREE from 'three';
import { CARS } from './car.js';
import { PAL } from './textures.js';
import { save, persist, money, newCar, START_PAINT } from './save.js';
import { VINYLS, VINYL_COLORS } from './livery.js';

/* ------------------------------------------------------------------
   Shops are hidden around the island. They are not on the map until
   you find one by driving past it. Drive slowly into the doorway to go in.
   ------------------------------------------------------------------ */
export const SHOPS = [
  { id: 'cars', kind: 'cars', name: 'Kinetic Motors', label: 'Car dealer', sign: 'MOTORS', ...SPOTS.cars, rumour: 'Word is there is a car dealer on the main street of Neon Row' },
  { id: 'parts', kind: 'parts', name: 'Torque Works', label: 'Performance parts', sign: 'TORQUE', ...SPOTS.parts, rumour: 'Someone is selling turbos out of the port in Dockside' },
  { id: 'paint', kind: 'paint', name: 'Spectra Paint', label: 'Paint shop', sign: 'PAINT', ...SPOTS.paint, rumour: 'There is a paint booth on the road to the old airport' },
  { id: 'body', kind: 'body', name: 'Panel & Line', label: 'Body kits', sign: 'BODY', ...SPOTS.body, rumour: 'A body shop hides on the back streets of Neon Row' },
  { id: 'acc', kind: 'acc', name: 'Glowline', label: 'Accessories', sign: 'GLOW', ...SPOTS.acc, rumour: 'Underglow kits are sold beside the coast road on the east side' }
];

export const PARTS = [
  { id: 'engine', name: 'Engine', desc: 'More power across the rev range.' },
  { id: 'turbo', name: 'Turbo', desc: 'More power and a higher top speed.' },
  { id: 'gearbox', name: 'Gearbox', desc: 'Quicker gear changes.' },
  { id: 'tyres', name: 'Tyres', desc: 'More grip and sharper turning.' },
  { id: 'nitrous', name: 'Nitrous', desc: 'Stronger boost that lasts longer.' },
  { id: 'weight', name: 'Weight reduction', desc: 'Faster off the line and through corners.' }
];
const PART_PRICE = [700, 1600, 3200];
const CAR_FACTOR = { solstice: 1.15, zephyr: 1.3, vandal: 1.4, strix: 1.8 };
export const partPrice = (carId, lvl) => Math.round(PART_PRICE[lvl] * (CAR_FACTOR[carId] || 1) / 50) * 50;

export const PAINTS = ['#BF0003', '#FF4500', '#FFC400', '#249689', '#587AF9', '#FF5963', '#F2F2F2', '#1A1A1E', '#6B6F78', '#7A3FB0', '#00A6B8', '#3D7A36'];
export const GLOWS = [[null, 'Off'], ['#FF2A10', 'Red'], ['#FF4500', 'Orange'], ['#FFC400', 'Amber'], ['#249689', 'Teal'], ['#587AF9', 'Blue'], ['#FFFFFF', 'White']];
export const RIMS = [[null, 'Silver'], ['#1B1B1F', 'Black'], ['#C9A227', 'Gold'], ['#BF0003', 'Red'], ['#EDEDED', 'White']];
export const SPOILERS = [['wing', 'Wing'], ['lip', 'Lip'], ['ducktail', 'Ducktail'], ['none', 'None']];
const PRICE = { paint: 250, glow: 300, rims: 250, spoiler: 400, scoop: 300, stripe: 150, vinyl: 350, vinylColor: 100, decals: 150 };
export const TUNES = [
  { id: 'height', name: 'Ride height', lo: 'Low', hi: 'High', min: -1, max: 1, tip: 'Lower sits flatter in corners.' },
  { id: 'camber', name: 'Camber', lo: '0°', hi: '-4°', min: 0, max: 1, tip: 'More camber grips harder in corners but costs a little launch.' },
  { id: 'final', name: 'Final drive', lo: 'Short', hi: 'Long', min: -1, max: 1, tip: 'Short gears pull harder, long gears reach a higher top speed.' },
  { id: 'lock', name: 'Steering lock', lo: 'Less', hi: 'More', min: -1, max: 1, tip: 'More lock turns tighter and suits drifting.' }
];

// driving numbers after upgrades
export function tunedSpec(id) {
  const b = CARS[id], c = save.cars[id] || newCar(), p = c.parts, t = { ...newCar().tune, ...(c.tune || {}) };
  return { ...b,
    accel: b.accel * (1 + 0.08 * p.engine + 0.05 * p.turbo + 0.04 * p.weight) * (1 - 0.09 * t.final) * (1 - 0.03 * t.camber),
    top: b.top * (1 + 0.04 * p.turbo + 0.015 * p.gearbox) * (1 + 0.08 * t.final),
    grip: b.grip * (1 + 0.1 * p.tyres) * (1 + 0.12 * t.camber) * (1 - 0.06 * t.height), turn: b.turn * (1 + 0.04 * p.tyres + 0.03 * p.weight) * (1 + 0.1 * t.lock),
    rideH: t.height * 0.06, camber: t.camber,
    shiftT: 0.16 - 0.035 * p.gearbox, nos: 1.7 + 0.12 * p.nitrous, nosDrain: 0.27 * (1 - 0.12 * p.nitrous) };
}
// how it looks: body kit choices replace the factory parts
export function looks(id) {
  const b = CARS[id], c = save.cars[id] || newCar(START_PAINT[id]);
  return { spec: { ...tunedSpec(id), spoiler: c.spoiler ?? b.spoiler, scoop: c.scoop ?? b.scoop, stripe: c.stripe ?? b.stripe }, paint: c.paint, glow: c.glow, rims: c.rims, vinyl: c.vinyl, vinylColor: c.vinylColor, decals: c.decals };
}

/* ---------- shop doors in the world ---------- */
export function buildShopDoors(scene, T) {
  return SHOPS.map(s => {
    const g = new THREE.Group(), frame = new THREE.MeshLambertMaterial({ color: 0x2a2b30 });
    const lit = new THREE.MeshBasicMaterial({ color: PAL.teal });
    for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), frame); p.position.set(side * 4, 2.5, 0); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.7, 0.6), frame); top.position.y = 5; g.add(top);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.62), lit); strip.position.y = 4.6; g.add(strip);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: T.word(s.sign, '#ffffff'), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    sign.position.y = 6.4; g.add(sign);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshBasicMaterial({ map: T.glow, color: PAL.teal, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.07; g.add(pool);
    g.position.set(s.x, 0, s.z); g.rotation.y = s.h; scene.add(g);
    return g;
  });
}

/* ---------- dyno: power and torque across the rev range ---------- */
const torqueAt = x => Math.min(1, Math.max(0.22, 0.38 + 1.3 * x - 0.85 * x * x));
export function dynoCurve(spec) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = 0.12 + 0.88 * i / 40, rpm = x * spec.redline, hp = Math.pow(spec.accel, 1.5) * torqueAt(x) * x * 5.1 * (spec.redline / 8000);
    pts.push({ rpm, hp, nm: hp * 7120 / rpm });
  }
  return pts;
}
export function drawDyno(cv, spec, t = 1) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, pts = dynoCurve(spec), maxHp = 650, maxNm = 750, pad = 26;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { const y = pad + (h - 2 * pad) * i / 5; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - 8, y); g.stroke(); }
  const X = r => pad + (w - pad - 8) * r / 9500, Y = (v, m) => h - pad - (h - 2 * pad) * v / m;
  const n = Math.max(2, Math.round(pts.length * t));
  for (const [key, m, col] of [['nm', maxNm, '#FFC400'], ['hp', maxHp, '#FF5963']]) {
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath();
    pts.slice(0, n).forEach((p, i) => i ? g.lineTo(X(p.rpm), Y(p[key], m)) : g.moveTo(X(p.rpm), Y(p[key], m))); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 13px Inter, Arial'; g.fillText('RPM', w - 44, h - 8);
  for (let r = 2000; r <= 8000; r += 2000) g.fillText(r / 1000 + 'k', X(r) - 8, h - 8);
  const shown = pts.slice(0, n), pk = shown.reduce((a, b) => b.hp > a.hp ? b : a), tq = shown.reduce((a, b) => b.nm > a.nm ? b : a);
  return { hp: Math.round(pk.hp), hpRpm: Math.round(pk.rpm / 100) * 100, nm: Math.round(tq.nm), nmRpm: Math.round(tq.rpm / 100) * 100 };
}

/* ---------- shop screens ---------- */
export const carStats = t => `<div class="stats"><span>Speed</span>${bar(t.top, 75)}<span>Power</span>${bar(t.accel, 24)}<span>Grip</span>${bar(t.grip, 9)}</div>`;
const bar = (v, max) => `<i class="stat"><b style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></b></i>`;
const swatch = (col, on, act, val, label) => `<button class="swatch${on ? ' on' : ''}" data-act="${act}" data-v="${val ?? ''}" aria-label="${label || col}" style="--sw:${col || 'transparent'}">${col ? '' : '<span>Off</span>'}</button>`;

export class Shops {
  constructor({ onChange, say }) {
    this.onChange = onChange; this.say = say; this.el = id => document.getElementById(id); this.open = null;
    this.el('shopBody').addEventListener('click', e => this._click(e));
    // tuning sliders apply when you let go
    this.el('shopBody').addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.tune; if (!k) return;
      const c = save.cars[save.current]; c.tune = { ...newCar().tune, ...(c.tune || {}), [k]: +e.target.value };
      persist(); this.onChange(); this.say('Tuning saved', 1200);
    });
  }
  show(shop) { this.open = shop; this.render(); }
  runDyno() {
    const cv = this.el('dynoCv'); if (!cv) return;
    const spec = tunedSpec(save.current), t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 1800), r = drawDyno(cv, spec, t);
      this.el('dynoHp').textContent = `${r.hp} hp`; this.el('dynoNm').textContent = `${r.nm} Nm`;
      if (t < 1) requestAnimationFrame(step);
      else { this.el('dynoHp').textContent = `${r.hp} hp @ ${r.hpRpm}`; this.el('dynoNm').textContent = `${r.nm} Nm @ ${r.nmRpm}`; }
    };
    step();
  }
  render() {
    const s = this.open, $ = this.el, id = save.current, c = save.cars[id], car = CARS[id];
    $('shopLabel').textContent = s.label; $('shopName').textContent = s.name; $('shopCash').textContent = money(save.cash);
    let h = '';
    if (s.kind === 'cars' || s.kind === 'garage') {
      const list = s.kind === 'garage' ? Object.keys(save.cars) : Object.keys(CARS);
      h += list.map(k => {
        const b = CARS[k], owned = !!save.cars[k], t = owned ? tunedSpec(k) : b, cur = k === id;
        const btn = cur ? `<button class="gbtn small" disabled>Driving</button>` : owned ? `<button class="gbtn small lit" data-act="drive" data-v="${k}">Drive</button>`
          : `<button class="gbtn small primary lit" data-act="buycar" data-v="${k}" ${save.cash < b.price ? 'disabled' : ''}>Buy ${money(b.price)}</button>`;
        return `<div class="item"><div class="item-main"><div class="label dim">${b.brand} · ${b.cls}</div><h3>${b.name}</h3>
          ${carStats(t)}</div>${btn}</div>`;
      }).join('');
      if (s.kind === 'garage') h += `<p class="small dim">Your cars: ${Object.keys(save.cars).length} of ${Object.keys(CARS).length}. Kinetic Motors sells the rest, if you can find it.</p>`;
    }
    if (s.kind === 'parts') {
      h += `<p class="small dim">Upgrading your ${car.brand} ${car.name}.</p>`;
      h += PARTS.map(p => {
        const lvl = c.parts[p.id], pips = [0, 1, 2].map(i => `<i class="pip${i < lvl ? ' on' : ''}"></i>`).join('');
        const btn = lvl >= 3 ? `<button class="gbtn small" disabled>Maxed</button>` : `<button class="gbtn small primary lit" data-act="part" data-v="${p.id}" ${save.cash < partPrice(id, lvl) ? 'disabled' : ''}>Stage ${lvl + 1} · ${money(partPrice(id, lvl))}</button>`;
        return `<div class="item"><div class="item-main"><h3>${p.name} <span class="pips">${pips}</span></h3><p class="small dim">${p.desc}</p></div>${btn}</div>`;
      }).join('');
      h += `<h3>Dyno</h3><div class="dyno"><canvas id="dynoCv" width="560" height="220"></canvas>
        <div class="readouts"><div class="readout"><span class="lab">Power</span><b class="num" id="dynoHp">-</b></div><div class="readout"><span class="lab">Torque</span><b class="num" id="dynoNm">-</b></div></div>
        <div class="dyno-key"><span style="color:#FF5963">● Power (hp)</span><span style="color:#FFC400">● Torque (Nm)</span></div>
        <button class="gbtn small primary lit" data-act="dyno">Run the dyno</button></div>`;
      h += `<h3>Tuning</h3><p class="small dim">Free to adjust. Changes apply as soon as you leave the slider.</p>` + TUNES.map(t => {
        const v = (c.tune || {})[t.id] || 0;
        return `<div class="item tune"><div class="item-main"><div class="tune-head"><h3>${t.name}</h3><span class="small dim">${t.tip}</span></div>
          <div class="tune-row"><span class="small dim">${t.lo}</span><input type="range" min="${t.min}" max="${t.max}" step="0.1" value="${v}" data-tune="${t.id}" aria-label="${t.name}"><span class="small dim">${t.hi}</span></div></div></div>`;
      }).join('');
    }
    if (s.kind === 'paint') {
      h += `<h3>Paint · ${money(PRICE.paint)}</h3><div class="swatches">${PAINTS.map(p => swatch(p, p.toLowerCase() === (c.paint || '').toLowerCase(), 'paint', p)).join('')}</div>`;
      const opt = (act, v, label, on) => `<button class="chip${on ? ' on' : ''}" data-act="${act}" data-v="${v ?? ''}">${label}</button>`;
      h += `<h3>Vinyl · ${money(PRICE.vinyl)}</h3><div class="chips">${VINYLS.map(([v, n]) => opt('vinyl', v, n, v === c.vinyl)).join('')}</div>`;
      if (c.vinyl) h += `<h3>Vinyl colour · ${money(PRICE.vinylColor)}</h3><div class="swatches">${VINYL_COLORS.map(v => swatch(v, v === c.vinylColor, 'vinylColor', v)).join('')}</div>`;
      h += `<h3>Sponsor decals · ${money(PRICE.decals)}</h3><div class="chips">${opt('decals', 'on', 'Fitted', !!c.decals)}${opt('decals', 'off', 'None', !c.decals)}</div>`;
    }
    if (s.kind === 'acc') {
      h += `<h3>Underglow · ${money(PRICE.glow)}</h3><div class="swatches">${GLOWS.map(([v, n]) => swatch(v, v === c.glow, 'glow', v, n)).join('')}</div>`;
      h += `<h3>Rims · ${money(PRICE.rims)}</h3><div class="swatches">${RIMS.map(([v, n]) => swatch(v || '#B8BCCC', v === c.rims, 'rims', v, n)).join('')}</div>`;
    }
    if (s.kind === 'body') {
      const L = looks(id).spec, opt = (act, v, label, on) => `<button class="chip${on ? ' on' : ''}" data-act="${act}" data-v="${v}">${label}</button>`;
      h += `<h3>Spoiler · ${money(PRICE.spoiler)}</h3><div class="chips">${SPOILERS.map(([v, n]) => opt('spoiler', v, n, (L.spoiler || 'none') === v)).join('')}</div>`;
      h += `<h3>Hood scoop · ${money(PRICE.scoop)}</h3><div class="chips">${opt('scoop', 'on', 'Fitted', !!L.scoop)}${opt('scoop', 'off', 'None', !L.scoop)}</div>`;
      h += `<h3>Stripes · ${money(PRICE.stripe)}</h3><div class="chips">${opt('stripe', 'on', 'Twin stripes', !!L.stripe)}${opt('stripe', 'off', 'None', !L.stripe)}</div>`;
    }
    if (s.kind === 'clubs') h = s.html();
    $('shopBody').innerHTML = h;
  }
  _pay(n) { if (save.cash < n) { this.say('Not enough cash'); return false; } save.cash -= n; return true; }
  _click(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, v = b.dataset.v === '' ? null : b.dataset.v, id = save.current, c = save.cars[id];
    let changed = false;
    if (act === 'buycar') { const car = CARS[v]; if (!save.cars[v] && this._pay(car.price)) { save.cars[v] = newCar(START_PAINT[v]); save.current = v; changed = true; this.say(`The ${car.brand} ${car.name} is yours`); } }
    if (act === 'drive') { save.current = v; changed = true; }
    if (act === 'part') { const lvl = c.parts[v]; if (lvl < 3 && this._pay(partPrice(id, lvl))) { c.parts[v]++; changed = true; this.say(`${PARTS.find(p => p.id === v).name} stage ${lvl + 1} fitted`); } }
    const look = (key, val) => { if (c[key] === val) return; if (this._pay(PRICE[key])) { c[key] = val; changed = true; } };
    if (act === 'paint') look('paint', v);
    if (act === 'glow') look('glow', v);
    if (act === 'rims') look('rims', v);
    if (act === 'vinyl') look('vinyl', v);
    if (act === 'vinylColor') look('vinylColor', v);
    if (act === 'decals') look('decals', v === 'on');
    if (act === 'dyno') { this.runDyno(); return; }
    if (act === 'spoiler') { const cur = looks(id).spec.spoiler || 'none'; if (cur !== v && this._pay(PRICE.spoiler)) { c.spoiler = v; changed = true; } }
    if (act === 'scoop' || act === 'stripe') { const want = v === 'on', cur = !!looks(id).spec[act]; if (cur !== want && this._pay(PRICE[act])) { c[act] = want; changed = true; } }
    if (changed) { persist(); this.onChange(); }
    this.render();
  }
}

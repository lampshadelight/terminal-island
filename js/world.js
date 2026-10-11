import * as THREE from 'three';
import { R, GB, rng, inRect, hexToRgb, clamp } from './util.js';
import { PAL } from './textures.js';

/* ------------------------------------------------------------------
   Terminal Island, natural layout.
   A coast road runs round the island. The Ridge Road climbs through
   the hills in the middle with hairpins. Neon Row is a small town in
   the north-east, Dockside is the port on the south shore and Old
   Terminal is the airfield in the west. Roads are smooth curves; off
   the road is rough grass that slows you down. An inertia barrier runs
   along the shore. Three unfinished roads lead out over the sea to
   future cities. The whole island is built once at the start.
   ------------------------------------------------------------------ */

/* ---------------- shapes ---------------- */
const AX = 1500, AZ = 1150;
const coastK = a => 1 + 0.06 * Math.sin(3 * a + 0.7) + 0.04 * Math.sin(5 * a + 2.1) + 0.025 * Math.sin(9 * a + 0.3);
export const coastAt = (a, inset = 0) => { const k = coastK(a); return { x: Math.cos(a) * (AX * k - inset), z: Math.sin(a) * (AZ * k - inset) }; };

// Catmull-Rom through control points, one sample every few metres
function spline(pts, closed, step = 4) {
  const n = pts.length, out = [], P = i => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), m = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  if (!closed) out.push({ x: pts[n - 1].x, z: pts[n - 1].z });
  return out;
}
function measure(road) {
  const p = road.pts, cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
  if (road.closed) cum.push(cum[p.length - 1] + Math.hypot(p[0].x - p[p.length - 1].x, p[0].z - p[p.length - 1].z));
  road.cum = cum; road.len = cum[cum.length - 1];
}
// position and heading at distance s along a road
export function roadPose(road, s) {
  const p = road.pts, n = p.length, cum = road.cum;
  s = road.closed ? ((s % road.len) + road.len) % road.len : clamp(s, 0, road.len - 0.01);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const a = p[lo % n], b = p[(lo + 1) % n], t = (s - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: Math.atan2(b.x - a.x, b.z - a.z) };
}
const nearestIdx = (road, x, z) => { let bi = 0, bd = 1e18; road.pts.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
const C = (x, z) => ({ x, z });
const shift = (pts, dx, dz) => pts.map(([x, z]) => C(x + dx, z + dz));

/* ---------------- the road network ---------------- */
const TOWN = C(520, -380), YARD = R(-230, 590, 470, 935), APRON = R(-1110, 140, -190, 425);
export const ZONES = [
  { id: 'neon', name: 'Neon Row', x: TOWN.x, z: TOWN.z, r: 360 },
  { id: 'dock', name: 'Dockside', x: 120, z: 760, rect: YARD },
  { id: 'terminal', name: 'Old Terminal', x: -650, z: 250, rect: R(-1150, 20, -150, 470) }
];
const ROADS = [];
const add = (id, name, w, ctrl, closed = false) => { const r = { id, name, w, closed, pts: spline(ctrl, closed) }; measure(r); ROADS.push(r); return r; };
const coast = add('coast', 'Coast Road', 14, Array.from({ length: 30 }, (_, i) => coastAt(i / 30 * Math.PI * 2, 160)), true);
const town = add('town', 'Neon Row', 16, shift([[-240, -60], [-190, -200], [-30, -250], [130, -210], [250, -90], [240, 80], [130, 200], [-30, 160], [-120, 235], [-250, 130]], TOWN.x, TOWN.z), true);
const avenue = add('avenue', 'Neon Row', 18, shift([[-330, 0], [-150, 10], [0, 0], [150, -10], [330, 0]], TOWN.x, TOWN.z));
const dockLoop = add('dock', 'Dockside', 18, [C(-160, 650), C(120, 630), C(390, 660), C(410, 760), C(300, 825), C(0, 832), C(-180, 790)], true);
// links snap their ends onto the roads they join
function link(id, name, w, from, via, to) {
  const a = from.pts[nearestIdx(from, via[0][0], via[0][1])], b = to.pts[nearestIdx(to, via[via.length - 1][0], via[via.length - 1][1])];
  return add(id, name, w, [C(a.x, a.z), ...via.map(([x, z]) => C(x, z)), C(b.x, b.z)]);
}
const ridge = link('ridge', 'Ridge Road', 12, town, [[220, -280], [110, -170], [200, -60], [70, 40], [190, 150], [40, 250], [170, 360], [90, 470]], dockLoop);
link('north', 'Neon Row', 14, town, [[500, -660], [480, -760]], coast);
link('townEast', 'Neon Row', 14, avenue, [[900, -380], [1050, -360]], coast);
link('dockEast', 'Harbour Road', 14, dockLoop, [[560, 700], [720, 820]], coast);
link('dockWest', 'Harbour Road', 14, dockLoop, [[-330, 800], [-520, 880]], coast);
const airSouth = link('airSouth', 'Airport Road', 14, coast, [[-860, 720], [-760, 560]], { pts: [C(-700, 430)] });
const terminalRd = link('terminalRd', 'Airport Road', 14, ridge, [[60, -60], [-120, -60], [-320, 40], [-520, 60], [-760, 60]], { pts: [C(-980, 70)] });
link('apronEast', 'Airport Road', 12, ridge, [[-40, 260], [-140, 290]], { pts: [C(-190, 300)] });
export { ROADS };

// unfinished roads out over the sea, closed at construction barriers
export const CLOSED = [['The Foundry', 0], ['Highcliff', -Math.PI / 2 + 0.25], ['Causeway', Math.PI / 4]].map(([name, a]) => {
  const s = coast.pts[nearestIdx(coast, coastAt(a, 160).x, coastAt(a, 160).z)], c = coastAt(a), dx = c.x - s.x, dz = c.z - s.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const end = C(c.x + ux * 170, c.z + uz * 170), road = { id: 'closed', name: `Road to ${name}`, w: 14, closed: false, pts: spline([C(s.x, s.z), end], false) };
  measure(road); ROADS.push(road);
  return { name, road, x: end.x, z: end.z, ux, uz, a };
});

// races: checkpoints every 70 m round the town and the docks
const sampleLoop = (road, every) => { const n = Math.round(road.len / every), out = []; for (let i = 0; i < n; i++) { const p = roadPose(road, i * road.len / n); out.push(C(Math.round(p.x), Math.round(p.z))); } return out; };
export const ROUTES = { town: sampleLoop(town, 70), dock: sampleLoop(dockLoop, 55) };
export const STRIPS = { quay: { cz: 880, x0: -180 }, runway: { cz: 250 } };

// shop doors sit just off the road
function roadside(road, frac, side, off = 8) {
  const p = roadPose(road, road.len * frac), nx = Math.cos(p.h) * side, nz = -Math.sin(p.h) * side;
  return { x: p.x + nx * (road.w / 2 + off), z: p.z + nz * (road.w / 2 + off), h: Math.atan2(-nx, -nz) };
}
export const SPOTS = {
  cars: roadside(avenue, 0.3, 1), parts: roadside(dockLoop, 0.47, -1), paint: roadside(terminalRd, 0.55, 1),
  body: roadside(town, 0.62, -1), acc: roadside(coast, 0.06, -1)
};

export const DATA = { neon: { spawn: (() => { const p = roadPose(avenue, avenue.len * 0.62); return { x: p.x, z: p.z, h: p.h }; })() } };

/* ---------------- what is where ---------------- */
const CELL = 40, RHASH = new Map(), SHASH = new Map();
const cellsOf = (x0, z0, x1, z1, fn) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) fn(i + ',' + j); };
const put = (H, k, v) => { if (!H.has(k)) H.set(k, []); H.get(k).push(v); };
for (const road of ROADS) {
  const p = road.pts, n = p.length, segs = road.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = p[i], b = p[(i + 1) % n], seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, hw: road.w / 2, road };
    cellsOf(Math.min(a.x, b.x) - road.w, Math.min(a.z, b.z) - road.w, Math.max(a.x, b.x) + road.w, Math.max(a.z, b.z) + road.w, k => put(RHASH, k, seg));
  }
}
function segDist(s, x, z) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1);
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}
// distance from the edge of the nearest road (negative = on it)
export function roadEdge(x, z) {
  let best = 1e9, road = null;
  const l = RHASH.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (l) for (const s of l) { const d = segDist(s, x, z) - s.hw; if (d < best) { best = d; road = s.road; } }
  return { d: best, road };
}
const PAVED = [YARD, APRON];
export function onRoad(x, z) { return roadEdge(x, z).d < 0.5 || PAVED.some(r => inRect(r, x, z)); }

/* ---------------- solid things: buildings, trees, hills, the shore barrier ---------------- */
const SOLIDS = [];
function addSolid(s) {
  SOLIDS.push(s);
  const e = s.t === 'c' ? s.r : s.t === 'o' ? Math.hypot(s.hx, s.hz) : 1;
  const x0 = s.t === 's' ? Math.min(s.ax, s.bx) : s.x - e, x1 = s.t === 's' ? Math.max(s.ax, s.bx) : s.x + e;
  const z0 = s.t === 's' ? Math.min(s.az, s.bz) : s.z - e, z1 = s.t === 's' ? Math.max(s.az, s.bz) : s.z + e;
  cellsOf(x0, z0, x1, z1, k => put(SHASH, k, s));
}
const blocked = (x, z, r) => { const l = SHASH.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; return l.some(s => s.t !== 's' && Math.hypot(s.x - x, s.z - z) < r + (s.t === 'c' ? s.r : Math.max(s.hx, s.hz))); };
const nearSpot = (x, z, r) => Object.values(SPOTS).some(s => Math.hypot(s.x - x, s.z - z) < r);
const STRIP_CLEAR = [R(-260, 862, 420, 898), R(-1180, 222, -40, 278)];
// distance to the edge of any road, checking them all (only used while laying out the island)
function farEdge(x, z) { let best = 1e9; for (const road of ROADS) for (const q of road.pts) { const d = Math.hypot(q.x - x, q.z - z) - road.w / 2 - 2; if (d < best) best = d; } return best; }
const clearOf = (x, z, r) => (r > 6 ? farEdge(x, z) : roadEdge(x, z).d) > r && !nearSpot(x, z, r + 12) && !STRIP_CLEAR.some(c => inRect(c, x, z, r));

const LAYOUT = (() => {
  const rnd = rng(4242), L = { buildings: [], containers: [], hills: [], trees: [], hangars: [], lamps: [] };
  // town: buildings line the streets, taller in the middle
  for (const road of [avenue, town, ROADS.find(r => r.id === 'north')]) {
    for (let s = 6; s < road.len; s += 19 + rnd() * 6) for (const side of [-1, 1]) {
      if (rnd() < 0.15) continue;
      const p = roadPose(road, s), nx = Math.cos(p.h) * side, nz = -Math.sin(p.h) * side;
      const depth = 12 + rnd() * 14, along = 11 + rnd() * 6, off = road.w / 2 + 5 + depth / 2;
      const x = p.x + nx * off, z = p.z + nz * off, rad = Math.hypot(depth, along) / 2;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) > 400 || !clearOf(x, z, rad + 1) || blocked(x, z, rad)) continue;
      // the box's local x axis runs along the road
      const mid = 1 - clamp(Math.hypot(x - TOWN.x, z - TOWN.z) / 380, 0, 1), b = { t: 'o', x, z, hx: along / 2, hz: depth / 2, ux: Math.sin(p.h), uz: Math.cos(p.h), h: 9 + rnd() * 14 + mid * mid * (30 + rnd() * 50) };
      addSolid(b); L.buildings.push(b);
    }
  }
  // the port: container stacks and warehouses inside the yard
  for (let x = YARD.x0 + 12; x < YARD.x1 - 12; x += 16) for (let z = YARD.z0 + 10; z < YARD.z1 - 10; z += 8) {
    if (rnd() < 0.35) continue;
    const c = { t: 'o', x, z, hx: 6.1, hz: 1.25, a: 0, ux: 1, uz: 0, stack: 1 + Math.floor(rnd() * 3) };
    if (!clearOf(x, z, 9) || blocked(x, z, 5)) continue;
    addSolid(c); L.containers.push(c);
  }
  // the airfield: hangars north of the runway
  for (const x of [-940, -700, -460]) { const h = { t: 'o', x, z: 395, hx: 50, hz: 22, a: 0, ux: 1, uz: 0 }; addSolid(h); L.hangars.push(h); }
  L.terminal = [{ t: 'o', x: -700, z: 100, hx: 130, hz: 18, a: 0, ux: 1, uz: 0, h: 16 }, { t: 'o', x: -460, z: 110, hx: 8, hz: 8, a: 0, ux: 1, uz: 0, h: 44, tower: true }];
  for (const b of L.terminal) if (clearOf(b.x, b.z, 4)) addSolid(b);
  // hills in the open country
  const HILLS = [[-450, -300, 150, 120], [-180, -560, 170, 150], [-700, -380, 120, 90], [-950, -200, 110, 80], [380, 280, 90, 70], [880, 120, 150, 120], [700, 420, 100, 80], [-450, 600, 110, 70], [-1000, 650, 90, 60], [1150, -600, 80, 60], [-300, 300, 90, 60], [-650, -700, 120, 90], [150, -750, 90, 70]];
  for (const [x, z, r, h] of HILLS) {
    if (farEdge(x, z) < r + 10 || PAVED.some(p => inRect(p, x, z, r))) continue;
    const s = { t: 'c', x, z, r: r * 0.82, vr: r, h, seed: x * 3 + z }; addSolid(s); L.hills.push(s);
  }
  // trees everywhere else
  for (let k = 0; k < 2600; k++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()), c = coastAt(a, 50), x = c.x * rr, z = c.z * rr;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 300 || PAVED.some(p => inRect(p, x, z, 25)) || inRect(R(-1150, 20, -150, 470), x, z)) continue;
    if (!clearOf(x, z, 5) || blocked(x, z, 2)) continue;
    const t = { t: 'c', x, z, r: 1.1, s: 0.8 + rnd() * 0.7 }; addSolid(t); L.trees.push(t);
  }
  // street lamps
  for (const road of ROADS) for (let s = 10, side = 1; s < road.len; s += road.id === 'coast' ? 70 : 45, side = -side) {
    const p = roadPose(road, s), nx = Math.cos(p.h) * side, nz = -Math.sin(p.h) * side, off = road.w / 2 + 1.5;
    L.lamps.push([p.x + nx * off, p.z + nz * off, -nx, -nz]);
  }
  return L;
})();

// shore barrier, with gaps where the unfinished roads leave the island
const SHORE = Array.from({ length: 260 }, (_, i) => coastAt(i / 260 * Math.PI * 2, 18));
for (let i = 0; i < SHORE.length; i++) {
  const a = SHORE[i], b = SHORE[(i + 1) % SHORE.length];
  if (CLOSED.some(c => Math.hypot((a.x + b.x) / 2 - (c.x - c.ux * 170), (a.z + b.z) / 2 - (c.z - c.uz * 170)) < 40)) continue;
  addSolid({ t: 's', ax: a.x, az: a.z, bx: b.x, bz: b.z });
}
// barriers at the end of the closed roads, and rails along their bridges
for (const c of CLOSED) {
  const px = -c.uz, pz = c.ux;
  addSolid({ t: 's', ax: c.x - c.ux * 2 + px * 9, az: c.z - c.uz * 2 + pz * 9, bx: c.x - c.ux * 2 - px * 9, bz: c.z - c.uz * 2 - pz * 9 });
  for (const sd of [-1, 1]) addSolid({ t: 's', ax: c.x + px * 7.5 * sd, az: c.z + pz * 7.5 * sd, bx: c.x - c.ux * 230 + px * 7.5 * sd, bz: c.z - c.uz * 230 + pz * 7.5 * sd });
}

export function nearbySolids(x, z) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL), out = new Set();
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const l = SHASH.get(a + ',' + b); if (l) for (const s of l) out.add(s); }
  return out;
}
// Push a circle out of anything solid. Returns the impact speed (0 if nothing was hit).
export function collide(o, rad) {
  let hit = 0;
  for (const s of nearbySolids(o.x, o.z)) {
    let nx, nz, pen;
    if (s.t === 'c') {
      const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz), R2 = s.r + rad;
      if (d >= R2 || d < 1e-6) continue;
      nx = dx / d; nz = dz / d; pen = R2 - d;
    } else if (s.t === 's') {
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = clamp(((o.x - s.ax) * dx + (o.z - s.az) * dz) / L2, 0, 1);
      const cx = s.ax + dx * t, cz = s.az + dz * t, ex = o.x - cx, ez = o.z - cz, d = Math.hypot(ex, ez), R2 = rad + 0.4;
      if (d >= R2 || d < 1e-6) continue;
      nx = ex / d; nz = ez / d; pen = R2 - d;
    } else {
      const dx = o.x - s.x, dz = o.z - s.z, lx = dx * s.ux + dz * s.uz, lz = -dx * s.uz + dz * s.ux;
      const cx = clamp(lx, -s.hx, s.hx), cz = clamp(lz, -s.hz, s.hz), ex = lx - cx, ez = lz - cz, d2 = ex * ex + ez * ez;
      if (d2 >= rad * rad) continue;
      let lnx, lnz;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); lnx = ex / d; lnz = ez / d; pen = rad - d; }
      else {
        const m = Math.min(s.hx - lx, lx + s.hx, s.hz - lz, lz + s.hz);
        if (m === s.hx - lx) { lnx = 1; lnz = 0; } else if (m === lx + s.hx) { lnx = -1; lnz = 0; } else if (m === s.hz - lz) { lnx = 0; lnz = 1; } else { lnx = 0; lnz = -1; }
        pen = m + rad;
      }
      nx = lnx * s.ux - lnz * s.uz; nz = lnx * s.uz + lnz * s.ux;
    }
    o.x += nx * pen; o.z += nz * pen;
    const vn = o.vx * nx + o.vz * nz;
    if (vn < 0) { o.vx -= 1.3 * vn * nx; o.vz -= 1.3 * vn * nz; o.vx *= 0.82; o.vz *= 0.82; hit = Math.max(hit, -vn); }
  }
  return hit;
}

export function placeAt(x, z) {
  for (const zn of ZONES) if (zn.rect ? inRect(zn.rect, x, z, 30) : Math.hypot(x - zn.x, z - zn.z) < zn.r) return { kind: 'district', d: zn, name: zn.name };
  const e = roadEdge(x, z);
  if (e.road && e.d < 30) {
    const c = CLOSED.find(c => c.road === e.road);
    if (c && Math.hypot(x - c.x, z - c.z) < 200) return { kind: 'closed', c, name: c.road.name };
    return { kind: 'road', name: e.road.name };
  }
  return { kind: 'none', name: 'Terminal Island' };
}

/* ---------------- building the meshes ---------------- */
function obox(gb, s, y0, y1, col, top = true) {
  const P = (lx, lz) => [s.x + lx * s.ux - lz * s.uz, s.z + lx * s.uz + lz * s.ux];
  const [a, b, c, d] = [P(-s.hx, -s.hz), P(s.hx, -s.hz), P(s.hx, s.hz), P(-s.hx, s.hz)];
  const v = (p, y) => [p[0], y, p[1]];
  if (top) gb.quad(v(a, y1), v(b, y1), v(c, y1), v(d, y1), null, col);
  const wall = (p, q, u0) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) / 24; gb.quad(v(p, y0), v(q, y0), v(q, y1), v(p, y1), [u0, y0 / 24, u0 + L, y0 / 24, u0 + L, y1 / 24, u0, y1 / 24], col); };
  wall(a, b, 0); wall(b, c, 0.375); wall(c, d, 0.625); wall(d, a, 0.125);
}
function ribbon(gb, road, y, uvLen = 20) {
  const p = road.pts, n = p.length, hw = road.w / 2, idx = road.closed ? [...p.keys(), 0] : [...p.keys()];
  let prev = null, v = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k], a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    const ta = road.closed || i > 0 ? a : p[i], tb = road.closed || i < n - 1 ? b : p[i];
    const tx = tb.x - ta.x, tz = tb.z - ta.z, L = Math.hypot(tx, tz) || 1, nx = tz / L, nz = -tx / L;
    const l = [p[i].x + nx * hw, y, p[i].z + nz * hw], r = [p[i].x - nx * hw, y, p[i].z - nz * hw];
    if (prev) { v += Math.hypot(p[i].x - prev.x, p[i].z - prev.z) / uvLen; gb.quad(prev.l, prev.r, r, l, [0, prev.v, 1, prev.v, 1, v, 0, v]); }
    prev = { l, r, v, x: p[i].x, z: p[i].z };
  }
}
function addWordMesh(g, T, text, color, x, y, z, w, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: T.word(text, color), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.renderOrder = 3; g.add(m);
}

let ISLAND = null;
export function buildStatic(scene, T, M) {
  const g = new THREE.Group(); g.name = 'island';
  const rnd = rng(99), B = { road: new GB(), tarmac: new GB(), paint: new GB(), b: new GB(), s: new GB(), e: new GB(), hoard: new GB() };
  // ground: the island, a strip of beach, and the sea
  const shape = new THREE.Shape(Array.from({ length: 240 }, (_, i) => { const c = coastAt(i / 240 * Math.PI * 2); return new THREE.Vector2(c.x, c.z); }));
  const land = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: 0x1c2a1c, side: THREE.DoubleSide }));
  land.rotation.x = Math.PI / 2; land.position.y = -0.02; land.layers.set(1); g.add(land);
  const beach = new GB();
  for (let i = 0; i < 240; i++) {
    const a0 = i / 240 * Math.PI * 2, a1 = (i + 1) / 240 * Math.PI * 2, o0 = coastAt(a0, -12), o1 = coastAt(a1, -12), n0 = coastAt(a0, 6), n1 = coastAt(a1, 6);
    beach.quad([n0.x, -0.01, n0.z], [n1.x, -0.01, n1.z], [o1.x, -0.6, o1.z], [o0.x, -0.6, o0.z], null, [0.32, 0.3, 0.24]);
  }
  g.add(new THREE.Mesh(beach.build(), M.solid));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshLambertMaterial({ color: 0x0a1418 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; sea.layers.set(1); g.add(sea);
  // roads, paved areas and the closed bridges
  ROADS.forEach((r, i) => ribbon(B.road, r, 0.03 + (i % 7) * 0.004));
  for (const p of PAVED) B.tarmac.flat(p, 0.015, [p.x0 / 30, p.z0 / 30, p.x1 / 30, p.z0 / 30, p.x1 / 30, p.z1 / 30, p.x0 / 30, p.z1 / 30]);
  // runway markings
  const white = [0.95, 0.95, 0.95];
  for (let x = -1060; x < -260; x += 50) B.paint.flat(R(x, 249.4, x + 30, 250.6), 0.045, null, white);
  B.paint.flat(R(-1090, 226, -220, 226.6), 0.045, null, white); B.paint.flat(R(-1090, 273.4, -220, 274), 0.045, null, white);
  // quay edge stripe
  B.paint.flat(R(YARD.x0, YARD.z1 - 2, YARD.x1, YARD.z1 - 1.4), 0.045, null, hexToRgb(PAL.amber));
  for (const c of CLOSED) {
    const px = -c.uz, pz = c.ux;
    for (let k = 0; k < 6; k++) { const x = c.x - c.ux * k * 35, z = c.z - c.uz * k * 35; B.s.box(x - 2, -6, z - 2, x + 2, 0, z + 2, [0.28, 0.28, 0.3]); }
    for (const sd of [-1, 1]) for (let k = 0; k < 23; k++) { const x = c.x - c.ux * k * 10 + px * 7.6 * sd, z = c.z - c.uz * k * 10 + pz * 7.6 * sd; B.s.box(x - 0.2, 0, z - 0.2, x + 0.2, 1.1, z + 0.2, [0.4, 0.4, 0.42]); }
    const ex = c.x - c.ux * 2, ez = c.z - c.uz * 2;
    B.hoard.quad([ex + px * 9, 0, ez + pz * 9], [ex - px * 9, 0, ez - pz * 9], [ex - px * 9, 2.6, ez - pz * 9], [ex + px * 9, 2.6, ez + pz * 9], [0, 0, 1.25, 0, 1.25, 1, 0, 1]);
    const rot = Math.atan2(-c.ux, -c.uz);
    addWordMesh(g, T, 'ROAD CLOSED', '#ffffff', ex - c.ux * 0.3, 4.2, ez - c.uz * 0.3, 12, rot);
    addWordMesh(g, T, c.name.toUpperCase() + ' · UNDER CONSTRUCTION', PAL.amber, ex - c.ux * 0.3, 3.1, ez - c.uz * 0.3, 16, rot);
  }
  // buildings, containers, hangars, the terminal
  const TINTS = [[1, 1, 1], [0.86, 0.9, 1.05], [1.08, 0.95, 0.85], [1, 0.88, 0.86], [0.92, 0.95, 0.98]];
  for (const b of LAYOUT.buildings) { const t = TINTS[Math.floor(rnd() * TINTS.length)], m = 0.7 + rnd() * 0.3; obox(B.b, b, 0, b.h, [t[0] * m, t[1] * m, t[2] * m]); }
  const CC = [[0.55, 0.16, 0.1], [0.75, 0.25, 0.05], [0.35, 0.36, 0.38], [0.14, 0.45, 0.42], [0.7, 0.68, 0.64], [0.6, 0.06, 0.05]];
  for (const c of LAYOUT.containers) for (let k = 0; k < c.stack; k++) obox(B.s, c, k * 2.6, (k + 1) * 2.6 - 0.05, CC[Math.floor(rnd() * CC.length)]);
  for (const h of LAYOUT.hangars) { obox(B.s, h, 0, 20, [0.26, 0.27, 0.29]); B.e.quad([h.x - 38, 0.2, h.z - h.hz - 0.05], [h.x + 38, 0.2, h.z - h.hz - 0.05], [h.x + 38, 14, h.z - h.hz - 0.05], [h.x - 38, 14, h.z - h.hz - 0.05], null, [0.32, 0.22, 0.12]); }
  for (const b of LAYOUT.terminal) obox(b.tower ? B.s : B.b, b, 0, b.h, b.tower ? [0.4, 0.7, 0.68] : [0.75, 0.88, 1]);
  // hills: low-poly mounds
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x24301f, flatShading: true });
  for (const h of LAYOUT.hills) {
    const geo = new THREE.ConeGeometry(h.vr, h.h, 9, 3), pos = geo.attributes.position, r2 = rng(h.seed);
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < h.h / 2 - 1) { pos.setX(i, pos.getX(i) * (0.85 + r2() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.85 + r2() * 0.3)); pos.setY(i, y + (r2() - 0.5) * h.h * 0.12); } }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, hillMat); m.position.set(h.x, h.h / 2 - 2, h.z); g.add(m);
  }
  // trees as two instanced meshes
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), LAYOUT.trees.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 7, 6), new THREE.MeshLambertMaterial({ color: 0x1f3d22, flatShading: true }), LAYOUT.trees.length);
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  LAYOUT.trees.forEach((t, i) => {
    sv.set(t.s, t.s, t.s); pv.set(t.x, 1.5 * t.s, t.z); trunk.setMatrixAt(i, mt.compose(pv, q, sv));
    pv.set(t.x, (3 + 3.5) * t.s, t.z); crown.setMatrixAt(i, mt.compose(pv, q, sv));
  });
  g.add(trunk, crown);
  // street lamps: a pole and a warm point of light
  const lampPts = [];
  for (const [x, z] of LAYOUT.lamps) { B.s.box(x - 0.12, 0, z - 0.12, x + 0.12, 7.5, z + 0.12, [0.07, 0.07, 0.08]); lampPts.push(x, 7.6, z); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(lampPts, 3));
  g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 5, map: T.glow, color: 0xffb066, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  // the shore barrier: a low wall with the orange shimmer of the inertia field
  const glow = hexToRgb(PAL.orange).map(v => v * 0.55);
  for (const s of SOLIDS) if (s.t === 's') {
    const dx = s.bx - s.ax, dz = s.bz - s.az, L = Math.hypot(dx, dz) || 1, nx = dz / L * 0.4, nz = -dx / L * 0.4;
    B.s.quad([s.ax + nx, 1.2, s.az + nz], [s.bx + nx, 1.2, s.bz + nz], [s.bx - nx, 1.2, s.bz - nz], [s.ax - nx, 1.2, s.az - nz], null, [0.22, 0.22, 0.24]);
    for (const sd of [1, -1]) B.e.quad([s.ax + nx * sd, 0.55, s.az + nz * sd], [s.bx + nx * sd, 0.55, s.bz + nz * sd], [s.bx + nx * sd, 0.75, s.bz + nz * sd], [s.ax + nx * sd, 0.75, s.az + nz * sd], null, glow);
    for (const sd of [1, -1]) B.s.quad([s.ax + nx * sd, 0, s.az + nz * sd], [s.bx + nx * sd, 0, s.bz + nz * sd], [s.bx + nx * sd, 1.2, s.bz + nz * sd], [s.ax + nx * sd, 1.2, s.az + nz * sd], null, [0.2, 0.2, 0.22]);
  }
  const put2 = (gb, mat, order, ground) => { if (gb.empty) return; const m = new THREE.Mesh(gb.build(), mat); if (order) m.renderOrder = order; if (ground) m.layers.set(1); g.add(m); };
  put2(B.road, M.road, 0, true); put2(B.tarmac, M.tarmac, 0, true); put2(B.paint, M.paint, 1, true);
  put2(B.s, M.solid); put2(B.b, M.building); put2(B.e, M.emissive); put2(B.hoard, M.hoarding);
  scene.add(g); ISLAND = g;
  return g;
}

// Kept so the rest of the game can ask what is loaded; the island is small enough to keep in memory whole.
export class Streamer {
  constructor() { this.loaded = new Map(); }
  update(x, z, onLoad) { if (!this.loaded.size && ISLAND) { this.loaded.set('island', ISLAND); onLoad && onLoad('island'); } }
}

/* ---------------- map data for the minimap and full map ---------------- */
export function mapShapes() {
  return { coast: Array.from({ length: 180 }, (_, i) => coastAt(i / 180 * Math.PI * 2)), roads: ROADS, paved: PAVED, zones: ZONES, closed: CLOSED, hills: LAYOUT.hills };
}

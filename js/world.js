import * as THREE from 'three';
import { R, GB, rng, inRect, rectDist, hexToRgb } from './util.js';
import { PAL } from './textures.js';

/* ------------------------------------------------------------------
   Terminal Island layout.
   Each district is a 1 km square. Districts are joined by tunnels
   through rock berms, so only the district you are in has to be
   loaded; the next one is built while you are inside the tunnel.
   ------------------------------------------------------------------ */
export const HALF = 500;
export const DISTRICTS = {
  neon: { id: 'neon', name: 'Neon Row', cx: 0, cz: 0 },
  terminal: { id: 'terminal', name: 'Old Terminal', cx: -1250, cz: 0 },
  dock: { id: 'dock', name: 'Dockside', cx: 0, cz: 1250 }
};
export const TUNNELS = [
  { id: 'west', name: 'West Tunnel', a: 'neon', b: 'terminal', rect: R(-750, -10, -500, 10), axis: 'x' },
  { id: 'south', name: 'Harbour Tunnel', a: 'neon', b: 'dock', rect: R(-10, 500, 10, 750), axis: 'z' }
];
// Roads that already exist but stop at construction barriers (future districts).
export const CLOSED = [
  { name: 'The Foundry', rect: R(500, -10, 680, 10), axis: 'x', end: 1 },
  { name: 'Highcliff', rect: R(-10, -680, 10, -500), axis: 'z', end: -1 },
  { name: 'Causeway', rect: R(500, 1200, 680, 1220), axis: 'x', end: 1 }
];
// Gaps between districts are filled with rock berms the tunnels run through.
const BERMS = [R(-750, -500, -500, 500), R(-500, 500, 500, 750)];

const SIDEWALK = [0.19, 0.2, 0.22];
const TINTS = [[1, 1, 1], [0.86, 0.9, 1.05], [1.08, 0.95, 0.85], [1, 0.88, 0.86], [0.92, 0.95, 0.98]];

/* ---------------- layout data (cheap, always in memory) ---------------- */
function base(def, RW) {
  return { ...def, RW, rect: R(def.cx - HALF, def.cz - HALF, def.cx + HALF, def.cz + HALF),
    vRoads: [], hRoads: [], inters: [], tarmac: [], blocks: [], solids: [], lamps: [], nodes: [], edges: [], features: [] };
}
function addGrid(d, xo, zo, ext = {}) {
  const { cx, cz, RW } = d, h = RW / 2;
  const z0 = ext.z0 ?? zo[0], z1 = ext.z1 ?? zo[zo.length - 1], x0 = ext.x0 ?? xo[0], x1 = ext.x1 ?? xo[xo.length - 1];
  for (const o of xo) d.vRoads.push(R(cx + o - h, cz + z0 - h, cx + o + h, cz + z1 + h));
  for (const o of zo) d.hRoads.push(R(cx + x0 - h, cz + o - h, cx + x1 + h, cz + o + h));
  const id = (i, j) => `${cx + xo[i]},${cz + zo[j]}`;
  for (let i = 0; i < xo.length; i++) for (let j = 0; j < zo.length; j++) {
    d.inters.push(R(cx + xo[i] - h, cz + zo[j] - h, cx + xo[i] + h, cz + zo[j] + h));
    d.nodes.push({ id: id(i, j), x: cx + xo[i], z: cz + zo[j] });
    if (i + 1 < xo.length) d.edges.push([id(i, j), id(i + 1, j)]);
    if (j + 1 < zo.length) d.edges.push([id(i, j), id(i, j + 1)]);
  }
  for (let i = 0; i < xo.length - 1; i++) for (let j = 0; j < zo.length - 1; j++)
    d.blocks.push({ i, j, rect: R(cx + xo[i] + h, cz + zo[j] + h, cx + xo[i + 1] - h, cz + zo[j + 1] - h), kind: 'towers' });
}
function bandSegments(band, alongZ, outer, openings) {
  let segs = [alongZ ? [band.z0, band.z1] : [band.x0, band.x1]];
  for (const o of openings) {
    const touches = alongZ ? (o.x0 === outer || o.x1 === outer) : (o.z0 === outer || o.z1 === outer);
    if (!touches) continue;
    const a = alongZ ? o.z0 : o.x0, b = alongZ ? o.z1 : o.x1, next = [];
    for (const [s, e] of segs) { if (b <= s || a >= e) next.push([s, e]); else { if (a > s) next.push([s, a]); if (b < e) next.push([b, e]); } }
    segs = next;
  }
  return segs.map(([a, b]) => (alongZ ? R(band.x0, a, band.x1, b) : R(a, band.z0, b, band.z1)));
}
function addWalls(d) {
  const { x0, z0, x1, z1 } = d.rect, T = 10, open = [...TUNNELS.map(t => t.rect), ...CLOSED.map(c => c.rect)];
  d.walls = [
    ...bandSegments(R(x0, z0, x0 + T, z1), true, x0, open).map(r => ({ r, face: 'x', at: r.x1 })),
    ...bandSegments(R(x1 - T, z0, x1, z1), true, x1, open).map(r => ({ r, face: 'x', at: r.x0 })),
    ...bandSegments(R(x0, z0, x1, z0 + T), false, z0, open).map(r => ({ r, face: 'z', at: r.z1 })),
    ...bandSegments(R(x0, z1 - T, x1, z1), false, z1, open).map(r => ({ r, face: 'z', at: r.z0 }))
  ];
  for (const w of d.walls) d.solids.push(w.r);
}
function finishBlocks(d) { for (const b of d.blocks) if (!b.open) d.solids.push(b.rect); }
function blockLamps(d) {
  for (const b of d.blocks) {
    const { x0, z0, x1, z1 } = b.rect;
    for (const [x, z, px, pz] of [[x0 + 1.2, z0 + 1.2, -1, -1], [x1 - 1.2, z0 + 1.2, 1, -1], [x0 + 1.2, z1 - 1.2, -1, 1], [x1 - 1.2, z1 - 1.2, 1, 1]])
      d.lamps.push([x, z, px, pz]);
  }
}

function neonData() {
  const d = base(DISTRICTS.neon, 20), r = rng(101);
  const o = [-480, -384, -288, -192, -96, 0, 96, 192, 288, 384, 480];
  addGrid(d, o, o);
  for (const b of d.blocks) {
    const cxn = (b.rect.x0 + b.rect.x1) / 2 / HALF, czn = (b.rect.z0 + b.rect.z1) / 2 / HALF;
    b.down = Math.max(0, 1 - Math.hypot(cxn, czn) * 1.25);
    if (b.down < 0.3 && r() < 0.1) b.kind = 'plaza';
  }
  // two hidden construction sites (future world tunnels), deliberately ordinary-looking
  pickBlock(d, 7, 1).kind = 'construction';
  pickBlock(d, 1, 6).kind = 'construction';
  // gateway arches over the main avenue, and a skybridge the road passes under
  for (const zc of [-336, -144, 144, 336]) d.features.push({ type: 'arch', x: 0, z: zc, axis: 'z', span: 20 });
  d.features.push({ type: 'skybridge', x0: 202, x1: 278, z: -192, axis: 'x', span: 20 });
  d.features.push({ type: 'skybridge', x0: -278, x1: -202, z: 192, axis: 'x', span: 20 });
  finishBlocks(d); blockLamps(d); addWalls(d);
  d.spawn = { x: 96, z: 48, h: Math.PI };
  return d;
}
function pickBlock(d, i, j) { return d.blocks.find(b => b.i === i && b.j === j); }

function dockData() {
  const d = base(DISTRICTS.dock, 26), r = rng(202), { cx, cz } = d;
  addGrid(d, [-477, -240, 0, 240, 477], [-477, -260, -40, 180, 400]);
  const kinds = ['containers', 'containers', 'warehouse', 'containers', 'yard', 'warehouse'];
  for (const b of d.blocks) b.kind = kinds[Math.floor(r() * kinds.length)];
  pickBlock(d, 2, 1).kind = 'construction';
  // quay along the south shore: open concrete with gantry cranes you drive between
  d.quay = R(cx - 490, cz + 413, cx + 490, cz + 490);
  d.tarmac.push(d.quay);
  d.cranes = [-360, -120, 120, 360].map(x => ({ x: cx + x, z0: cz + 425, z1: cz + 478 }));
  for (const c of d.cranes) for (const dx of [-9, 9]) for (const z of [c.z0, c.z1]) d.solids.push(R(c.x + dx - 1, z - 1, c.x + dx + 1, z + 1));
  finishBlocks(d); blockLamps(d); addWalls(d);
  d.straight = { z: cz + 400, x0: cx - 470, x1: cx + 470 };
  return d;
}

function terminalData() {
  const d = base(DISTRICTS.terminal, 22), { cx, cz, RW } = d, h = RW / 2, P = 479;
  // landside grid: terminal, parking, tower, hotel
  addGrid(d, [-P, -200, 100, P], [-P, -300, -150]);
  // the ring road continues around the airside
  d.vRoads.push(R(cx - P - h, cz - 150, cx - P + h, cz + P + h), R(cx + P - h, cz - 150, cx + P + h, cz + P + h));
  d.hRoads.push(R(cx - P - h, cz + P - h, cx + P + h, cz + P + h));
  for (const x of [-P, P]) d.inters.push(R(cx + x - h, cz + P - h, cx + x + h, cz + P + h));
  const kinds = { '0,0': 'hotel', '1,0': 'parking', '2,0': 'construction', '0,1': 'tower', '1,1': 'terminal', '2,1': 'terminal' };
  for (const b of d.blocks) b.kind = kinds[`${b.i},${b.j}`] || 'towers';
  // airside: one big open apron with a runway for drag and roll races
  d.apron = R(cx - P + h, cz - 150 + h, cx + P - h, cz + P - h);
  d.tarmac.push(d.apron);
  d.runway = { x0: cx - 440, x1: cx + 440, z: cz + 250, w: 46 };
  d.taxiway = { x0: cx - 420, x1: cx + 420, z: cz + 70, w: 24 };
  d.hangars = [[-430, -300], [-120, 10], [190, 320]].map(([a, b]) => R(cx + a, cz + 318, cx + b, cz + 455));
  for (const hg of d.hangars) d.solids.push(hg);
  finishBlocks(d); blockLamps(d); addWalls(d);
  return d;
}

export const DATA = { neon: neonData(), dock: dockData(), terminal: terminalData() };

/* ---------------- collision (all districts, always) ---------------- */
const ALL_SOLIDS = [];
for (const d of Object.values(DATA)) ALL_SOLIDS.push(...d.solids);
for (const t of [...TUNNELS, ...CLOSED]) {
  const r = t.rect;
  if (t.axis === 'x') ALL_SOLIDS.push(R(r.x0, r.z0 - 2, r.x1, r.z0), R(r.x0, r.z1, r.x1, r.z1 + 2));
  else ALL_SOLIDS.push(R(r.x0 - 2, r.z0, r.x0, r.z1), R(r.x1, r.z0, r.x1 + 2, r.z1));
}
for (const c of CLOSED) {
  const r = c.rect;
  if (c.axis === 'x') ALL_SOLIDS.push(c.end > 0 ? R(r.x1 - 3, r.z0, r.x1, r.z1) : R(r.x0, r.z0, r.x0 + 3, r.z1));
  else ALL_SOLIDS.push(c.end > 0 ? R(r.x0, r.z1 - 3, r.x1, r.z1) : R(r.x0, r.z0, r.x1, r.z0 + 3));
}
// spatial hash so each frame only checks nearby walls
const CELL = 64, HASH = new Map();
for (const s of ALL_SOLIDS) {
  for (let i = Math.floor(s.x0 / CELL); i <= Math.floor(s.x1 / CELL); i++)
    for (let j = Math.floor(s.z0 / CELL); j <= Math.floor(s.z1 / CELL); j++) {
      const k = i + ',' + j; if (!HASH.has(k)) HASH.set(k, []); HASH.get(k).push(s);
    }
}
export function nearbySolids(x, z) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL), out = new Set();
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const l = HASH.get(a + ',' + b); if (l) for (const s of l) out.add(s); }
  return out;
}
// Circle-vs-rectangle push-out. Returns the impact speed (0 if nothing was hit).
export function collide(o, rad) {
  let hit = 0, nx = 0, nz = 0;
  for (const b of nearbySolids(o.x, o.z)) {
    const cx = Math.min(Math.max(o.x, b.x0), b.x1), cz = Math.min(Math.max(o.z, b.z0), b.z1);
    const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    let pen;
    if (d2 > 1e-8) { const dd = Math.sqrt(d2); nx = dx / dd; nz = dz / dd; pen = rad - dd; }
    else {
      const l = o.x - b.x0, rr = b.x1 - o.x, t = o.z - b.z0, bt = b.z1 - o.z, m = Math.min(l, rr, t, bt);
      if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
      pen = m + rad;
    }
    o.x += nx * pen; o.z += nz * pen;
    const vn = o.vx * nx + o.vz * nz;
    if (vn < 0) { o.vx -= 1.3 * vn * nx; o.vz -= 1.3 * vn * nz; o.vx *= 0.82; o.vz *= 0.82; hit = Math.max(hit, -vn); }
  }
  return hit;
}

export function districtAt(x, z) {
  for (const d of Object.values(DATA)) if (inRect(d.rect, x, z)) return d;
  return null;
}
export function placeAt(x, z) {
  const d = districtAt(x, z);
  if (d) return { kind: 'district', d, name: d.name };
  for (const t of TUNNELS) if (inRect(t.rect, x, z, 2)) return { kind: 'tunnel', t, name: t.name };
  for (const c of CLOSED) if (inRect(c.rect, x, z, 2)) return { kind: 'closed', c, name: `Road to ${c.name}` };
  return { kind: 'none', name: 'Terminal Island' };
}

/* ---------------- streaming: build and drop district meshes ---------------- */
export class Streamer {
  constructor(scene, T, M) { this.scene = scene; this.T = T; this.M = M; this.loaded = new Map(); }
  wanted(x, z) {
    const set = new Set(), here = districtAt(x, z);
    if (here) set.add(here.id);
    for (const t of TUNNELS) if (rectDist(t.rect, x, z) < 160) { set.add(t.a); set.add(t.b); }
    return set;
  }
  update(x, z, onLoad, onUnload) {
    const want = this.wanted(x, z);
    for (const id of want) if (!this.loaded.has(id)) {
      const g = buildDistrictMesh(DATA[id], this.T, this.M);
      this.scene.add(g); this.loaded.set(id, g); onLoad && onLoad(id);
    }
    for (const [id, g] of this.loaded) if (!want.has(id)) {
      // keep it a little longer so turning around at a tunnel mouth doesn't rebuild it
      const d = DATA[id]; if (rectDist(d.rect, x, z) < 260) continue;
      this.scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.userData.ownMat) { o.material.map && o.material.map.dispose(); o.material.dispose(); } else if (o.userData.disposeMat) o.material.dispose(); });
      this.loaded.delete(id); onUnload && onUnload(id);
    }
  }
}

/* ---------------- mesh building ---------------- */
function builders() {
  return { b: new GB(), s: new GB(), e: new GB(), sign: new GB(), pool: new GB(), road: new GB(), inter: new GB(), tarmac: new GB(), paint: new GB(), hoard: new GB(), rock: new GB(),
    lamps: [], reds: [], whites: [], blues: [], ambers: [], extra: [] };
}
function finalize(B, M, T, name) {
  const g = new THREE.Group(); g.name = name;
  const add = (gb, mat, order) => { if (!gb.empty) { const m = new THREE.Mesh(gb.build(), mat); if (order) m.renderOrder = order; g.add(m); } };
  add(B.road, M.road); add(B.inter, M.inter); add(B.tarmac, M.tarmac); add(B.paint, M.paint, 1);
  // the ground goes on its own layer so the wet-road mirror doesn't reflect the road itself
  for (const m of g.children) m.layers.set(1);
  add(B.s, M.solid); add(B.b, M.building); add(B.e, M.emissive); add(B.hoard, M.hoarding); add(B.rock, M.rock);
  add(B.sign, M.signs, 2); add(B.pool, M.pools, 2); g.children[g.children.length - 1].material === M.pools && g.children[g.children.length - 1].layers.set(1);
  const pts = (arr, size, color) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: T.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    p.userData.disposeMat = true; g.add(p); return p;
  };
  pts(B.lamps, 6, 0xffb066); g.userData.reds = pts(B.reds, 9, 0xff2020); pts(B.whites, 5, 0xffffff); pts(B.blues, 4, 0x587af9); pts(B.ambers, 5, 0xffc400);
  for (const m of B.extra) g.add(m);
  return g;
}

function sign(B, cx, cz, nx, nz, y0, w, rnd) {
  const k = Math.floor(rnd() * 8), u0 = (k % 2) * 0.5, u1 = u0 + 0.5, row = Math.floor(k / 2), v0 = 1 - (row + 1) * 0.25, v1 = 1 - row * 0.25;
  const rx = nz, rz = -nx, x = cx + nx * 0.3, z = cz + nz * 0.3, h = w / 4, y1 = y0 + h;
  B.sign.quad([x - rx * w / 2, y0, z - rz * w / 2], [x + rx * w / 2, y0, z + rz * w / 2], [x + rx * w / 2, y1, z + rz * w / 2], [x - rx * w / 2, y1, z - rz * w / 2], [u0, v0, u1, v0, u1, v1, u0, v1]);
}
function wall(B, ax, az, bx, bz, h, uo, col, y0 = 0) {
  const len = Math.hypot(bx - ax, bz - az) / 24;
  B.b.quad([ax, y0, az], [bx, y0, bz], [bx, h, bz], [ax, h, az], [uo, y0 / 24, uo + len, y0 / 24, uo + len, h / 24, uo, h / 24], col);
}
function building(B, x0, z0, x1, z1, h, col, faces, rnd, y0 = 0) {
  const uo = Math.floor(rnd() * 8) / 8;
  wall(B, x0, z0, x1, z0, h, uo, col, y0); wall(B, x1, z0, x1, z1, h, uo + 0.375, col, y0);
  wall(B, x1, z1, x0, z1, h, uo + 0.625, col, y0); wall(B, x0, z1, x0, z0, h, uo + 0.125, col, y0);
  B.b.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], [0, 0, 0, 0, 0, 0, 0, 0], [0.1, 0.1, 0.12]);
  if (y0 > 0) B.b.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0, 0, 0, 0, 0, 0, 0], [0.12, 0.12, 0.14]);
  if (h > 60) B.reds.push((x0 + x1) / 2, h + 1.5, (z0 + z1) / 2);
  if (faces && faces.length && rnd() < 0.55) {
    const f = faces[Math.floor(rnd() * faces.length)], w = Math.min(10, (f === 'n' || f === 's' ? x1 - x0 : z1 - z0) * 0.7), y = 4 + rnd() * 7;
    if (f === 's') sign(B, (x0 + x1) / 2, z0, 0, -1, y, w, rnd); if (f === 'n') sign(B, (x0 + x1) / 2, z1, 0, 1, y, w, rnd);
    if (f === 'w') sign(B, x0, (z0 + z1) / 2, -1, 0, y, w, rnd); if (f === 'e') sign(B, x1, (z0 + z1) / 2, 1, 0, y, w, rnd);
  }
}
function slab(B, r, col = SIDEWALK, h = 0.25) { B.s.box(r.x0, 0, r.z0, r.x1, h, r.z1, col); }

function roadsAndLamps(d, B, T) {
  for (const r of d.vRoads) { const L = (r.z1 - r.z0) / 20; B.road.quad([r.x0, 0.02, r.z0], [r.x1, 0.02, r.z0], [r.x1, 0.02, r.z1], [r.x0, 0.02, r.z1], [0, 0, 1, 0, 1, L, 0, L]); }
  for (const r of d.hRoads) { const L = (r.x1 - r.x0) / 20; B.road.quad([r.x0, 0.025, r.z0], [r.x0, 0.025, r.z1], [r.x1, 0.025, r.z1], [r.x1, 0.025, r.z0], [0, 0, 1, 0, 1, L, 0, L]); }
  for (const r of d.inters) B.inter.flat(r, 0.03, [0, 0, 1, 0, 1, 1, 0, 1]);
  for (const r of d.tarmac) B.tarmac.flat(r, 0.015, [r.x0 / 30, r.z0 / 30, r.x1 / 30, r.z0 / 30, r.x1 / 30, r.z1 / 30, r.x0 / 30, r.z1 / 30]);
  // base ground for the whole district
  B.s.flat(d.rect, -0.01, null, [0.1, 0.1, 0.11]);
  const rnd = rng(d.cx * 7 + d.cz * 3 + 11);
  for (const [x, z, px, pz] of d.lamps) {
    B.lamps.push(x, 7.6, z); B.s.box(x - 0.12, 0, z - 0.12, x + 0.12, 7.5, z + 0.12, [0.07, 0.07, 0.08]);
    const cx = x + px * 4, cz = z + pz * 4, s = 9, t = 0.85 + rnd() * 0.2;
    B.pool.flat(R(cx - s, cz - s, cx + s, cz + s), 0.06, [0, 0, 1, 0, 1, 1, 0, 1], [t, t * 0.62, t * 0.32]);
  }
  // sea wall with the faint orange shimmer of the inertia barrier
  const glow = hexToRgb(PAL.orange).map(v => v * 0.55);
  for (const w of d.walls) {
    const r = w.r;
    B.s.box(r.x0, 0, r.z0, r.x1, 1.3, r.z1, [0.22, 0.22, 0.24]);
    if (w.face === 'x') B.e.quad([w.at + (w.at === r.x1 ? 0.05 : -0.05), 0.55, r.z0], [w.at + (w.at === r.x1 ? 0.05 : -0.05), 0.55, r.z1], [w.at + (w.at === r.x1 ? 0.05 : -0.05), 0.75, r.z1], [w.at + (w.at === r.x1 ? 0.05 : -0.05), 0.75, r.z0], null, glow);
    else B.e.quad([r.x0, 0.55, w.at + (w.at === r.z1 ? 0.05 : -0.05)], [r.x1, 0.55, w.at + (w.at === r.z1 ? 0.05 : -0.05)], [r.x1, 0.75, w.at + (w.at === r.z1 ? 0.05 : -0.05)], [r.x0, 0.75, w.at + (w.at === r.z1 ? 0.05 : -0.05)], null, glow);
  }
}

function towersBlock(B, b, rnd, downtown) {
  slab(B, b.rect);
  const { x0, z0, x1, z1 } = b.rect, bx0 = x0 + 3, bx1 = x1 - 3, bz0 = z0 + 3, bz1 = z1 - 3;
  const split = rnd() < 0.3 ? 1 : 2, sx = (bx1 - bx0) / split, sz = (bz1 - bz0) / split;
  for (let a = 0; a < split; a++) for (let c = 0; c < split; c++) {
    const lx0 = bx0 + a * sx + (a ? 1 : 0), lx1 = bx0 + (a + 1) * sx - (a < split - 1 ? 1 : 0);
    const lz0 = bz0 + c * sz + (c ? 1 : 0), lz1 = bz0 + (c + 1) * sz - (c < split - 1 ? 1 : 0);
    const h = 12 + rnd() * 22 + downtown * (25 + rnd() * 85) * (split === 1 ? 1.2 : 1);
    const t = TINTS[Math.floor(rnd() * TINTS.length)], m = 0.75 + rnd() * 0.3;
    const faces = []; if (a === 0) faces.push('w'); if (a === split - 1) faces.push('e'); if (c === 0) faces.push('s'); if (c === split - 1) faces.push('n');
    building(B, lx0, lz0, lx1, lz1, h, [t[0] * m, t[1] * m, t[2] * m], faces, rnd);
  }
}
function plazaBlock(B, b, rnd) {
  slab(B, b.rect);
  const { x0, z0, x1, z1 } = b.rect;
  B.s.box(x0 + 4, 0.25, z0 + 4, x1 - 4, 0.45, z1 - 4, [0.05, 0.12, 0.08]);
  for (let k = 0; k < 14; k++) {
    const x = x0 + 8 + rnd() * (x1 - x0 - 16), z = z0 + 8 + rnd() * (z1 - z0 - 16);
    B.s.box(x - 0.25, 0.45, z - 0.25, x + 0.25, 2.6, z + 0.25, [0.12, 0.08, 0.06]);
    B.s.box(x - 1.8, 2.4, z - 1.8, x + 1.8, 5.5, z + 1.8, [0.06, 0.16, 0.1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  B.s.box(cx - 5, 0.45, cz - 5, cx + 5, 1, cz + 5, [0.25, 0.25, 0.27]);
  B.pool.flat(R(cx - 10, cz - 10, cx + 10, cz + 10), 1.05, [0, 0, 1, 0, 1, 1, 0, 1], hexToRgb(PAL.amber));
  B.ambers.push(cx, 1.6, cz);
}
// Ordinary-looking building site. Secretly the entrance to a future world tunnel.
function constructionBlock(B, b, rnd) {
  slab(B, b.rect, [0.16, 0.14, 0.12], 0.2);
  const { x0, z0, x1, z1 } = b.rect, i = 1.5, H = 2.6;
  const panel = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az) / 16; B.hoard.quad([ax, 0, az], [bx, 0, bz], [bx, H, bz], [ax, H, az], [0, 0, L, 0, L, 1, 0, 1]); };
  panel(x0 + i, z0 + i, x1 - i, z0 + i); panel(x1 - i, z0 + i, x1 - i, z1 - i); panel(x1 - i, z1 - i, x0 + i, z1 - i); panel(x0 + i, z1 - i, x0 + i, z0 + i);
  // dirt mounds, site cabins, an excavator and a tower crane
  for (let k = 0; k < 3; k++) { const x = x0 + 12 + rnd() * (x1 - x0 - 24), z = z0 + 12 + rnd() * (z1 - z0 - 24), s = 4 + rnd() * 5; B.rock.box(x - s, 0.2, z - s, x + s, 1.5 + rnd() * 3, z + s, [0.55, 0.42, 0.32]); }
  for (let k = 0; k < 2; k++) { const x = x0 + 6 + k * 7, z = z1 - 9; B.s.box(x, 0.2, z, x + 6, 2.8, z + 2.5, [0.8, 0.8, 0.78]); B.e.quad([x + 1, 1.3, z - 0.02], [x + 2.4, 1.3, z - 0.02], [x + 2.4, 2.2, z - 0.02], [x + 1, 2.2, z - 0.02], null, [1, 0.8, 0.5]); }
  const ex = (x0 + x1) / 2 + 6, ez = (z0 + z1) / 2;
  B.s.box(ex - 1.6, 0.2, ez - 2.4, ex + 1.6, 1.0, ez + 2.4, [0.1, 0.1, 0.1]); B.s.box(ex - 1.4, 1, ez - 1.6, ex + 1.4, 3.2, ez + 1.2, [1, 0.77, 0]);
  B.s.box(ex - 0.3, 2.2, ez + 1.2, ex + 0.3, 2.8, ez + 6, [1, 0.77, 0]);
  const cx = x0 + 14, cz = z0 + 14;
  B.s.box(cx - 1, 0, cz - 1, cx + 1, 46, cz + 1, [1, 0.77, 0]); B.s.box(cx - 1, 44, cz - 10, cx + 1, 46, cz + 34, [1, 0.77, 0]);
  B.reds.push(cx, 47.5, cz + 34, cx, 47.5, cz - 10);
  for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z1 - 4]]) {
    B.s.box(x - 0.15, 0, z - 0.15, x + 0.15, 10, z + 0.15, [0.3, 0.3, 0.3]); B.whites.push(x, 10.4, z);
    B.pool.flat(R(x - 14, z - 14, x + 14, z + 14), 0.25, [0, 0, 1, 0, 1, 1, 0, 1], [0.7, 0.72, 0.75]);
  }
}
function containersBlock(B, b, rnd) {
  slab(B, b.rect, [0.2, 0.2, 0.21], 0.15);
  const { x0, z0, x1, z1 } = b.rect, cols = [[0.55, 0.16, 0.1], [0.75, 0.25, 0.05], [0.35, 0.36, 0.38], [0.14, 0.45, 0.42], [0.7, 0.68, 0.64], [0.6, 0.06, 0.05]];
  for (let z = z0 + 6; z + 2.5 < z1 - 6; z += 6.5) for (let x = x0 + 6; x + 12.2 < x1 - 6; x += 13) {
    if (rnd() < 0.15) continue;
    const stack = 1 + Math.floor(rnd() * 4);
    for (let s = 0; s < stack; s++) { const c = cols[Math.floor(rnd() * cols.length)]; B.s.box(x, 0.15 + s * 2.6, z, x + 12.2, 0.15 + (s + 1) * 2.6 - 0.05, z + 2.45, c); }
  }
}
function warehouseBlock(B, b, rnd) {
  slab(B, b.rect, [0.2, 0.2, 0.21], 0.15);
  const { x0, z0, x1, z1 } = b.rect, h = 11 + rnd() * 6, c = [0.2 + rnd() * 0.06, 0.21, 0.23];
  B.s.box(x0 + 8, 0, z0 + 8, x1 - 8, h, z1 - 8, c);
  for (let x = x0 + 14; x < x1 - 16; x += 14) B.e.quad([x, 0.3, z0 + 7.95], [x + 6, 0.3, z0 + 7.95], [x + 6, 5, z0 + 7.95], [x, 5, z0 + 7.95], null, [0.9, 0.55, 0.2]);
  sign(B, (x0 + x1) / 2, z1 - 8, 0, 1, h - 4, 12, rnd);
  B.ambers.push(x0 + 8, h + 0.5, z0 + 8, x1 - 8, h + 0.5, z1 - 8);
}
function yardBlock(B, b, rnd) {
  slab(B, b.rect, [0.18, 0.18, 0.19], 0.1);
  const { x0, z0, x1, z1 } = b.rect;
  for (let x = x0 + 8; x + 3 < x1 - 8; x += 6) if (rnd() < 0.7) { const z = z0 + 10 + rnd() * 4; B.s.box(x, 0.1, z, x + 2.6, 4, z + 14, [0.8, 0.8, 0.82]); }
  for (let x = x0 + 8; x + 3 < x1 - 8; x += 6) if (rnd() < 0.6) { const z = z1 - 26 + rnd() * 4; B.s.box(x, 0.1, z, x + 2.6, 4, z + 14, [0.55, 0.15, 0.1]); }
  B.whites.push((x0 + x1) / 2, 14, (z0 + z1) / 2);
  B.pool.flat(R((x0 + x1) / 2 - 30, (z0 + z1) / 2 - 30, (x0 + x1) / 2 + 30, (z0 + z1) / 2 + 30), 0.2, [0, 0, 1, 0, 1, 1, 0, 1], [0.5, 0.52, 0.55]);
}
function crane(B, c) {
  const red = [0.75, 0.02, 0.02], white = [0.85, 0.85, 0.85];
  for (const dx of [-9, 9]) for (const z of [c.z0, c.z1]) B.s.box(c.x + dx - 1, 0, z - 1, c.x + dx + 1, 34, z + 1, dx < 0 ? red : white);
  B.s.box(c.x - 10, 32, c.z0 - 1.5, c.x + 10, 36, c.z1 + 1.5, red);
  B.s.box(c.x - 2, 36, c.z0 - 20, c.x + 2, 39, c.z1 + 70, white);
  B.s.box(c.x - 4, 36, c.z0 + 5, c.x + 4, 44, c.z0 + 15, red);
  B.reds.push(c.x, 40, c.z1 + 70, c.x, 45, c.z0 + 10);
  B.pool.flat(R(c.x - 14, c.z0 - 4, c.x + 14, c.z1 + 4), 0.05, [0, 0, 1, 0, 1, 1, 0, 1], [0.6, 0.6, 0.62]);
  B.whites.push(c.x, 31, (c.z0 + c.z1) / 2);
}

function addWordMesh(B, T, text, color, x, y, z, w, rotY, flat = false) {
  const tex = T.word(text, color);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.ownMat = true; m.position.set(x, y, z);
  if (flat) { m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; } else m.rotation.y = rotY;
  m.renderOrder = 3; B.extra.push(m);
}

function featuresMesh(d, B, T) {
  for (const f of d.features) {
    if (f.type === 'arch') {
      const h = f.span / 2 + 1.5, red = hexToRgb(PAL.red);
      for (const s of [-1, 1]) B.s.box(f.x + s * h - 0.8, 0, f.z - 0.8, f.x + s * h + 0.8, 10, f.z + 0.8, [0.12, 0.12, 0.14]);
      B.s.box(f.x - h - 0.8, 10, f.z - 1, f.x + h + 0.8, 12, f.z + 1, [0.12, 0.12, 0.14]);
      B.e.quad([f.x - h, 9.95, f.z - 0.6], [f.x + h, 9.95, f.z - 0.6], [f.x + h, 9.95, f.z + 0.6], [f.x - h, 9.95, f.z + 0.6], null, red);
      B.e.quad([f.x - h, 10.2, f.z - 1.02], [f.x + h, 10.2, f.z - 1.02], [f.x + h, 10.5, f.z - 1.02], [f.x - h, 10.5, f.z - 1.02], null, red);
      B.e.quad([f.x - h, 10.2, f.z + 1.02], [f.x + h, 10.2, f.z + 1.02], [f.x + h, 10.5, f.z + 1.02], [f.x - h, 10.5, f.z + 1.02], null, red);
      B.pool.flat(R(f.x - 12, f.z - 8, f.x + 12, f.z + 8), 0.07, [0, 0, 1, 0, 1, 1, 0, 1], red.map(v => v * 0.8));
      addWordMesh(B, T, 'NEON ROW', '#ffffff', f.x, 11, f.z - 1.05, 9, Math.PI);
      addWordMesh(B, T, 'NEON ROW', '#ffffff', f.x, 11, f.z + 1.05, 9, 0);
    }
    if (f.type === 'skybridge') {
      const rnd = rng(f.x0 * 13 + f.z);
      building(B, f.x0, f.z - 13, f.x1, f.z + 13, 24, [0.9, 0.9, 0.95], [], rnd, 9);
      B.e.quad([f.x0, 8.95, f.z - 10], [f.x1, 8.95, f.z - 10], [f.x1, 8.95, f.z + 10], [f.x0, 8.95, f.z + 10], null, [0.35, 0.2, 0.08]);
    }
  }
}

function terminalMesh(d, B, T) {
  const rw = d.runway, tw = d.taxiway, white = [0.95, 0.95, 0.95], yellow = hexToRgb(PAL.amber);
  // runway: centre dashes, threshold bars, numbers, edge lights
  for (let x = rw.x0 + 70; x < rw.x1 - 70; x += 50) B.paint.flat(R(x, rw.z - 0.6, x + 30, rw.z + 0.6), 0.04, null, white);
  for (const end of [rw.x0 + 4, rw.x1 - 34]) for (let k = -18; k <= 18; k += 4.5) B.paint.flat(R(end, rw.z + k - 1.2, end + 30, rw.z + k + 1.2), 0.04, null, white);
  B.paint.flat(R(rw.x0, rw.z - rw.w / 2, rw.x1, rw.z - rw.w / 2 + 0.6), 0.04, null, white);
  B.paint.flat(R(rw.x0, rw.z + rw.w / 2 - 0.6, rw.x1, rw.z + rw.w / 2), 0.04, null, white);
  addWordMesh(B, T, '09', '#ffffff', rw.x0 + 52, 0.05, rw.z, 34, -Math.PI / 2, true);
  addWordMesh(B, T, '27', '#ffffff', rw.x1 - 52, 0.05, rw.z, 34, Math.PI / 2, true);
  for (let x = rw.x0; x <= rw.x1; x += 30) B.whites.push(x, 0.5, rw.z - rw.w / 2 - 1, x, 0.5, rw.z + rw.w / 2 + 1);
  for (let k = -20; k <= 20; k += 5) { B.reds.push(rw.x1 + 2, 0.5, rw.z + k); B.ambers.push(rw.x0 - 2, 0.5, rw.z + k); }
  // taxiway centre line and blue edge lights, with links to the runway
  B.paint.flat(R(tw.x0, tw.z - 0.4, tw.x1, tw.z + 0.4), 0.04, null, yellow);
  for (let x = tw.x0; x <= tw.x1; x += 24) B.blues.push(x, 0.4, tw.z - tw.w / 2, x, 0.4, tw.z + tw.w / 2);
  for (const x of [tw.x0, 0 + d.cx, tw.x1]) B.paint.flat(R(x - 0.4, tw.z, x + 0.4, rw.z - rw.w / 2), 0.04, null, yellow);
  // hangars with lit doors
  for (const hg of d.hangars) {
    B.s.box(hg.x0, 0, hg.z0, hg.x1, 22, hg.z1, [0.24, 0.25, 0.27]);
    B.e.quad([hg.x0 + 8, 0.2, hg.z0 - 0.05], [hg.x1 - 8, 0.2, hg.z0 - 0.05], [hg.x1 - 8, 15, hg.z0 - 0.05], [hg.x0 + 8, 15, hg.z0 - 0.05], null, [0.32, 0.22, 0.12]);
    B.pool.flat(R(hg.x0, hg.z0 - 30, hg.x1, hg.z0), 0.05, [0, 0, 1, 0, 1, 1, 0, 1], [0.55, 0.4, 0.25]);
  }
  addWordMesh(B, T, 'HANGAR 1', '#ffffff', (d.hangars[0].x0 + d.hangars[0].x1) / 2, 18, d.hangars[0].z0 - 0.1, 30, Math.PI);
  // floodlight masts across the apron
  for (let x = d.apron.x0 + 80; x < d.apron.x1; x += 180) for (const z of [d.cz - 100, d.cz + 150]) {
    B.s.box(x - 0.3, 0, z - 0.3, x + 0.3, 24, z + 0.3, [0.25, 0.25, 0.27]); B.whites.push(x, 24.5, z);
    B.pool.flat(R(x - 40, z - 40, x + 40, z + 40), 0.035, [0, 0, 1, 0, 1, 1, 0, 1], [0.42, 0.44, 0.48]);
  }
  // landside buildings
  const rnd = rng(77);
  for (const b of d.blocks) {
    const r = b.rect;
    if (b.kind === 'terminal') {
      slab(B, r);
      building(B, r.x0 + 6, r.z0 + 12, r.x1 - 6, r.z1 - 6, 18, [0.75, 0.88, 1], ['s'], rnd);
      B.e.quad([r.x0 + 6, 18.01, r.z0 + 12], [r.x1 - 6, 18.01, r.z0 + 12], [r.x1 - 6, 18.01, r.z1 - 6], [r.x0 + 6, 18.01, r.z1 - 6], null, [0.08, 0.08, 0.1]);
    } else if (b.kind === 'tower') {
      slab(B, r);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      B.s.box(cx - 4, 0, cz - 4, cx + 4, 48, cz + 4, [0.3, 0.3, 0.32]);
      building(B, cx - 9, cz - 9, cx + 9, cz + 9, 56, [0.4, 0.9, 0.85], [], rnd, 48);
      B.reds.push(cx, 58, cz);
      building(B, r.x0 + 8, r.z0 + 8, r.x0 + 70, r.z1 - 8, 14, [0.8, 0.8, 0.85], ['n'], rnd);
    } else if (b.kind === 'parking') {
      slab(B, r);
      for (let f = 0; f < 5; f++) B.s.box(r.x0 + 8, f * 3.2, r.z0 + 8, r.x1 - 8, f * 3.2 + 0.4, r.z1 - 8, [0.3, 0.3, 0.32]);
      for (let x = r.x0 + 8; x <= r.x1 - 8; x += 16) for (const z of [r.z0 + 8, r.z1 - 8.6]) B.s.box(x, 0, z, x + 0.6, 16, z + 0.6, [0.3, 0.3, 0.32]);
      for (let f = 0; f < 5; f++) B.e.quad([r.x0 + 8, f * 3.2 + 0.41, r.z0 + 7.9], [r.x1 - 8, f * 3.2 + 0.41, r.z0 + 7.9], [r.x1 - 8, f * 3.2 + 0.6, r.z0 + 7.9], [r.x0 + 8, f * 3.2 + 0.6, r.z0 + 7.9], null, [0.9, 0.6, 0.3]);
    } else if (b.kind === 'construction') constructionBlock(B, b, rnd);
    else towersBlock(B, b, rnd, 0.4);
  }
}

function buildDistrictMesh(d, T, M) {
  const B = builders(), rnd = rng(d.cx * 31 + d.cz * 17 + 5);
  roadsAndLamps(d, B, T);
  if (d.id === 'neon') {
    for (const b of d.blocks) {
      if (b.kind === 'plaza') plazaBlock(B, b, rnd);
      else if (b.kind === 'construction') constructionBlock(B, b, rnd);
      else towersBlock(B, b, rnd, b.down);
    }
    featuresMesh(d, B, T);
  } else if (d.id === 'dock') {
    for (const b of d.blocks) {
      if (b.kind === 'containers') containersBlock(B, b, rnd);
      else if (b.kind === 'warehouse') warehouseBlock(B, b, rnd);
      else if (b.kind === 'yard') yardBlock(B, b, rnd);
      else if (b.kind === 'construction') constructionBlock(B, b, rnd);
    }
    for (const c of d.cranes) crane(B, c);
    const s = d.straight;
    for (let x = s.x0; x < s.x1; x += 60) B.ambers.push(x, 0.3, s.z - 13.5, x, 0.3, s.z + 13.5);
  } else if (d.id === 'terminal') terminalMesh(d, B, T);
  return finalize(B, M, T, d.id);
}

/* ---------------- always-loaded pieces: sea, berms, tunnels, bridges ---------------- */
export function buildStatic(scene, T, M) {
  const B = builders();
  for (const r of BERMS) {
    const cuts = TUNNELS.filter(t => inRect(r, (t.rect.x0 + t.rect.x1) / 2, (t.rect.z0 + t.rect.z1) / 2));
    const H = 34;
    for (const t of cuts) {
      const tr = t.rect;
      if (t.axis === 'x') {
        B.rock.box(r.x0, 0, r.z0, r.x1, H, tr.z0 - 2, [1, 1, 1]); B.rock.box(r.x0, 0, tr.z1 + 2, r.x1, H, r.z1, [1, 1, 1]);
        B.rock.box(r.x0, 9, tr.z0 - 2, r.x1, H, tr.z1 + 2, [1, 1, 1]);
      } else {
        B.rock.box(r.x0, 0, r.z0, tr.x0 - 2, H, r.z1, [1, 1, 1]); B.rock.box(tr.x1 + 2, 0, r.z0, r.x1, H, r.z1, [1, 1, 1]);
        B.rock.box(tr.x0 - 2, 9, r.z0, tr.x1 + 2, H, r.z1, [1, 1, 1]);
      }
    }
  }
  const amber = hexToRgb(PAL.amber), dark = [0.14, 0.14, 0.15];
  for (const t of TUNNELS) {
    const r = t.rect, along = t.axis === 'x', L = along ? r.x1 - r.x0 : r.z1 - r.z0;
    if (along) B.road.quad([r.x0, 0.02, r.z0], [r.x0, 0.02, r.z1], [r.x1, 0.02, r.z1], [r.x1, 0.02, r.z0], [0, 0, 1, 0, 1, L / 20, 0, L / 20]);
    else B.road.quad([r.x0, 0.02, r.z0], [r.x1, 0.02, r.z0], [r.x1, 0.02, r.z1], [r.x0, 0.02, r.z1], [0, 0, 1, 0, 1, L / 20, 0, L / 20]);
    // tiled walls, ceiling, and a light strip every 12 m
    if (along) {
      for (const z of [r.z0, r.z1]) { B.s.quad([r.x0, 0, z], [r.x1, 0, z], [r.x1, 8, z], [r.x0, 8, z], null, [0.3, 0.3, 0.32]); B.e.quad([r.x0, 4.5, z + (z === r.z0 ? 0.05 : -0.05)], [r.x1, 4.5, z + (z === r.z0 ? 0.05 : -0.05)], [r.x1, 4.8, z + (z === r.z0 ? 0.05 : -0.05)], [r.x0, 4.8, z + (z === r.z0 ? 0.05 : -0.05)], null, amber.map(v => v * 0.7)); }
      B.s.quad([r.x0, 8, r.z0 - 2], [r.x1, 8, r.z0 - 2], [r.x1, 8, r.z1 + 2], [r.x0, 8, r.z1 + 2], null, dark);
      for (let x = r.x0 + 6; x < r.x1; x += 12) { B.ambers.push(x, 7.6, (r.z0 + r.z1) / 2); B.pool.flat(R(x - 6, r.z0, x + 6, r.z1), 0.05, [0, 0, 1, 0, 1, 1, 0, 1], amber.map(v => v * 0.45)); }
    } else {
      for (const x of [r.x0, r.x1]) { B.s.quad([x, 0, r.z0], [x, 0, r.z1], [x, 8, r.z1], [x, 8, r.z0], null, [0.3, 0.3, 0.32]); B.e.quad([x + (x === r.x0 ? 0.05 : -0.05), 4.5, r.z0], [x + (x === r.x0 ? 0.05 : -0.05), 4.5, r.z1], [x + (x === r.x0 ? 0.05 : -0.05), 4.8, r.z1], [x + (x === r.x0 ? 0.05 : -0.05), 4.8, r.z0], null, amber.map(v => v * 0.7)); }
      B.s.quad([r.x0 - 2, 8, r.z0], [r.x1 + 2, 8, r.z0], [r.x1 + 2, 8, r.z1], [r.x0 - 2, 8, r.z1], null, dark);
      for (let z = r.z0 + 6; z < r.z1; z += 12) { B.ambers.push((r.x0 + r.x1) / 2, 7.6, z); B.pool.flat(R(r.x0, z - 6, r.x1, z + 6), 0.05, [0, 0, 1, 0, 1, 1, 0, 1], amber.map(v => v * 0.45)); }
    }
    // portal frames with the tunnel's name
    const ends = along ? [[r.x0, -Math.PI / 2, t.b], [r.x1, Math.PI / 2, t.a]] : [[r.z0, Math.PI, t.a], [r.z1, 0, t.b]];
    for (const [p, rot, dest] of ends) {
      const nameTo = DISTRICTS[dest === t.a ? t.b : t.a].name.toUpperCase();
      if (along) { B.s.box(p - 1, 8, r.z0 - 3, p + 1, 11, r.z1 + 3, [0.35, 0.35, 0.37]); addWordMesh(B, T, nameTo, PAL.amber, p + (rot > 0 ? 1.1 : -1.1), 9.5, (r.z0 + r.z1) / 2, 12, rot); }
      else { B.s.box(r.x0 - 3, 8, p - 1, r.x1 + 3, 11, p + 1, [0.35, 0.35, 0.37]); addWordMesh(B, T, nameTo, PAL.amber, (r.x0 + r.x1) / 2, 9.5, p + (rot === 0 ? 1.1 : -1.1), 12, rot); }
    }
  }
  // closed roads: bridges out over the water that stop at construction barriers
  for (const c of CLOSED) {
    const r = c.rect, along = c.axis === 'x', L = along ? r.x1 - r.x0 : r.z1 - r.z0;
    if (along) B.road.quad([r.x0, 0.02, r.z0], [r.x0, 0.02, r.z1], [r.x1, 0.02, r.z1], [r.x1, 0.02, r.z0], [0, 0, 1, 0, 1, L / 20, 0, L / 20]);
    else B.road.quad([r.x0, 0.02, r.z0], [r.x1, 0.02, r.z0], [r.x1, 0.02, r.z1], [r.x0, 0.02, r.z1], [0, 0, 1, 0, 1, L / 20, 0, L / 20]);
    B.s.box(r.x0 - (along ? 0 : 2), -4, r.z0 - (along ? 2 : 0), r.x1 + (along ? 0 : 2), 0, r.z1 + (along ? 2 : 0), [0.2, 0.2, 0.22]);
    if (along) { B.s.box(r.x0, 0, r.z0 - 2, r.x1, 1.1, r.z0, [0.3, 0.3, 0.32]); B.s.box(r.x0, 0, r.z1, r.x1, 1.1, r.z1 + 2, [0.3, 0.3, 0.32]); }
    else { B.s.box(r.x0 - 2, 0, r.z0, r.x0, 1.1, r.z1, [0.3, 0.3, 0.32]); B.s.box(r.x1, 0, r.z0, r.x1 + 2, 1.1, r.z1, [0.3, 0.3, 0.32]); }
    // barrier, fence, sign and cones at the end
    const ex = along ? (c.end > 0 ? r.x1 - 1.5 : r.x0 + 1.5) : (r.x0 + r.x1) / 2, ez = along ? (r.z0 + r.z1) / 2 : (c.end > 0 ? r.z1 - 1.5 : r.z0 + 1.5);
    if (along) { B.hoard.quad([ex, 0, r.z0], [ex, 0, r.z1], [ex, 2.6, r.z1], [ex, 2.6, r.z0], [0, 0, 1.25, 0, 1.25, 1, 0, 1]); }
    else { B.hoard.quad([r.x0, 0, ez], [r.x1, 0, ez], [r.x1, 2.6, ez], [r.x0, 2.6, ez], [0, 0, 1.25, 0, 1.25, 1, 0, 1]); }
    const back = along ? [-c.end, 0] : [0, -c.end];
    for (let k = 1; k <= 6; k++) { const x = ex + back[0] * (6 + k * 5) + (along ? 0 : (k % 2 ? -4 : 4)), z = ez + back[1] * (6 + k * 5) + (along ? (k % 2 ? -4 : 4) : 0); B.s.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, [1, 0.27, 0]); }
    B.ambers.push(ex + back[0] * 2, 3, ez + back[1] * 2);
    const rot = along ? (c.end > 0 ? -Math.PI / 2 : Math.PI / 2) : (c.end > 0 ? Math.PI : 0);
    addWordMesh(B, T, 'ROAD CLOSED', '#ffffff', ex + back[0] * 0.2, 4.2, ez + back[1] * 0.2, 12, rot);
    addWordMesh(B, T, c.name.toUpperCase() + ' · UNDER CONSTRUCTION', PAL.amber, ex + back[0] * 0.2, 3.1, ez + back[1] * 0.2, 16, rot);
    // unfinished piers continuing over the sea
    const fwd = along ? [c.end, 0] : [0, c.end];
    for (let k = 1; k <= 6; k++) { const x = ex + fwd[0] * k * 40, z = ez + fwd[1] * k * 40; B.s.box(x - 3, -6, z - 3, x + 3, k < 3 ? 0 : -1 - k * 0.3, z + 3, [0.28, 0.28, 0.3]); }
    const cx = ex + fwd[0] * 70 + (along ? 0 : 20), cz = ez + fwd[1] * 70 + (along ? 20 : 0);
    B.s.box(cx - 1, -2, cz - 1, cx + 1, 50, cz + 1, [1, 0.77, 0]); B.reds.push(cx, 51.5, cz);
  }
  const g = finalize(B, M, T, 'static');
  scene.add(g);
  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshPhongMaterial({ color: 0x07090b, specular: 0x3a2412, shininess: 40 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-400, -1.6, 600); sea.layers.set(1); scene.add(sea);
  // island ground under the berms and tunnels
  for (const r of BERMS) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), new THREE.MeshLambertMaterial({ color: 0x15161a })); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, -0.05, (r.z0 + r.z1) / 2); m.layers.set(1); scene.add(m); }
  return g;
}

/* ---------------- map data for the minimap and full map ---------------- */
export function mapShapes() {
  const roads = [], tarmac = [], blocks = [];
  for (const d of Object.values(DATA)) { roads.push(...d.vRoads, ...d.hRoads); tarmac.push(...d.tarmac); blocks.push(d.rect); }
  for (const t of TUNNELS) roads.push(t.rect);
  return { roads, tarmac, districts: Object.values(DATA), closed: CLOSED, tunnels: TUNNELS };
}

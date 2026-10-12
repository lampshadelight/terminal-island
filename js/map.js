import { clamp, lerp, wrapA } from './util.js';
import { mapShapes } from './world.js';
import { drawMap } from './hud.js';

/* CarX-style map. Tap the minimap and it grows out of the corner into the whole island.
   Pinch to zoom, drag to look around, tap a marker, set a route. The route is worked out
   along the roads and drawn in amber on the minimap until you get there. */

const SHAPES = mapShapes();
const NORTH = Math.PI; // heading whose "up" on screen is north (-z)

/* ---------- road graph for routes ---------- */
const nodes = [], links = [];
(function buildGraph() {
  const CELL = 30, grid = new Map(), key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  const add = (a, b) => { const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); links[a].push([b, d]); links[b].push([a, d]); };
  for (const r of SHAPES.roads) {
    if (r.id === 'closed') continue;
    const first = nodes.length;
    for (let i = 0; i < r.pts.length; i += 3) {
      const p = r.pts[i], n = nodes.length;
      nodes.push({ x: p.x, z: p.z, road: r.id }); links.push([]);
      if (n > first) add(n - 1, n);
      const k = key(p.x, p.z); (grid.get(k) || grid.set(k, []).get(k)).push(n);
    }
    if (r.closed && nodes.length - first > 2) add(nodes.length - 1, first);
  }
  // junctions: join nearby points that belong to different roads
  nodes.forEach((n, i) => {
    const cx = Math.floor(n.x / CELL), cz = Math.floor(n.z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get((cx + a) + ',' + (cz + b)) || []) {
      if (j <= i || nodes[j].road === n.road) continue;
      if (Math.hypot(n.x - nodes[j].x, n.z - nodes[j].z) < 16) add(i, j);
    }
  });
})();
function nearest(x, z) { let best = 0, bd = Infinity; nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
// shortest path along the roads, returned as points from (x,z) to the target
export function findRoute(x, z, tx, tz) {
  const s = nearest(x, z), t = nearest(tx, tz), dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
  const heap = [[0, s]]; dist[s] = 0;
  const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop(); if (u === t) break; if (d > dist[u]) continue;
    for (const [v, w] of links[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([dist[v], v]); }
  }
  const pts = [{ x: tx, z: tz }];
  for (let u = t; u !== -1; u = prev[u]) pts.push(nodes[u]);
  pts.push({ x, z }); pts.reverse();
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, len };
}
export const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

/* ---------- the full map ---------- */
const $ = id => document.getElementById(id);
export class WorldMap {
  constructor({ car, getMarks, onRoute, onClose }) {
    this.car = car; this.getMarks = getMarks; this.onRoute = onRoute; this.onClose = onClose;
    this.cv = $('bigMap'); this.ctx = this.cv.getContext('2d');
    this.filters = { race: true, boss: true, shop: true };
    this.view = { cx: 0, cz: 0, s: 1, ang: NORTH }; this.sel = null; this.route = null; this.anim = 0; this.open = false;
    this.ptrs = new Map();
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() }); e.preventDefault(); });
    cv.addEventListener('pointermove', e => this._move(e));
    const up = e => {
      const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId);
      if (!this.ptrs.size && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10 && performance.now() - p.t < 400) this._tap(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); this._zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    $('mzIn').addEventListener('click', () => this._zoom(1.5, innerWidth / 2, innerHeight / 2));
    $('mzOut').addEventListener('click', () => this._zoom(1 / 1.5, innerWidth / 2, innerHeight / 2));
    $('mapFilters').addEventListener('click', e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      this.filters[b.dataset.f] = !this.filters[b.dataset.f]; b.classList.toggle('on', this.filters[b.dataset.f]);
      if (this.sel && !this.filters[this.sel.kind]) this.select(null);
      this.draw();
    });
    $('mcRoute').addEventListener('click', () => {
      if (!this.sel) return;
      if (this.route && this.route.target.id === this.sel.id) this.onRoute(null);
      else this.onRoute(this.sel);
      this.select(this.sel);
    });
    addEventListener('resize', () => { if (this.open) { this._size(); this.fit(); this.draw(); } });
  }
  _size() {
    const dpr = Math.min(2, devicePixelRatio || 1); this.dpr = dpr;
    this.cv.width = Math.round(innerWidth * dpr); this.cv.height = Math.round(innerHeight * dpr);
  }
  // the whole island fills the screen
  fit() {
    const w = innerWidth, h = innerHeight;
    this.full = { cx: 90, cz: -60, s: Math.min(w / 3500, h / 2700), ang: NORTH };
  }
  show(place) {
    this._size(); this.fit(); this.open = true; this.select(null);
    $('mapPlace').textContent = place ? `You're in ${place}` : 'Terminal Island';
    const m = $('mini').getBoundingClientRect();
    this.from = { rect: [m.left, m.top, m.width, m.height], cx: this.car.x, cz: this.car.z, s: m.width / 420, ang: this.car.h };
    this.anim = 0; this.ui(false);
    const start = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 420;
    const step = now => {
      if (!this.open) return;
      this.anim = clamp((now - start) / dur, 0, 1);
      if (this.anim < 1) requestAnimationFrame(step); else { this.view = { ...this.full }; this.ui(true); }
      this.draw();
    };
    requestAnimationFrame(step);
  }
  hide() { this.open = false; this.ptrs.clear(); }
  ui(on) { for (const id of ['mapClose', 'mapFilters', 'mapTitle', 'mapZoom', 'mapHint']) $(id).style.opacity = on ? 1 : 0; }
  marks() { return this.getMarks().filter(m => this.filters[m.kind]); }
  // world point to screen point for the current view (north up)
  _toScreen(x, z) { const v = this.view; return [(x - v.cx) * v.s + innerWidth / 2, (z - v.cz) * v.s + innerHeight / 2]; }
  _move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p || this.anim < 1) return;
    if (this.ptrs.size === 1) { this.view.cx -= (e.clientX - p.x) / this.view.s; this.view.cz -= (e.clientY - p.y) / this.view.s; }
    else if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()], other = a === p ? b : a;
      const d0 = Math.hypot(p.x - other.x, p.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 5) this._zoom(d1 / d0, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2, true);
    }
    p.x = e.clientX; p.y = e.clientY; this._clampView(); this.draw();
  }
  _zoom(k, sx, sy, noDraw) {
    const v = this.view, wx = v.cx + (sx - innerWidth / 2) / v.s, wz = v.cz + (sy - innerHeight / 2) / v.s;
    v.s = clamp(v.s * k, this.full.s * 0.8, this.full.s * 8);
    v.cx = wx - (sx - innerWidth / 2) / v.s; v.cz = wz - (sy - innerHeight / 2) / v.s;
    this._clampView(); if (!noDraw) this.draw();
  }
  _clampView() { const v = this.view; v.cx = clamp(v.cx, -1700, 1900); v.cz = clamp(v.cz, -1400, 1300); }
  _tap(x, y) {
    let best = null, bd = 30;
    for (const m of this.marks()) { const [sx, sy] = this._toScreen(m.x, m.z), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = m; } }
    this.select(best); this.draw();
  }
  select(m) {
    this.sel = m; $('mapCard').hidden = !m; if (!m) return;
    $('mcType').textContent = m.type; $('mcName').textContent = m.title; $('mcText').textContent = m.text || '';
    const d = findRoute(this.car.x, this.car.z, m.x, m.z).len;
    $('mcPills').innerHTML = (m.pills || []).map(p => `<span class="pill" style="--c:${m.c}">${p}</span>`).join('') + `<span class="pill" style="--c:#FFC400">${fmtDist(d)}</span>`;
    const on = !!(this.route && this.route.target.id === m.id);
    $('mcRoute').textContent = on ? 'Clear route' : 'Set route';
    $('mcRoute').classList.toggle('primary', !on);
  }
  setRoute(r) { this.route = r; }
  draw() {
    if (!this.open) return;
    const ctx = this.ctx, dpr = this.dpr, W = innerWidth, H = innerHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const t = this.anim, e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1, f = this.from;
    let v = this.view, rect = [0, 0, W, H], k = 1;
    if (t < 1) {
      rect = f.rect.map((a, i) => lerp(a, [0, 0, W, H][i], e));
      v = { cx: lerp(f.cx, this.full.cx, e), cz: lerp(f.cz, this.full.cz, e), s: f.s * Math.pow(this.full.s / f.s, e), ang: f.ang + wrapA(NORTH - f.ang) * e };
      k = lerp(0.7, 1, e);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * e})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }
    const [rx, ry, rw, rh] = rect.map(a => a * dpr), rad = lerp(16, 0, e) * dpr;
    ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, rad) : ctx.rect(rx, ry, rw, rh); ctx.clip();
    drawMap(ctx, rw, rh, v.cx, v.cz, v.s * dpr, [Math.sin(v.ang), Math.cos(v.ang)], this.car, t >= 1, dpr * k, this.marks(), { ox: rx, oy: ry, route: this.route && this.route.pts, sel: this.sel });
    ctx.restore();
  }
}

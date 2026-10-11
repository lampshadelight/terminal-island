import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const DEG = Math.PI / 180;

// Deterministic random numbers, so every phone builds the same island.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// Axis-aligned rectangle on the ground plane.
export const R = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const inRect = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
export function rectDist(r, x, z) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

// Geometry batcher: merges many quads into one mesh so phones keep draw calls low.
export class GB {
  constructor() { this.p = []; this.u = []; this.c = []; this.i = []; }
  quad(a, b, c, d, uv, col) {
    const n = this.p.length / 3;
    this.p.push(...a, ...b, ...c, ...d);
    this.u.push(...(uv || Z8));
    col = col || ONE;
    for (let k = 0; k < 4; k++) this.c.push(col[0], col[1], col[2]);
    this.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  // flat horizontal rectangle at height y
  flat(r, y, uv, col) { this.quad([r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], uv, col); }
  box(x0, y0, z0, x1, y1, z1, col, top = true) {
    if (top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], Z8, col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], Z8, col);
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], Z8, col);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], Z8, col);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], Z8, col);
  }
  get empty() { return this.i.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  }
}
const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const ONE = [1, 1, 1];

export function hexToRgb(h) {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
}

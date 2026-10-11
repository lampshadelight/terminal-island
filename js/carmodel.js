import * as THREE from 'three';
import { clamp } from './util.js';

/* ------------------------------------------------------------------
   Car bodies. Each car is a side profile (u = 0 at the tail, 1 at the
   nose; y in metres) pushed out to the car's width, then pinched at the
   ends and rounded over the top so it reads as a car, not a box.
   The shapes are inspired by real street cars of the 90s and 2000s,
   but every name, badge and detail is our own.
   ------------------------------------------------------------------ */
export const SHAPES = {
  // inspired by the Nissan 180SX: long wedge nose, closed pop-up lamps, fastback hatch
  kaze: { L: 4.54, W: 1.7, R: 0.31, axles: [0.2, 0.79], plan: 0.13, tumble: 0.2, cw: 0.84,
    P: [[0, .33], [0, .62], [.01, .8], [.04, .88], [.2, .9], [.64, .9], [.8, .84], [.96, .73], [1, .62], [1, .4], [.985, .29]],
    C: [[.04, .89], [.36, 1.27], [.56, 1.29], [.7, .9]],
    heads: [{ s: 'rect', x: .52, y: .5, w: .36, h: .07 }], popups: true,
    tails: [{ s: 'rect', x: 0, y: .74, w: 1.42, h: .1 }],
    dark: [{ s: 'rect', x: 0, y: .4, w: .8, h: .1 }], spoiler: 'lip' },
  // inspired by the Honda Civic EK hatch: short, tall glasshouse, upright hatch
  hornet: { L: 4.18, W: 1.7, R: 0.3, axles: [0.17, 0.8], plan: 0.12, tumble: 0.18, cw: 0.86,
    P: [[0, .33], [0, .62], [.004, .97], [.03, .99], [.74, .97], [.86, .9], [.97, .8], [1, .68], [1, .42], [.985, .3]],
    C: [[.03, .99], [.1, 1.36], [.5, 1.38], [.74, .97]],
    heads: [{ s: 'rect', x: .5, y: .74, w: .44, h: .13 }],
    tails: [{ s: 'rect', x: .7, y: .82, w: .18, h: .3 }],
    dark: [{ s: 'rect', x: 0, y: .73, w: .4, h: .08 }, { s: 'rect', x: 0, y: .44, w: .9, h: .12 }], spoiler: 'roof' },
  // inspired by the Mazda RX-8: high round fenders, long cabin, short tail
  vortex: { L: 4.43, W: 1.77, R: 0.33, axles: [0.18, 0.78], plan: 0.15, tumble: 0.22, cw: 0.82,
    P: [[0, .36], [0, .66], [.01, .86], [.05, .95], [.17, .97], [.66, .93], [.8, .88], [.93, .8], [.99, .68], [1, .46], [.985, .31]],
    C: [[.1, .96], [.3, 1.33], [.52, 1.33], [.68, .93]],
    heads: [{ s: 'rect', x: .56, y: .76, w: .46, h: .1 }],
    tails: [{ s: 'round', x: .62, y: .84, r: .09 }, { s: 'round', x: .44, y: .84, r: .07 }],
    dark: [{ s: 'rect', x: 0, y: .46, w: .7, h: .16 }], spoiler: 'lip' },
  // inspired by the BMW E36 coupe: square three-box shape, twin round lamps, split grille
  dreier: { L: 4.43, W: 1.71, R: 0.31, axles: [0.19, 0.78], plan: 0.09, tumble: 0.16, cw: 0.86,
    P: [[0, .34], [0, .66], [.005, .94], [.02, .97], [.2, .98], [.7, .95], [.97, .86], [1, .78], [1, .44], [.985, .31]],
    C: [[.2, .97], [.36, 1.33], [.58, 1.34], [.72, .95]],
    heads: [{ s: 'round', x: .46, y: .7, r: .085 }, { s: 'round', x: .64, y: .7, r: .085 }],
    tails: [{ s: 'rect', x: .56, y: .82, w: .46, h: .14 }],
    dark: [{ s: 'rect', x: .12, y: .7, w: .17, h: .17 }, { s: 'rect', x: 0, y: .44, w: .95, h: .1 }], spoiler: 'none' },
  // inspired by the Toyota AE86: small, boxy hatch coupe, pop-up lamps, wide tail-lamp bar
  ronin: { L: 4.2, W: 1.63, R: 0.29, axles: [0.19, 0.79], plan: 0.08, tumble: 0.17, cw: 0.86,
    P: [[0, .33], [0, .62], [.005, .88], [.03, .9], [.18, .91], [.7, .9], [.86, .86], [.98, .78], [1, .66], [1, .42], [.985, .3]],
    C: [[.04, .9], [.3, 1.3], [.6, 1.31], [.72, .9]],
    heads: [{ s: 'rect', x: .55, y: .5, w: .3, h: .07 }], popups: true,
    tails: [{ s: 'rect', x: 0, y: .74, w: 1.34, h: .13 }],
    dark: [{ s: 'rect', x: 0, y: .62, w: 1.1, h: .05 }, { s: 'rect', x: 0, y: .4, w: .9, h: .1 }], spoiler: 'lip' },
  // inspired by the Mitsubishi Eclipse: rounded wedge, slim lamps, hoop wing
  solstice: { L: 4.38, W: 1.74, R: 0.31, axles: [0.19, 0.79], plan: 0.15, tumble: 0.22, cw: 0.83,
    P: [[0, .34], [0, .64], [.01, .86], [.05, .92], [.16, .93], [.62, .92], [.78, .85], [.92, .74], [.99, .62], [1, .42], [.985, .3]],
    C: [[.06, .93], [.34, 1.28], [.54, 1.29], [.66, .91]],
    heads: [{ s: 'rect', x: .56, y: .68, w: .44, h: .09 }],
    tails: [{ s: 'rect', x: 0, y: .79, w: 1.3, h: .09 }],
    dark: [{ s: 'rect', x: 0, y: .42, w: .9, h: .14 }], spoiler: 'hoop' },
  // inspired by the Nissan Skyline R34: square shoulders, big round tail lamps, tall wing
  zephyr: { L: 4.6, W: 1.78, R: 0.33, axles: [0.2, 0.78], plan: 0.1, tumble: 0.17, cw: 0.85,
    P: [[0, .34], [0, .68], [.01, .92], [.04, .98], [.2, .99], [.66, .97], [.84, .92], [.97, .84], [1, .74], [1, .42], [.985, .3]],
    C: [[.18, .99], [.34, 1.34], [.58, 1.36], [.71, .96]],
    heads: [{ s: 'rect', x: .56, y: .78, w: .44, h: .14 }],
    tails: [{ s: 'round', x: .5, y: .84, r: .1 }, { s: 'round', x: .72, y: .84, r: .1 }],
    dark: [{ s: 'rect', x: 0, y: .78, w: .5, h: .1 }, { s: 'rect', x: 0, y: .46, w: 1.1, h: .2 }], spoiler: 'wing' },
  // inspired by a 2005 Ford Mustang: long hood, big grille with round lamps, three-bar tails
  vandal: { L: 4.78, W: 1.88, R: 0.35, axles: [0.2, 0.76], plan: 0.08, tumble: 0.15, cw: 0.84,
    P: [[0, .36], [0, .72], [.01, .96], [.03, 1], [.24, 1], [.66, .98], [.88, .95], [.98, .9], [1, .78], [1, .44], [.985, .32]],
    C: [[.2, 1], [.34, 1.36], [.54, 1.38], [.68, .98]],
    heads: [{ s: 'round', x: .66, y: .8, r: .1 }],
    tails: [{ s: 'rect', x: .5, y: .86, w: .07, h: .22 }, { s: 'rect', x: .6, y: .86, w: .07, h: .22 }, { s: 'rect', x: .7, y: .86, w: .07, h: .22 }],
    dark: [{ s: 'rect', x: 0, y: .74, w: .9, h: .24 }], spoiler: 'lip', scoop: true },
  // inspired by a modern mid-engine exotic: very low, cab-forward, thin lamps
  strix: { L: 4.46, W: 1.93, R: 0.34, axles: [0.19, 0.74], plan: 0.16, tumble: 0.28, cw: 0.78,
    P: [[0, .34], [0, .66], [.01, .86], [.06, .92], [.3, .98], [.66, .92], [.84, .8], [.96, .64], [1, .52], [1, .38], [.985, .3]],
    C: [[.26, .98], [.42, 1.18], [.6, 1.17], [.76, .86]],
    heads: [{ s: 'rect', x: .6, y: .64, w: .5, h: .06 }],
    tails: [{ s: 'rect', x: 0, y: .78, w: 1.56, h: .06 }],
    dark: [{ s: 'rect', x: 0, y: .44, w: 1.3, h: .16 }, { s: 'rect', x: .78, y: .5, w: .2, h: .2 }], spoiler: 'ducktail' }
};

const BEV = 0.05;
// smooth shading across gentle bends, hard edges where panels meet at a sharp angle
function creaseNormals(geo, angle = 0.6) {
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position, n = p.count, fn = [], map = new Map(), cos = Math.cos(angle);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    const f = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const area = f.length(); f.normalize(); fn.push(f, f, f);
    for (let k = 0; k < 3; k++) {
      const key = `${p.getX(t + k).toFixed(3)},${p.getY(t + k).toFixed(3)},${p.getZ(t + k).toFixed(3)}`;
      if (!map.has(key)) map.set(key, []); map.get(key).push([t + k, f, area]);
    }
  }
  const out = new Float32Array(n * 3);
  for (const list of map.values()) for (const [i, f] of list) {
    const s = new THREE.Vector3();
    for (const [, g, w] of list) if (f.dot(g) > cos) s.addScaledVector(g, w + 1e-6);
    s.normalize(); out[i * 3] = s.x; out[i * 3 + 1] = s.y; out[i * 3 + 2] = s.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}
function topAt(P, u) {
  let best = -1;
  for (let i = 0; i < P.length - 1; i++) {
    const [a, ya] = P[i], [b, yb] = P[i + 1];
    if (b === a) continue;
    if (u >= Math.min(a, b) && u <= Math.max(a, b)) best = Math.max(best, ya + (yb - ya) * (u - a) / (b - a));
  }
  return best;
}
// where the nose or tail surface is at height y
function faceU(P, y, front) {
  let best = front ? 0.5 : 0.5;
  for (let i = 0; i < P.length - 1; i++) {
    const [a, ya] = P[i], [b, yb] = P[i + 1];
    if (ya === yb || y < Math.min(ya, yb) || y > Math.max(ya, yb)) continue;
    const u = a + (b - a) * (y - ya) / (yb - ya);
    if (front && u > 0.5) best = Math.max(best, u);
    if (!front && u < 0.5) best = Math.min(best, u);
  }
  return best;
}

function extrudeSide(shape, depth, bev) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bev, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -(depth - 2 * bev) / 2); g.rotateY(-Math.PI / 2);
  return g;
}

export function buildBody(sh, mats, opts) {
  const { L, W, R, P, C } = sh, Z = u => u * L - L / 2, belt = C[0][1], roof = Math.max(...C.map(c => c[1]));
  const group = new THREE.Group();
  const planF = z => 1 - sh.plan * Math.pow(clamp((Math.abs(z) - (L / 2 - 0.9)) / 0.9, 0, 1), 2);

  // lower body with wheel arches cut out
  const s = new THREE.Shape(), bottom = 0.27, ar = R + 0.08;
  s.moveTo(Z(P[0][0]), P[0][1]);
  for (let i = 1; i < P.length; i++) s.lineTo(Z(P[i][0]), P[i][1]);
  const zf = Z(sh.axles[1]), zr = Z(sh.axles[0]);
  s.lineTo(Z(P[P.length - 1][0]), bottom);
  for (const zc of [zf, zr]) { s.lineTo(zc + ar, bottom); s.lineTo(zc + ar, R); s.absarc(zc, R, ar, 0, Math.PI, false); s.lineTo(zc - ar, bottom); }
  s.lineTo(Z(P[0][0]), bottom);
  const body = extrudeSide(s, W, BEV), p = body.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), z = p.getZ(k);
    let f = planF(z);
    f *= 1 - 0.07 * clamp((y - (belt - 0.14)) / 0.24, 0, 1);
    f *= 1 - 0.05 * clamp((0.45 - y) / 0.2, 0, 1);
    p.setX(k, p.getX(k) * f);
  }
  group.add(new THREE.Mesh(creaseNormals(body), mats.paint));

  // cabin: painted pillars and roof, glass set into it
  const cs = new THREE.Shape(); cs.moveTo(Z(C[0][0]), C[0][1]);
  for (let i = 1; i < C.length; i++) cs.lineTo(Z(C[i][0]), C[i][1]);
  const cw = W * sh.cw, cab = extrudeSide(cs, cw, 0.03), cp = cab.attributes.position;
  const cabF = y => 1 - sh.tumble * clamp((y - belt) / (roof - belt), 0, 1);
  for (let k = 0; k < cp.count; k++) cp.setX(k, cp.getX(k) * cabF(cp.getY(k)));
  group.add(new THREE.Mesh(creaseNormals(cab), mats.paint));
  // side windows: the cabin outline pulled in toward its middle
  let cx = 0, cy = 0; for (const [u, y] of C) { cx += Z(u); cy += y; } cx /= C.length; cy = (cy / C.length + roof) / 2;
  const ws = new THREE.Shape(C.map(([u, y]) => new THREE.Vector2(cx + (Z(u) - cx) * 0.84, Math.max(belt + 0.05, cy + (y - cy) * 0.8))));
  const wg = new THREE.ShapeGeometry(ws), wp = wg.attributes.position, sides = [];
  for (const side of [1, -1]) {
    const arr = [];
    for (let k = 0; k < wp.count; k++) { const y = wp.getY(k); arr.push(side * (cw / 2 * cabF(y) + 0.012), y, wp.getX(k)); }
    sides.push(arr);
  }
  const idx = wg.index ? Array.from(wg.index.array) : [...Array(wp.count).keys()];
  const glassPos = [], addTri = (arr, a, b, c) => glassPos.push(...arr.slice(a * 3, a * 3 + 3), ...arr.slice(b * 3, b * 3 + 3), ...arr.slice(c * 3, c * 3 + 3));
  for (let t = 0; t < idx.length; t += 3) { addTri(sides[0], idx[t], idx[t + 1], idx[t + 2]); addTri(sides[1], idx[t], idx[t + 2], idx[t + 1]); }
  // windscreen and rear window
  const pane = (a, b) => {
    const za = Z(a[0]), zb = Z(b[0]), dz = zb - za, dy = b[1] - a[1], n = Math.hypot(dz, dy), nz = -dy / n * 0.015, ny = dz / n * 0.015;
    const xa = cw / 2 * cabF(a[1]) - 0.07, xb = cw / 2 * cabF(b[1]) - 0.07;
    const q = [[-xa, a[1] + ny, za + nz], [xa, a[1] + ny, za + nz], [xb, b[1] + ny, zb + nz], [-xb, b[1] + ny, zb + nz]];
    glassPos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  };
  pane(C[0], C[1]); pane(C[C.length - 2], C[C.length - 1]);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3)); gg.computeVertexNormals();
  const glass = new THREE.Mesh(gg, mats.glass); group.add(glass);

  // lamps, grilles and intakes, sitting on the nose and tail surfaces
  const place = (list, mat, front) => {
    for (const l of list || []) {
      const u = faceU(P, l.y, front), z = Z(u) + (front ? BEV - 0.03 : -BEV + 0.03), f = planF(z) * (1 - 0.05 * clamp((0.45 - l.y) / 0.2, 0, 1));
      for (const sx of l.x ? [1, -1] : [0]) {
        let m;
        if (l.s === 'round') { m = new THREE.Mesh(new THREE.CylinderGeometry(l.r, l.r, 0.1, 14), mat); m.rotation.x = Math.PI / 2; }
        else m = new THREE.Mesh(new THREE.BoxGeometry(l.w * (l.x ? 1 : f), l.h, 0.1), mat);
        m.position.set(sx * l.x * f, l.y, z); group.add(m);
      }
    }
  };
  place(sh.heads, mats.head, true); place(sh.dark, mats.dark, true);
  if (sh.dark) place(sh.dark.filter(d => d.y < 0.5), mats.dark, false);
  place(sh.tails, mats.tail, false);
  if (sh.popups) for (const sx of [1, -1]) {
    const u = 0.9, m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.34), mats.paint);
    m.position.set(sx * 0.52 * planF(Z(u)), topAt(P, u) + 0.05, Z(u)); m.rotation.x = 0.28; group.add(m);
  }

  // body kit
  const spoiler = opts.spoiler ?? sh.spoiler, deck = topAt(P, 0.05);
  if (spoiler === 'wing' || spoiler === 'hoop') {
    const h = spoiler === 'wing' ? 0.32 : 0.22, z = Z(0.06);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.05, 0.32), mats.paint); plank.position.set(0, deck + h, z); plank.rotation.x = -0.08; group.add(plank);
    const px = spoiler === 'wing' ? W * 0.3 : W * 0.43;
    for (const sx of [1, -1]) { const up = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.16), spoiler === 'wing' ? mats.dark : mats.paint); up.position.set(sx * px, deck + h / 2, z); group.add(up); }
  } else if (spoiler === 'lip') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.07, 0.18), mats.paint); m.position.set(0, deck + 0.04, Z(0.025)); group.add(m);
  } else if (spoiler === 'ducktail') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.1, 0.32), mats.paint); m.position.set(0, deck + 0.04, Z(0.04)); m.rotation.x = -0.35; group.add(m);
  } else if (spoiler === 'roof') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.78, 0.05, 0.26), mats.paint); m.position.set(0, C[1][1] + 0.02, Z(C[1][0]) - 0.08); m.rotation.x = 0.15; group.add(m);
  }
  if (opts.scoop ?? sh.scoop) {
    const u = 0.84, m = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.13, 0.85), mats.paint); m.position.set(0, topAt(P, u) + 0.04, Z(u)); group.add(m);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.04), mats.dark); v.position.set(0, topAt(P, u) + 0.07, Z(u) + 0.43); group.add(v);
  }
  if (opts.stripe) {
    // twin stripes over the hood, roof and boot
    const pts = [];
    for (let u = 0.03; u <= 0.985; u += 0.02) {
      const inCab = u > C[0][0] && u < C[C.length - 1][0];
      let y = inCab ? cabTop(C, u) : topAt(P, u); if (y < 0) continue;
      pts.push([Z(u), y + 0.012, inCab ? cabF(y) : planF(Z(u))]);
    }
    const pos = [];
    for (const sx of [0.16, -0.16]) for (let i = 0; i < pts.length - 1; i++) {
      const [za, ya, fa] = pts[i], [zb, yb, fb] = pts[i + 1], a0 = (sx - 0.07) * fa, a1 = (sx + 0.07) * fa, b0 = (sx - 0.07) * fb, b1 = (sx + 0.07) * fb;
      pos.push(a0, ya, za, a1, ya, za, b1, yb, zb, a0, ya, za, b1, yb, zb, b0, yb, zb);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.computeVertexNormals();
    group.add(new THREE.Mesh(sg, mats.stripe));
  }
  return { group, deck };
}
function cabTop(C, u) {
  for (let i = 0; i < C.length - 1; i++) { const [a, ya] = C[i], [b, yb] = C[i + 1]; if (u >= a && u <= b && b > a) return ya + (yb - ya) * (u - a) / (b - a); }
  return -1;
}

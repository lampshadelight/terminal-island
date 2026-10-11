import * as THREE from 'three';
import { rng } from './util.js';

/* ------------------------------------------------------------------
   Vinyls and sponsor decals. A vinyl is painted onto a canvas that
   wraps the car's sides (left of the canvas = tail, right = nose).
   Sponsor decals are invented brands, stuck on as separate panels so
   their text reads the right way round on both sides.
   ------------------------------------------------------------------ */
export const VINYLS = [[null, 'None'], ['flames', 'Flames'], ['band', 'Side band'], ['speed', 'Speed slashes'], ['splatter', 'Splatter'], ['checker', 'Checker']];
export const VINYL_COLORS = ['#FFC400', '#FF4500', '#BF0003', '#F2F2F2', '#1A1A1E', '#249689', '#587AF9'];
export const SPONSORS = ['VOLTA', 'KAIDO OIL', 'NOVA', 'TIC', 'REDLINE', 'ORBIT TYRES'];

const W = 1024, H = 256;
// car height 0.25 m at the bottom of the canvas to 1.45 m at the top; the body sits roughly in rows 110-245
const rowOf = y => H - (y - 0.25) / 1.2 * H;

function draw(g, kind, col) {
  const r = rng(77);
  g.fillStyle = col; g.strokeStyle = col;
  const top = rowOf(0.92), bot = rowOf(0.32);
  if (kind === 'flames') {
    // tongues of flame licking back from the front wheel
    for (let k = 0; k < 7; k++) {
      const y0 = top + 18 + k * (bot - top - 30) / 7, len = 260 + r() * 260, x0 = 980;
      g.beginPath(); g.moveTo(x0, y0 - 14);
      g.bezierCurveTo(x0 - len * 0.4, y0 - 30, x0 - len * 0.7, y0 + 10, x0 - len, y0 - 8 + r() * 10);
      g.bezierCurveTo(x0 - len * 0.65, y0 + 22, x0 - len * 0.35, y0 + 18, x0, y0 + 16);
      g.closePath(); g.fill();
    }
  } else if (kind === 'band') {
    g.fillRect(0, top + 40, W, 30); g.fillRect(0, top + 80, W, 5);
  } else if (kind === 'speed') {
    for (let k = 0; k < 6; k++) { const x = 120 + k * 46; g.beginPath(); g.moveTo(x, bot); g.lineTo(x + 26, bot); g.lineTo(x + 110, top + 10); g.lineTo(x + 84, top + 10); g.closePath(); g.fill(); }
  } else if (kind === 'splatter') {
    for (let k = 0; k < 90; k++) { const x = r() * W, y = top + r() * (bot - top), s = 3 + Math.pow(r(), 3) * 30; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'checker') {
    const s = 22;
    for (let i = 0; i < W / s; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 && r() > i / (W / s) * 0.9) g.fillRect(i * s, bot - (j + 1) * s, s, s);
  }
}

// paint + vinyl as one texture for the car's paint material
export function liveryTexture(paint, vinyl, vinylColor, L) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = paint; g.fillRect(0, 0, W, H);
  if (vinyl) draw(g, vinyl, vinylColor || '#FFC400');
  const t = new THREE.CanvasTexture(c);
  t.repeat.set(1 / L, 1 / 1.2); t.offset.set(0.5, -0.25 / 1.2);
  return t;
}

// sponsor stickers on both doors and the rear quarters
export function addDecals(group, T, sh) {
  const mats = [];
  const word = (text, w) => {
    const m = new THREE.MeshBasicMaterial({ map: T.word(text, '#ffffff', 512, 128, 800), transparent: true, depthWrite: false, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2 });
    m.userData.ownMap = true; mats.push(m); return [m, w];
  };
  const set = [[word(SPONSORS[0], 0.9), 0.52, 0.55], [word(SPONSORS[1], 0.7), 0.4, 0.44], [word(SPONSORS[4], 0.55), 0.28, 0.6]];
  for (const [[m, w], u, y] of set) for (const sx of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
    p.position.set(sx * (sh.W / 2 + 0.008), y, u * sh.L - sh.L / 2);
    p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(p);
  }
}

import * as THREE from 'three';
import { canvasTex, rng } from './util.js';

// TIC "Telemetry Glass" palette, used for city light so the game and the app feel like one brand.
export const PAL = {
  red: '#BF0003', orange: '#FF4500', amber: '#FFC400', teal: '#249689', softRed: '#FF5963', blue: '#587AF9',
  base: '#161B1F', sodium: '#FFB066'
};

const r = rng(9001);

function asphalt(g, w, h, base = 30) {
  g.fillStyle = `rgb(${base - 4},${base - 3},${base})`; g.fillRect(0, 0, w, h);
  for (let k = 0; k < (w * h) / 16; k++) {
    const v = base - 10 + Math.floor(r() * 26);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
}

export function makeTextures() {
  const T = {};
  T.windows = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#0c0e11'; g.fillRect(0, 0, w, h);
    const lit = ['#FFE2B0', '#FFC97A', '#FFF4E0', '#FF9A5A', '#FFD27F', '#FF5963'];
    for (let row = 0; row < 8; row++) {
      const rowLit = r() < 0.65;
      for (let c = 0; c < 8; c++) {
        const x = c * 64 + 9, y = row * 64 + 13;
        if (rowLit && r() < 0.5) { g.fillStyle = lit[Math.floor(r() * (r() < 0.9 ? 5 : 6))]; g.globalAlpha = 0.45 + r() * 0.55; }
        else { g.fillStyle = '#191c22'; g.globalAlpha = 1; }
        g.fillRect(x, y, 46, 36); g.globalAlpha = 1;
      }
    }
    g.fillStyle = '#07080a';
    for (let row = 0; row < 8; row++) g.fillRect(0, row * 64 + 57, w, 7);
  });
  T.windows.wrapS = T.windows.wrapT = THREE.RepeatWrapping;

  // Lane-marked road; u runs across the road, v along it (one repeat = 20 m).
  T.road = canvasTex(128, 512, (g, w, h) => {
    asphalt(g, w, h);
    g.fillStyle = 'rgba(235,235,235,.7)'; g.fillRect(5, 0, 3, h); g.fillRect(w - 8, 0, 3, h);
    g.fillStyle = 'rgba(255,196,0,.85)'; g.fillRect(60, 0, 3, h); g.fillRect(65, 0, 3, h);
    g.fillStyle = 'rgba(235,235,235,.5)';
    for (let y = 0; y < h; y += 256) { g.fillRect(33, y, 2, 120); g.fillRect(93, y, 2, 120); }
  });
  T.road.wrapS = T.road.wrapT = THREE.RepeatWrapping;

  T.inter = canvasTex(256, 256, (g, w, h) => {
    asphalt(g, w, h);
    g.fillStyle = 'rgba(235,235,235,.55)';
    for (let k = 34; k < 222; k += 20) { g.fillRect(k, 6, 11, 24); g.fillRect(k, h - 30, 11, 24); g.fillRect(6, k, 24, 11); g.fillRect(w - 30, k, 24, 11); }
  });

  T.tarmac = canvasTex(256, 256, (g, w, h) => {
    asphalt(g, w, h, 40);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
  });
  T.tarmac.wrapS = T.tarmac.wrapT = THREE.RepeatWrapping;

  T.rock = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { const v = 18 + Math.floor(r() * 20); g.fillStyle = `rgb(${v},${v - 1},${v - 2})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 4); }
  });
  T.rock.wrapS = T.rock.wrapT = THREE.RepeatWrapping;

  T.glow = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  T.beam = canvasTex(128, 256, (g, w, h) => {
    g.beginPath(); g.moveTo(54, h); g.lineTo(74, h); g.lineTo(w, 0); g.lineTo(0, 0); g.closePath();
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,240,215,.9)'); gr.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = gr; g.fill();
  });
  T.pillar = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  T.hoarding = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#d9d4c7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#FF4500'; for (let x = -64; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill(); }
    g.fillStyle = '#161B1F'; g.fillRect(0, 22, w, 20);
    g.fillStyle = '#fff'; g.font = '700 14px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TERMINAL ISLAND DEVELOPMENT · SITE 7', w / 2, 32);
  });
  T.hoarding.wrapS = THREE.RepeatWrapping;

  const SIGNS = [['RAMEN 24', PAL.softRed], ['KAIRO HOTEL', PAL.amber], ['PARTS', PAL.orange], ['ARCADE', '#ffffff'],
    ['NOODLE BAR', PAL.orange], ['CHARGE', PAL.amber], ['DYNO', PAL.softRed], ['LOUNGE', '#ffffff']];
  T.signs = canvasTex(1024, 512, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    SIGNS.forEach(([t, c], k) => {
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 128;
      g.strokeStyle = c; g.lineWidth = 5; g.shadowColor = c; g.shadowBlur = 18; g.strokeRect(x + 14, y + 14, 484, 100);
      g.font = '700 64px "Inter Tight", Arial, sans-serif'; g.fillStyle = '#fff'; g.fillText(t, x + 256, y + 66);
      g.fillStyle = c; g.globalAlpha = 0.6; g.fillText(t, x + 256, y + 66); g.globalAlpha = 1; g.shadowBlur = 0;
    });
  });

  // Big painted words for the road surface and signs (runway numbers, closures).
  T.word = (text, color = '#ffffff', w = 512, h = 128, font = 700) => canvasTex(w, h, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    let px = Math.floor(h * 0.62);
    g.font = `${font} ${px}px "Inter Tight", Arial, sans-serif`;
    // shrink long names so they never run off the sign
    const tw = g.measureText(text).width;
    if (tw > w * 0.94) { px = Math.floor(px * w * 0.94 / tw); g.font = `${font} ${px}px "Inter Tight", Arial, sans-serif`; }
    g.fillText(text, w / 2, h / 2 + 4);
  });

  T.sky = canvasTex(2, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#050608'); gr.addColorStop(0.4, '#0f1114'); gr.addColorStop(0.56, '#2a1712'); gr.addColorStop(1, '#2a1712');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return T;
}

export function makeMaterials(T) {
  const DS = THREE.DoubleSide;
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: DS };
  return {
    add,
    building: new THREE.MeshBasicMaterial({ map: T.windows, vertexColors: true, side: DS }),
    solid: new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true, side: DS }),
    road: new THREE.MeshLambertMaterial({ map: T.road, side: DS }),
    inter: new THREE.MeshLambertMaterial({ map: T.inter, side: DS }),
    tarmac: new THREE.MeshLambertMaterial({ map: T.tarmac, side: DS }),
    rock: new THREE.MeshLambertMaterial({ map: T.rock, side: DS, vertexColors: true }),
    hoarding: new THREE.MeshLambertMaterial({ map: T.hoarding, side: DS }),
    signs: new THREE.MeshBasicMaterial({ map: T.signs, ...add }),
    pools: new THREE.MeshBasicMaterial({ map: T.glow, vertexColors: true, opacity: 0.5, ...add }),
    paint: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: DS, depthWrite: false })
  };
}

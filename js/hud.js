import { clamp } from './util.js';
import { mapShapes } from './world.js';

const $ = id => document.getElementById(id);
const SHAPES = mapShapes();

export class Hud {
  constructor() {
    this.notice = $('notice'); this.place = ''; this.dot = $('steerDot');
    this.spd = $('spd'); this.gear = $('gear'); this.gearMode = $('gearMode'); this.needle = $('tNeedle'); this.redline = 0;
    this.mini = $('mini'); this.mctx = this.mini.getContext('2d');
    this.noticeT = null; this.t = 0; this.defaultTicker = [];
  }
  setTicker() {}
  // dial face for this car: numbers in thousands, red from the redline up
  dial(redline) {
    this.redline = redline; this.max = Math.ceil(redline / 1000 + 0.5) * 1000;
    const ang = r => 135 + 270 * r / this.max, P = (a, rad) => [100 + rad * Math.cos(a * Math.PI / 180), 100 + rad * Math.sin(a * Math.PI / 180)];
    let h = '';
    for (let r = 0; r <= this.max; r += 500) {
      const a = ang(r), major = r % 1000 === 0, [x1, y1] = P(a, 90), [x2, y2] = P(a, major ? 78 : 84);
      h += `<line class="t-tick${major ? '' : ' minor'}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      if (major) { const [tx, ty] = P(a, 66); h += `<text class="t-num" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${r / 1000}</text>`; }
    }
    $('tTicks').innerHTML = h;
    $('tRed').setAttribute('d', arc(87, ang(redline), ang(this.max)));
  }
  fuel(level) { const f = $('tFuel'); f.setAttribute('d', arc(88, 130 - 35 * level, 130)); f.classList.toggle('low', level < 0.15); }
  // short notice under the steering bar, no banner
  say(msg, ms = 2600) {
    this.notice.textContent = msg; this.notice.classList.add('on');
    clearTimeout(this.noticeT); this.noticeT = setTimeout(() => this.notice.classList.remove('on'), ms);
  }
  setPlace(name) { if (name === this.place) return; const first = !this.place; this.place = name; if (!first) this.say(name, 1800); }
  // where the steering wheel is pointing, -1 left to 1 right
  steer(v) { this.dot.style.left = (50 + Math.max(-1, Math.min(1, v)) * 50).toFixed(1) + '%'; }
  update(car, dt, marks) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.05;
    this.spd.textContent = Math.round(car.kmh);
    this.gear.textContent = car.gearLabel;
    if (car.spec.redline !== this.redline) this.dial(car.spec.redline);
    const x = Math.min(1, car.rpm / car.spec.redline);
    this.needle.style.transform = `rotate(${(-135 + 270 * car.rpm / this.max).toFixed(1)}deg)`;
    this.gear.classList.toggle('shift-now', x > 0.9 && !car.auto && !car.reverse && car.gear < 6);
    $('tNos').setAttribute('d', arc(88, 50, 50 + 35 * car.nitro));
    this.gearMode.textContent = car.auto ? 'auto' : 'manual';
    drawMap(this.mctx, this.mini.width, this.mini.height, car.x, car.z, this.mini.width / 420, [Math.sin(car.h), Math.cos(car.h)], car, false, 1, marks);
  }
}

// SVG arc on the dial, angles in degrees clockwise from 3 o'clock
function arc(r, a0, a1) {
  if (a1 - a0 < 0.5) return '';
  const p = a => [100 + r * Math.cos(a * Math.PI / 180), 100 + r * Math.sin(a * Math.PI / 180)], [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
export function drawMap(ctx, w, h, cx, cz, s, up, car, full, k = 1, marks = []) {
  const [ux, uz] = up, rx = -uz, rz = ux;
  const a = s * rx, c = s * rz, b = -s * ux, d = -s * uz, e = w / 2 - a * cx - c * cz, f = h / 2 - b * cx - d * cz;
  const pt = (x, z) => [a * x + c * z + e, b * x + d * z + f];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(a, b, c, d, e, f);
  const rect = (r, col) => { ctx.fillStyle = col; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); };
  const poly = (pts, closed) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.z) : ctx.moveTo(q.x, q.z))); if (closed) ctx.closePath(); };
  poly(SHAPES.coast, true); ctx.fillStyle = '#121a13'; ctx.fill();
  ctx.fillStyle = '#1d261b';
  for (const hl of SHAPES.hills) { ctx.beginPath(); ctx.arc(hl.x, hl.z, hl.vr, 0, Math.PI * 2); ctx.fill(); }
  for (const r of SHAPES.paved) rect(r, '#262a30');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of SHAPES.roads) { poly(r.pts, r.closed); ctx.lineWidth = Math.max(r.w, 2.2 / s); ctx.strokeStyle = r.id === 'closed' ? '#3a3d42' : '#5a5f66'; ctx.stroke(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (full) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const zn of SHAPES.zones) {
      const [px, py] = pt(zn.x, zn.z);
      ctx.font = `600 ${18 * k}px "Inter Tight", Arial, sans-serif`; ctx.fillStyle = '#FFC400'; ctx.fillText(zn.name.toUpperCase(), px, py);
    }
    for (const cl of SHAPES.closed) {
      const [px, py] = pt(cl.x + cl.ux * 90, cl.z + cl.uz * 90);
      ctx.font = `600 ${14 * k}px "Inter Tight", Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(cl.name.toUpperCase(), px, py - 9 * k); ctx.font = `500 ${12 * k}px Inter, Arial, sans-serif`; ctx.fillText('Under construction', px, py + 9 * k);
    }
  }
  // events, rivals and the next checkpoint
  for (const m of marks) {
    const [mx, my] = pt(m.x, m.z);
    if (!full && (mx < -8 || my < -8 || mx > w + 8 || my > h + 8)) {
      // off the minimap: pin it to the edge so you know which way to go
      if (!m.ring) continue;
    }
    const ex = clamp(mx, 8, w - 8), ey = clamp(my, 8, h - 8);
    ctx.beginPath(); ctx.arc(ex, ey, (m.small ? 4.5 : m.ring ? 8 : 7) * k * (full ? 1.2 : 1), 0, Math.PI * 2);
    if (m.ring) { ctx.lineWidth = 3 * k; ctx.strokeStyle = m.c; ctx.stroke(); }
    else { ctx.fillStyle = m.c; ctx.fill(); if (!m.small) { ctx.lineWidth = 2 * k; ctx.strokeStyle = '#000'; ctx.stroke(); } }
  }
  // you: a red arrow, the one thing that glows
  const [px, py] = pt(car.x, car.z);
  const fx = Math.sin(car.h), fz = Math.cos(car.h), dx = a * fx + c * fz, dy = b * fx + d * fz;
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dx, -dy)); ctx.scale(k * (full ? 1.3 : 1), k * (full ? 1.3 : 1));
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3); ctx.lineTo(-6.5, 7); ctx.closePath();
  ctx.fillStyle = '#FF3030'; ctx.shadowColor = '#BF0003'; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
}

import { clamp } from './util.js';
import { mapShapes } from './world.js';

const $ = id => document.getElementById(id);
const SHAPES = mapShapes();

export class Hud {
  constructor() {
    this.l1 = $('l1'); this.l2 = $('l2'); this.notice = $('notice'); this.place = '';
    this.spd = $('spd'); this.gear = $('gear'); this.rpm = $('rpmFill'); this.nos = $('nosFill'); this.gearMode = $('gearMode');
    this.mini = $('mini'); this.mctx = this.mini.getContext('2d');
    this.noticeT = null; this.t = 0;
    this.defaultTicker = ['Explore Terminal Island', 'Drive into a glowing marker to start a race', 'Neon Row, Dockside and Old Terminal are open',
      'The Foundry, Highcliff and the Causeway are under construction', 'Inertia barriers active'];
    this.setTicker(this.defaultTicker);
  }
  setTicker(items) {
    const run = items.map(t => `<span>${t}</span>`).join('');
    $('ticker').innerHTML = run + run;
  }
  say(msg, ms = 3200) {
    this.notice.textContent = msg; this.l2.classList.add('showing');
    clearTimeout(this.noticeT); this.noticeT = setTimeout(() => this.l2.classList.remove('showing'), ms);
  }
  // line 1 swaps like a dash changing mode
  setPlace(name) {
    if (name === this.place) return;
    this.place = name;
    const olds = [...this.l1.querySelectorAll('span')], nu = document.createElement('span');
    nu.textContent = name; nu.style.transform = 'translateY(100%)'; nu.style.opacity = '0';
    this.l1.appendChild(nu);
    for (const o of olds) { if (o.dataset.leaving) continue; o.dataset.leaving = '1'; setTimeout(() => o.remove(), 320); }
    requestAnimationFrame(() => { nu.style.transform = ''; nu.style.opacity = ''; for (const o of olds) { o.style.transform = 'translateY(-100%)'; o.style.opacity = '0'; } });
  }
  update(car, dt, marks) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.05;
    this.spd.textContent = Math.round(car.kmh);
    this.gear.textContent = car.gearLabel;
    const x = Math.min(1, car.rpm / car.spec.redline);
    this.rpm.style.width = (x * 100).toFixed(1) + '%';
    this.gear.classList.toggle('shift-now', x > 0.9 && !car.auto && !car.reverse && car.gear < 6);
    this.nos.style.width = Math.round(car.nitro * 100) + '%';
    this.gearMode.textContent = car.auto ? 'auto' : 'manual';
    drawMap(this.mctx, this.mini.width, this.mini.height, car.x, car.z, this.mini.width / 420, [Math.sin(car.h), Math.cos(car.h)], car, false, 1, marks);
  }
}

export function drawMap(ctx, w, h, cx, cz, s, up, car, full, k = 1, marks = []) {
  const [ux, uz] = up, rx = -uz, rz = ux;
  const a = s * rx, c = s * rz, b = -s * ux, d = -s * uz, e = w / 2 - a * cx - c * cz, f = h / 2 - b * cx - d * cz;
  const pt = (x, z) => [a * x + c * z + e, b * x + d * z + f];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(a, b, c, d, e, f);
  const rect = (r, col) => { ctx.fillStyle = col; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); };
  for (const dd of SHAPES.districts) rect(dd.rect, '#14181c');
  for (const r of SHAPES.tarmac) rect(r, '#262a30');
  for (const r of SHAPES.roads) rect(r, '#5a5f66');
  for (const t of SHAPES.tunnels) rect(t.rect, '#8a6a10');
  for (const cl of SHAPES.closed) rect(cl.rect, '#3a3d42');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (full) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const dd of SHAPES.districts) {
      const [px, py] = pt(dd.cx, dd.cz);
      ctx.font = `600 ${18 * k}px "Inter Tight", Arial, sans-serif`; ctx.fillStyle = '#FFC400'; ctx.fillText(dd.name.toUpperCase(), px, py);
    }
    for (const cl of SHAPES.closed) {
      const r = cl.rect, ex = cl.axis === 'x' ? (cl.end > 0 ? r.x1 + 90 : r.x0 - 90) : (r.x0 + r.x1) / 2, ez = cl.axis === 'z' ? (cl.end > 0 ? r.z1 + 90 : r.z0 - 90) : (r.z0 + r.z1) / 2;
      const [px, py] = pt(ex, ez);
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

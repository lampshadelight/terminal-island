import * as THREE from 'three';
import { clamp, lerp, rng } from './util.js';
import { makeTextures, makeMaterials } from './textures.js';
import { DATA, collide, placeAt, Streamer, buildStatic } from './world.js';
import { CARS, Car, buildCar, syncModel } from './car.js';
import { Controls } from './controls.js';
import { Audio } from './audio.js';
import { Hud, drawMap } from './hud.js';
import { Race } from './race.js';

const $ = id => document.getElementById(id);

/* ---------------- renderer and scene ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
const scene = new THREE.Scene();
const T = makeTextures(), M = makeMaterials(T);
scene.background = T.sky;
scene.fog = new THREE.FogExp2(0x1f1714, 0.0042);
scene.add(new THREE.HemisphereLight(0x8a7a90, 0x2a1a12, 0.55));
const moon = new THREE.DirectionalLight(0xffd9b0, 0.35); moon.position.set(-0.4, 1, 0.3); scene.add(moon);
const carLight = new THREE.PointLight(0xffb070, 1.1, 40, 1.6); scene.add(carLight);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);

buildStatic(scene, T, M);
const streamer = new Streamer(scene, T, M);

/* ---------------- player ---------------- */
const car = new Car(CARS.zephyr);
const model = buildCar(CARS.zephyr, '#BF0003', 0xff2a10, T);
scene.add(model.g);
const sp = DATA.neon.spawn;
car.reset(sp.x, sp.z, sp.h);

const controls = new Controls();
controls.bindButtons(document.getElementById('hud'));
const audio = new Audio();
const hud = new Hud();

/* ---------------- traffic: self-driving cars on the district grids ---------------- */
const TRAFFIC_PAINT = ['#d8dade', '#2a2e35', '#5b6470', '#e9e4da', '#1c2a3a', '#6b1e1e'];
const traffic = new Map(); // district id -> array of bots
const pool = [];
const rnd = rng(7);
function graph(d) {
  if (d._g) return d._g;
  const nodes = new Map(d.nodes.map(n => [n.id, { ...n, nb: [] }]));
  for (const [a, b] of d.edges) { const A = nodes.get(a), B = nodes.get(b); if (A && B) { A.nb.push(B); B.nb.push(A); } }
  return (d._g = [...nodes.values()].filter(n => n.nb.length));
}
function spawnTraffic(id) {
  const d = DATA[id], g = graph(d);
  if (!g.length) return;
  const n = id === 'terminal' ? 8 : 16, bots = [];
  for (let k = 0; k < n; k++) {
    const a = g[Math.floor(rnd() * g.length)], b = a.nb[Math.floor(rnd() * a.nb.length)];
    const spec = Object.values(CARS)[k % 3];
    let m = pool.pop();
    if (!m) { m = buildCar(spec, TRAFFIC_PAINT[k % TRAFFIC_PAINT.length], null, T, { beam: false }); scene.add(m.g); }
    m.g.visible = trafficOn;
    bots.push({ a, b, t: rnd(), v: 9 + rnd() * 5, m, x: a.x, z: a.z, vx: 0, vz: 0, h: 0, lane: (d.RW || 16) * 0.25, barrier: 0, wait: 0 });
  }
  traffic.set(id, bots);
}
function dropTraffic(id) {
  const bots = traffic.get(id); if (!bots) return;
  // models are kept and reused, so nothing is rebuilt each time you pass a tunnel
  for (const b of bots) { b.m.g.visible = false; pool.push(b.m); }
  traffic.delete(id);
}
function stepTraffic(dt) {
  if (!trafficOn) return;
  for (const bots of traffic.values()) for (const b of bots) {
    const dx = b.b.x - b.a.x, dz = b.b.z - b.a.z, L = Math.hypot(dx, dz) || 1;
    // slow down when the player is right in front
    const fx = dx / L, fz = dz / L, px = car.x - b.x, pz = car.z - b.z, ahead = px * fx + pz * fz, side = Math.abs(px * fz - pz * fx);
    const blocked = ahead > 0 && ahead < 14 && side < 3;
    b.wait = blocked ? 0 : b.wait;
    const v = blocked ? 0 : b.v;
    b.t += v * dt / L;
    if (b.t >= 1) {
      const prev = b.a; b.a = b.b;
      const opts = b.a.nb.filter(n => n !== prev);
      b.b = (opts.length ? opts : b.a.nb)[Math.floor(rnd() * (opts.length || b.a.nb.length))];
      b.t = 0;
      continue;
    }
    // keep right: offset from the centre line
    const rx = -fz, rz = fx;
    const nx = b.a.x + dx * b.t + rx * b.lane, nz = b.a.z + dz * b.t + rz * b.lane;
    b.vx = (nx - b.x) / Math.max(dt, 1e-3); b.vz = (nz - b.z) / Math.max(dt, 1e-3);
    b.x = nx; b.z = nz;
    const th = Math.atan2(fx, fz); let dh = th - b.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    b.h += dh * Math.min(1, dt * 6);
    b.m.g.position.set(b.x, 0, b.z); b.m.g.rotation.y = b.h;
    for (const w of b.m.wheels) w.rotation.x += v * dt / 0.37;
    if (b.barrier > 0) b.barrier = Math.max(0, b.barrier - dt * 2.2);
    b.m.shell.material.opacity = b.barrier * 0.55; b.m.shell.rotation.y += dt * 2;
    // inertia barriers between the player and traffic: bounce, no damage
    const ex = car.x - b.x, ez = car.z - b.z, d2 = ex * ex + ez * ez, R2 = 3.4 * 3.4;
    if (d2 < R2 && d2 > 1e-6) {
      const d = Math.sqrt(d2), nx2 = ex / d, nz2 = ez / d;
      car.x += nx2 * (3.4 - d); car.z += nz2 * (3.4 - d);
      const rv = (car.vx - b.vx * 0) * nx2 + (car.vz - b.vz * 0) * nz2;
      if (rv < 0) {
        car.vx -= 1.4 * rv * nx2; car.vz -= 1.4 * rv * nz2; car.vx *= 0.8; car.vz *= 0.8;
        refreshFL();
        if (-rv > 3) { car.hit(-rv); b.barrier = Math.min(1, 0.4 + -rv * 0.05); audio.thump(-rv); barrierNote(); }
      }
    }
  }
}
// collisions edit vx/vz, so rebuild the forward/lateral split the physics uses
function refreshFL() {
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  car.f = car.vx * fx + car.vz * fz; car.l = car.vx * fz - car.vz * fx;
}
let lastNote = 0;
function barrierNote() {
  const now = performance.now();
  if (now - lastNote > 5000) { hud.say('Inertia barrier contact'); lastNote = now; }
}

/* ---------------- state ---------------- */
const state = { running: false, paused: true, mapOpen: false };
let trafficOn = true;
let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camInit = false, blink = 0;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const tall = race && race.portrait, wrong = state.running && isTouch && (tall ? w > h : h > w);
  $('rotate').hidden = !wrong;
  $('rotTitle').textContent = tall ? 'Turn your phone upright' : 'Turn your phone sideways';
  $('rotText').textContent = tall ? 'Drag and roll races are played in portrait.' : 'Free roam is played in landscape.';
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------------- overlays ---------------- */
function show(id, on) { $(id).hidden = !on; }
async function goPortrait() { try { screen.orientation && screen.orientation.lock && await screen.orientation.lock('portrait'); } catch (e) {} }
async function goLandscape() {
  try { if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { screen.orientation && screen.orientation.lock && await screen.orientation.lock('landscape'); } catch (e) {}
}
function begin() {
  show('title', false); state.running = true; state.paused = false; audio.start(); audio.setMuted(muted); resize(); hud.say('Welcome to Terminal Island', 3600);
}
$('startTilt').addEventListener('click', async () => {
  audio.start(); goLandscape();
  const ok = await controls.enableTilt();
  if (!ok) {
    $('titleNote').textContent = 'Tilt is not available on this device or was not allowed, so touch buttons are on. You can switch in the pause menu.';
    useTouch(); setTimeout(begin, 1400); return;
  }
  controls.mode = 'tilt'; document.body.classList.remove('touch');
  show('title', false); show('calib', true); state.calibThen = 'begin';
});
$('startTouch').addEventListener('click', () => { audio.start(); goLandscape(); useTouch(); begin(); });
function useTouch() { controls.mode = 'touch'; document.body.classList.add('touch'); $('tiltHint').hidden = true; updateMenu(); }
$('calibGo').addEventListener('click', () => {
  controls.calibrate(); show('calib', false); controls.clear();
  if (state.calibThen === 'begin') { begin(); $('tiltHint').hidden = false; setTimeout(() => $('tiltHint').hidden = true, 6000); }
  else resume();
  state.calibThen = null; updateMenu();
});
function pause() {
  if (!state.running || state.paused) return;
  state.paused = true; controls.clear(); audio.suspend();
  $('pausePlace').textContent = hud.place || 'Terminal Island'; updateMenu(); show('pause', true);
}
function resume() { show('pause', false); show('map', false); show('eventCard', false); state.mapOpen = false; state.paused = false; controls.clear(); audio.resume(); }
$('pauseBtn').addEventListener('click', () => state.paused ? resume() : pause());
$('pResume').addEventListener('click', resume);
$('pRestart').addEventListener('click', () => { if (race.active) { show('results', false); race.restart(); resume(); } });
$('pLeave').addEventListener('click', () => { show('results', false); race.leave(); resume(); });
$('pCalib').addEventListener('click', async () => {
  if (controls.mode !== 'tilt') { const ok = await controls.enableTilt(); if (!ok) { hud.say('Tilt is not available here'); return; } controls.mode = 'tilt'; document.body.classList.remove('touch'); }
  show('pause', false); show('calib', true); state.calibThen = 'resume';
});
$('pGears').addEventListener('click', () => { car.auto = !car.auto; updateMenu(); });
$('pMode').addEventListener('click', async () => {
  if (controls.mode === 'tilt') useTouch();
  else { const ok = await controls.enableTilt(); if (!ok) { hud.say('Tilt is not available here'); return; } controls.mode = 'tilt'; document.body.classList.remove('touch'); show('pause', false); show('calib', true); state.calibThen = 'resume'; }
  updateMenu();
});
$('pInvert').addEventListener('click', () => { controls.invert = !controls.invert; updateMenu(); });
let muted = false;
try { muted = localStorage.getItem('ti.muted') === '1'; car.auto = localStorage.getItem('ti.auto') === '1'; controls.invert = localStorage.getItem('ti.invert') === '1'; } catch (e) {}
$('pSound').addEventListener('click', () => { muted = !muted; audio.setMuted(muted); updateMenu(); });
function updateMenu() {
  $('pGears').textContent = 'Gears: ' + (car.auto ? 'automatic' : 'manual');
  $('pMode').textContent = 'Controls: ' + (controls.mode === 'tilt' ? 'tilt' : 'touch buttons');
  $('pInvert').textContent = 'Tilt to accelerate: ' + (controls.invert ? 'toward you' : 'away from you');
  $('pSound').textContent = 'Sound: ' + (muted ? 'off' : 'on');
  $('pCalib').hidden = $('pInvert').hidden = controls.mode !== 'tilt';
  try { localStorage.setItem('ti.muted', muted ? '1' : '0'); localStorage.setItem('ti.auto', car.auto ? '1' : '0'); localStorage.setItem('ti.invert', controls.invert ? '1' : '0'); } catch (e) {}
}
updateMenu();

const big = $('bigMap'), bctx = big.getContext('2d');
function openMap() {
  if (!state.running) return;
  if (!state.paused) { state.paused = true; controls.clear(); audio.suspend(); }
  show('pause', false);
  const row = innerHeight <= 500;
  const px = Math.max(200, Math.min(row ? innerWidth - 260 : innerWidth - 32, row ? innerHeight - 32 : innerHeight - 150, 640)), dpr = Math.min(2, devicePixelRatio || 1);
  big.style.width = big.style.height = px + 'px'; big.width = big.height = Math.round(px * dpr);
  // the whole island, including the unfinished roads out over the sea
  drawMap(bctx, big.width, big.height, -300, 420, big.width / 3000, [0, -1], car, true, dpr * clamp(px / 520, 0.6, 1.1), race.marks());
  show('map', true); state.mapOpen = true;
}
$('mapBtn').addEventListener('click', openMap); $('pMap').addEventListener('click', openMap); $('mini').addEventListener('click', openMap);
$('mapClose').addEventListener('click', resume);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('keydown', e => {
  if (!$('results').hidden) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { state.paused ? (state.mapOpen ? resume() : (state.running && resume())) : pause(); }
  if (e.code === 'KeyM') state.mapOpen ? resume() : openMap();
});

/* ---------------- races ---------------- */
const ui = {
  modal(id) { if (!state.paused) { state.paused = true; controls.clear(); } show(id, true); },
  setTraffic(on) { trafficOn = on; for (const bots of traffic.values()) for (const b of bots) b.m.g.visible = on; },
  needRotate: () => isTouch && innerWidth > innerHeight,
  count(text, go) {
    const el = $('count');
    if (text == null) { el.hidden = true; return; }
    el.hidden = false; el.textContent = text; el.classList.toggle('go', !!go);
  },
  raceUi(on, ev) {
    const tall = !!(on && ev.strip);
    const was = document.body.classList.contains('portrait');
    document.body.classList.toggle('portrait', tall);
    show('raceBox', on); show('rbStrip', tall); show('balance', tall && controls.mode === 'tilt');
    $('pRestart').hidden = $('pLeave').hidden = !on;
    if (!on) { ui.count(null); place = ''; }
    if (tall) goPortrait(); else if (was) goLandscape();
    camInit = false; resize();
  },
  raceHud(i) {
    $('rbBig').textContent = i.big; $('rbUnit').textContent = i.unit; $('rbL1').textContent = i.l1; $('rbV1').textContent = i.v1;
    $('rbTime').textContent = i.time; $('rbPend').textContent = i.pending || '';
    if (i.you != null) { $('stripYou').style.left = (i.you * 100).toFixed(1) + '%'; $('stripRival').style.left = (i.rival * 100).toFixed(1) + '%'; }
    if (i.tilt) {
      const span = 25, zw = clamp(i.dz / span, 0, 1) * 50;
      $('balZone').style.left = (50 - zw) + '%'; $('balZone').style.right = (50 - zw) + '%';
      $('balDot').style.left = (50 - clamp(i.roll / span, -1, 1) * 50).toFixed(1) + '%';
      const out = Math.abs(i.roll) > i.dz;
      $('balance').classList.toggle('out', out); $('balWarn').textContent = out ? 'Level the phone' : '';
      $('balWob').style.width = (i.wobble * 100).toFixed(0) + '%';
    }
  },
  results(r) {
    if (!race.active) return;
    $('resLabel').textContent = r.label; $('resLabel').style.color = r.color || '';
    $('resTitle').textContent = r.title; $('resText').textContent = r.text;
    $('resPills').innerHTML = r.pills.map(p => `<span class="pill" style="--c:${r.color || '#BF0003'}">${p}</span>`).join('');
    ui.modal('results');
  }
};
const race = new Race({ scene, T, car, model, hud, controls, audio, ui });
$('evStart').addEventListener('click', () => { show('eventCard', false); race.start(); resume(); });
$('evSkip').addEventListener('click', () => { show('eventCard', false); resume(); });
$('resDone').addEventListener('click', () => { show('results', false); race.leave(); resume(); });
$('resRetry').addEventListener('click', () => { show('results', false); race.restart(); resume(); });

/* ---------------- main loop ---------------- */
let last = performance.now(), place = '';
const tmp = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const live = state.running && !state.paused;
  const raw = controls.update(dt);
  const inp = live && race.active ? race.input(raw, dt) : raw;
  if (live) {
    while (controls.shifts.length) {
      const d = controls.shifts.shift(), ratio = car.rpm / car.spec.redline;
      if (car.shift(d)) { audio.blip(d > 0 ? 520 : 380, 0.06, 'square', 0.05); race.onShift(d, ratio); }
    }
    for (let s = 0; s < 2; s++) {
      car.step(dt / 2, inp, race.locked);
      const hit = collide(car, 1.7);
      if (hit) { refreshFL(); if (hit > 3) { car.hit(hit); audio.thump(hit); barrierNote(); race.onHit(hit); navigator.vibrate && hit > 8 && navigator.vibrate(20); } }
    }
    stepTraffic(dt);
    race.update(dt);
    if (!race.active) race.checkMarkers(car);
  } else controls.shifts.length = 0;
  streamer.update(car.x, car.z, spawnTraffic, dropTraffic);
  syncModel(model, car, live ? dt : 0);
  carLight.position.set(car.x + Math.sin(car.h) * 6, 5, car.z + Math.cos(car.h) * 6);

  // chase camera: drops back and widens with speed
  const v = Math.abs(car.f), fx = Math.sin(car.h), fz = Math.cos(car.h);
  const tall = race.portrait;
  const back = tall ? 6.4 + v * 0.03 : 7.2 + v * 0.05, up = tall ? 2.4 + v * 0.008 : 2.7 + v * 0.012, ahead = tall ? 14 : 6;
  tmp.set(car.x - fx * back, up, car.z - fz * back);
  if (!camInit) { camPos.copy(tmp); camLook.set(car.x, 1, car.z); camInit = true; }
  camPos.lerp(tmp, 1 - Math.exp(-dt * 7));
  camLook.lerp(new THREE.Vector3(car.x + fx * ahead, 1.1, car.z + fz * ahead), 1 - Math.exp(-dt * 12));
  camera.position.copy(camPos); camera.lookAt(camLook);
  const fov = (tall ? 74 : 62) + clamp(v / car.spec.top, 0, 1) * (tall ? 12 : 14) + (car.nos ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4)); camera.updateProjectionMatrix(); }

  // blinking red beacons on towers and cranes
  blink += dt;
  const on = (blink % 1.6) < 0.8;
  for (const g of streamer.loaded.values()) if (g.userData.reds) g.userData.reds.visible = on;

  if (state.running) {
    hud.update(car, dt, race.marks());
    const p = placeAt(car.x, car.z);
    if (race.active) place = p.name;
    else if (p.name !== place) {
      if (place && p.kind === 'district') hud.say('Entering ' + p.name);
      if (p.kind === 'closed') hud.say(p.c.name + ' is still under construction');
      place = p.name; hud.setPlace(p.name);
    }
    // the edge light on the glass follows the phone's tilt
    if (controls.mode === 'tilt' && controls.tiltLive) {
      const r = (controls.tilt.roll - controls.tilt.roll0) * 57.3;
      document.documentElement.style.setProperty('--ang', (135 + clamp(r, -40, 40) * 1.5).toFixed(0) + 'deg');
    }
  }
  audio.update(car, inp.throttle, !live);
  renderer.render(scene, camera);
}
resize();
requestAnimationFrame(frame);
window.__ti = { car, state, controls, streamer, traffic, race };

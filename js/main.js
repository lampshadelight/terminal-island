import * as THREE from 'three';
import { clamp, lerp, rng } from './util.js';
import { makeTextures, makeMaterials } from './textures.js';
import { DATA, collide, placeAt, Streamer, buildStatic, ROADS, roadPose, onRoad } from './world.js';
import { CARS, Car, buildCar, syncModel, disposeCar } from './car.js';
import { carStats } from './garage.js';
import { Controls } from './controls.js';
import { Audio } from './audio.js';
import { Hud, drawMap } from './hud.js';
import { Race, clubsHtml, LIVE_EVENTS, liveEvent, EVENTS, TYPES } from './race.js';
import { Live } from './live.js';
import { WetRoads, makeBloom, Trails } from './fx.js';
import { SHOPS, Shops, buildShopDoors, tunedSpec, looks } from './garage.js';
import { Fuel, fmtLeft } from './fuel.js';
import { save, persist, money, newCar, START_PAINT } from './save.js';

const $ = id => document.getElementById(id);

/* ---------------- renderer and scene ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
const scene = new THREE.Scene();
const T = makeTextures(), M = makeMaterials(T);
scene.background = T.sky;
scene.fog = new THREE.FogExp2(0x26170f, 0.0046);
scene.add(new THREE.HemisphereLight(0x8a7a90, 0x2a1a12, 0.55));
const moon = new THREE.DirectionalLight(0xffd9b0, 0.35); moon.position.set(-0.4, 1, 0.3); scene.add(moon);
const carLight = new THREE.PointLight(0xffb070, 1.1, 40, 1.6); scene.add(carLight);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);
camera.layers.enable(1);

buildStatic(scene, T, M);
const streamer = new Streamer(scene, T, M);

/* ---------------- player ---------------- */
let previewId = save.current || 'kaze';
const shownId = () => save.current || previewId;
const car = new Car(tunedSpec(shownId()));
const modelOpts = L => ({ rims: L.rims, vinyl: L.vinyl, vinylColor: L.vinylColor, decals: L.decals });
function makeModel() {
  const L = looks(shownId()), m = buildCar(L.spec, L.paint, L.glow ? new THREE.Color(L.glow).getHex() : null, T, modelOpts(L));
  scene.add(m.g); return m;
}
let model = makeModel();
// after buying, tuning or repainting: new numbers, new model
function applyCar() { car.setSpec(tunedSpec(shownId())); disposeCar(model, T); model = makeModel(); }
const sp = DATA.neon.spawn;
car.reset(sp.x, sp.z, sp.h);

const controls = new Controls();
controls.bindButtons(document.getElementById('hud'));
// Safari ignores user-scalable=no, so block pinch and double-tap zoom by hand
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !e.target.closest('.overlay')) e.preventDefault(); }, { passive: false });
const audio = new Audio();
const hud = new Hud();

/* ---------------- traffic: self-driving cars on the district grids ---------------- */
const TRAFFIC_PAINT = ['#d8dade', '#2a2e35', '#5b6470', '#e9e4da', '#1c2a3a', '#6b1e1e'];
const traffic = new Map(); // district id -> array of bots
const pool = [];
const rnd = rng(7);
const TRAFFIC_ROADS = ROADS.filter(r => r.id !== 'closed');
function spawnTraffic(id) {
  const bots = [], total = TRAFFIC_ROADS.reduce((t, r) => t + r.len, 0);
  for (let k = 0; k < 26; k++) {
    // more cars on longer roads
    let pick = rnd() * total, road = TRAFFIC_ROADS[0];
    for (const r of TRAFFIC_ROADS) { if (pick < r.len) { road = r; break; } pick -= r.len; }
    const spec = Object.values(CARS)[k % 3];
    let m = pool.pop();
    if (!m) { m = buildCar(spec, TRAFFIC_PAINT[k % TRAFFIC_PAINT.length], null, T, { beam: false }); scene.add(m.g); }
    m.g.visible = trafficOn;
    const p = roadPose(road, pick);
    bots.push({ road, s: pick, dir: rnd() < 0.5 ? 1 : -1, v: 9 + rnd() * 6, m, x: p.x, z: p.z, vx: 0, vz: 0, h: p.h, lane: road.w * 0.25, barrier: 0 });
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
    const p0 = roadPose(b.road, b.s), th = b.dir > 0 ? p0.h : p0.h + Math.PI, fx = Math.sin(th), fz = Math.cos(th);
    // slow down when the player is right in front
    const px = car.x - b.x, pz = car.z - b.z, ahead = px * fx + pz * fz, side = Math.abs(px * fz - pz * fx);
    const v = ahead > 0 && ahead < 14 && side < 3 ? 0 : b.v;
    b.s += b.dir * v * dt;
    // open roads: turn round at the end
    if (!b.road.closed && (b.s <= 1 || b.s >= b.road.len - 1)) { b.dir = -b.dir; b.s = clamp(b.s, 1, b.road.len - 1); }
    const p = roadPose(b.road, b.s), h2 = b.dir > 0 ? p.h : p.h + Math.PI, gx = Math.sin(h2), gz = Math.cos(h2);
    // keep right: offset from the centre line
    const nx = p.x - gz * b.lane, nz = p.z + gx * b.lane;
    b.vx = (nx - b.x) / Math.max(dt, 1e-3); b.vz = (nz - b.z) / Math.max(dt, 1e-3);
    b.x = nx; b.z = nz;
    let dh = h2 - b.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
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

/* ---------------- graphics quality ---------------- */
// basic by default while we tune the driving; Medium adds wet roads, High adds glow
const GFX = ['Basic', 'Medium', 'High'];
let quality = 0, composer = null, composerLoading = false;
try { const q = localStorage.getItem('ti.gfx'); if (q !== null) quality = +q; } catch (e) {}
const wet = new WetRoads(renderer, scene, camera);
for (const m of [M.road, M.inter, M.tarmac]) wet.patch(m);
const trails = new Trails(scene);
function applyQuality() {
  wet.enabled = quality >= 1;
  if (quality >= 2 && !composer && !composerLoading) {
    composerLoading = true;
    makeBloom(renderer, scene, camera).then(c => { composer = c; composerLoading = false; resize(); }).catch(() => { composerLoading = false; });
  }
  try { localStorage.setItem('ti.gfx', String(quality)); } catch (e) {}
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  wet.setSize(w, h); if (composer) composer.setSize2(w, h);
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
  show('title', false); state.running = true; document.body.classList.add('running'); state.paused = false; audio.start(); audio.setMuted(muted); resize(); hud.say('Welcome to Terminal Island', 3600);
}
async function startWith(mode) {
  audio.start(); goLandscape();
  if (mode === 'touch') { useTouch(); begin(); return; }
  const ok = await controls.enableTilt();
  if (!ok) {
    $('titleNote').textContent = 'Tilt is not available on this device or was not allowed, so touch buttons are on. You can switch in the pause menu.';
    show('title', true); useTouch(); setTimeout(begin, 1400); return;
  }
  controls.mode = 'tilt'; document.body.classList.remove('touch');
  show('title', false); show('calib', true); state.calibThen = 'begin';
}
// first time only: pick one of the five starter cars in a slowly turning showroom
function openStarter(mode) {
  state.startMode = mode; state.showroom = true; show('title', false); show('starter', true); renderStarter();
}
function renderStarter() {
  const ids = Object.keys(CARS).filter(k => CARS[k].starter);
  $('starterList').innerHTML = ids.map(k => {
    const c = CARS[k];
    return `<button class="item pick${k === previewId ? ' on' : ''}" data-car="${k}"><div class="item-main"><div class="label dim">${c.brand} · ${c.cls}</div><h3>${c.name}</h3>${carStats(c)}</div></button>`;
  }).join('');
  $('starterGo').textContent = `Drive the ${CARS[previewId].name}`;
}
$('starterList').addEventListener('click', e => {
  const b = e.target.closest('[data-car]'); if (!b || b.dataset.car === previewId) return;
  previewId = b.dataset.car; applyCar(); renderStarter();
});
$('starterGo').addEventListener('click', () => {
  save.cars[previewId] = newCar(START_PAINT[previewId]); save.current = previewId; persist();
  state.showroom = false; show('starter', false); camInit = false; applyCar(); startWith(state.startMode);
});
const needStarter = () => !save.current;
$('startTilt').addEventListener('click', () => needStarter() ? openStarter('tilt') : startWith('tilt'));
$('startTouch').addEventListener('click', () => needStarter() ? openStarter('touch') : startWith('touch'));
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
  $('pausePlace').textContent = hud.place || 'Terminal Island'; updateMenu();
  $('pCash').textContent = money(save.cash); $('pFuel').textContent = Math.ceil(fuel.level * 100) + '%'; $('pCharges').textContent = `${fuel.charges} of 6`;
  show('pause', true);
}
function resume() { show('live', false); show('pause', false); show('map', false); show('eventCard', false); show('shop', false); show('fuel', false); clearInterval(fuelTimer); state.mapOpen = false; state.paused = false; controls.clear(); audio.resume(); }
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
$('pGfx').addEventListener('click', () => { quality = (quality + 2) % 3; applyQuality(); updateMenu(); });
function updateMenu() {
  $('pGears').textContent = 'Gears: ' + (car.auto ? 'automatic' : 'manual');
  $('pMode').textContent = 'Controls: ' + (controls.mode === 'tilt' ? 'tilt' : 'buttons');
  $('pInvert').textContent = 'Tilt to accelerate: ' + (controls.invert ? 'toward you' : 'away from you');
  $('pSound').textContent = 'Sound: ' + (muted ? 'off' : 'on');
  $('pGfx').textContent = 'Graphics: ' + GFX[quality];
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
  drawMap(bctx, big.width, big.height, 0, 0, big.width / 3700, [0, -1], car, true, dpr * clamp(px / 520, 0.6, 1.1), marks());
  show('map', true); state.mapOpen = true;
}
$('pMap').addEventListener('click', openMap); $('mini').addEventListener('click', openMap);
$('mapClose').addEventListener('click', resume);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('keydown', e => {
  if (!$('results').hidden || (e.target && e.target.tagName === 'INPUT')) return;
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
    $('pRestart').hidden = $('pLeave').hidden = !on; $('pGarage').hidden = on;
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
    $('resRetry').hidden = !!r.live;
    $('resPills').innerHTML = r.pills.map(p => `<span class="pill" style="--c:${r.color || '#BF0003'}">${p}</span>`).join('');
    ui.modal('results');
  }
};
const race = new Race({ scene, T, car, model, hud, controls, audio, ui });

/* ---------------- live races against a friend ---------------- */
const live = new Live({ onMsg: liveMsg, onStatus: liveStatus });
race.net = live;
let lvState = 'idle';
const myName = () => (save.name || 'Driver');
function hello() {
  const L = looks(save.current);
  live.send({ t: 'hello', name: myName(), car: { spec: car.spec, paint: L.paint, glow: L.glow, opts: modelOpts(L) } });
}
function renderLive(msg) {
  const host = live.role === 'host', on = live.connected, f = live.friend;
  $('lvStart').hidden = lvState !== 'idle' && lvState !== 'error';
  $('lvCode').hidden = !(host && lvState === 'waiting'); $('lvCode').textContent = live.code;
  $('lvLeave').hidden = lvState === 'idle' || lvState === 'error';
  $('lvEvents').hidden = !(host && on && f);
  $('lvTitle').textContent = on && f ? `Connected to ${f.name}` : lvState === 'waiting' ? 'Your room code' : lvState === 'joining' ? `Joining ${live.code}` : 'Race a friend';
  $('lvText').textContent = msg || (on && f ? (host ? 'Pick a race. You will both be taken to the start line.' : `Waiting for ${f.name} to pick a race.`)
    : lvState === 'waiting' ? 'Tell your friend this code. They tap Race a friend, then Join.'
    : lvState === 'joining' || lvState === 'connected' ? 'Connecting…'
    : 'Race a friend on their own phone. One of you hosts and gets a room code, the other types it in. Live races pay no prize money.');
  $('lvEvents').innerHTML = LIVE_EVENTS.map(id => { const ev = EVENTS.find(e => e.id === id); return `<button class="chip" data-ev="${id}" style="border-color:${TYPES[ev.type].color}">${ev.name} · ${TYPES[ev.type].label}</button>`; }).join('');
}
function liveStatus(st, info) {
  if (st === 'error') { lvState = 'error'; live.close(); renderLive(info); return; }
  if (st === 'closed') {
    lvState = 'idle';
    if (race.active && race.active.live) { race.onNet({ t: 'leave' }); }
    hud.say('Your friend disconnected', 3000); renderLive(); return;
  }
  lvState = st;
  if (st === 'connected') hello();
  renderLive();
}
function liveMsg(d) {
  if (d.t === 'hello') renderLive();
  if (d.t === 'start') startLive(d.ev);
  race.onNet(d);
}
function startLive(id) {
  if (!live.friend) return;
  ['live', 'pause', 'results', 'eventCard', 'shop', 'map', 'fuel'].forEach(o => show(o, false));
  if (race.active) race.cleanup();
  race.start(liveEvent(id, live.friend)); resume();
}
$('pLive').addEventListener('click', () => {
  show('pause', false); ui.modal('live'); $('lvName').value = save.name || '';
  if (live.connected) hello(); renderLive();
});
$('lvName').addEventListener('change', () => { save.name = $('lvName').value.trim().slice(0, 14) || null; persist(); });
$('lvHost').addEventListener('click', () => { $('lvName').dispatchEvent(new Event('change')); lvState = 'joining'; renderLive('Getting a room code…'); live.host(); });
$('lvJoin').addEventListener('click', () => {
  const code = $('lvCodeIn').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { renderLive('Room codes are four letters.'); return; }
  $('lvName').dispatchEvent(new Event('change')); live.join(code);
});
$('lvEvents').addEventListener('click', e => {
  const b = e.target.closest('[data-ev]'); if (!b || !live.connected) return;
  live.send({ t: 'start', ev: b.dataset.ev }); startLive(b.dataset.ev);
});
$('lvLeave').addEventListener('click', () => { live.close(); lvState = 'idle'; renderLive(); });
$('lvClose').addEventListener('click', resume);
$('evStart').addEventListener('click', () => {
  if (fuel.empty) { show('eventCard', false); hud.say('Your tank is empty'); openFuel(); return; }
  show('eventCard', false); race.start(); resume();
});
$('evSkip').addEventListener('click', () => { show('eventCard', false); resume(); });
$('resDone').addEventListener('click', () => { show('results', false); race.leave(); resume(); });
$('resRetry').addEventListener('click', () => { show('results', false); race.restart(); resume(); });

/* ---------------- shops, garage and fuel ---------------- */
const fuel = new Fuel(msg => hud.say(msg, 3600));
const shops = new Shops({ onChange: applyCar, say: msg => hud.say(msg) });
const doors = buildShopDoors(scene, T);
let nearShop = null, fuelPrompted = false, fuelTimer = 0, fuelHud = 0;
function setRumours() {
  hud.defaultTicker = [...hud.baseTicker, ...SHOPS.filter(s => !save.found[s.id]).map(s => s.rumour)];
  if (!race.active) hud.setTicker(hud.defaultTicker);
}
hud.baseTicker = hud.defaultTicker; setRumours();
function shopMarks() { return SHOPS.filter(s => save.found[s.id]).map(s => ({ x: s.x, z: s.z, c: '#249689' })); }
function marks() { return race.active ? race.marks() : [...race.marks(), ...shopMarks()]; }
function checkShops() {
  for (const s of SHOPS) {
    const d = Math.hypot(car.x - s.x, car.z - s.z);
    if (!save.found[s.id] && d < 45) { save.found[s.id] = true; persist(); hud.say(`Found ${s.name}: ${s.label.toLowerCase()}`, 4000); audio.blip(660, 0.2, 'sine', 0.08); setRumours(); }
    if (nearShop === s && d > 12) nearShop = null;
    if (!nearShop && d < 6 && car.kmh < 40) {
      nearShop = s; car.vx = car.vz = 0; refreshFL();
      ui.modal('shop'); shops.show(s);
    }
  }
}
$('shopClose').addEventListener('click', resume);
$('pClubs').addEventListener('click', () => { show('pause', false); ui.modal('shop'); shops.show({ kind: 'clubs', label: 'Clubs', name: 'Street clubs', html: clubsHtml }); });
$('pGarage').addEventListener('click', () => { show('pause', false); ui.modal('shop'); shops.show({ kind: 'garage', label: 'Garage', name: 'Your cars' }); });
function renderFuel() {
  const lv = fuel.level, ch = fuel.charges, cost = fuel.boostCost();
  $('fuelTitle').textContent = fuel.empty ? 'Your tank is empty' : fuel.refilling ? 'Refilling' : lv >= 1 ? 'Tank full' : 'Fuel';
  $('fTank').textContent = Math.ceil(lv * 100) + '%'; $('fCharges').textContent = `${ch} of 6`;
  $('fPips').innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < ch ? 'on' : ''}"></i>`).join('');
  $('fText').textContent = fuel.refilling ? `The synthesizer will fill your tank in ${fmtLeft(fuel.msLeft)}.`
    : fuel.empty ? 'Start the synthesizer to refill over 4 hours, or boost it to drive again now.'
    : `About ${Math.max(1, Math.round(lv * 15))} minutes of driving left.`;
  $('fStart').hidden = fuel.refilling || lv >= 1; $('fStart').disabled = ch < 1;
  $('fBoost').hidden = lv >= 1 && !fuel.refilling; $('fBoost').disabled = ch < cost;
  $('fBoost').textContent = `Boost now · ${cost} charge${cost > 1 ? 's' : ''}`;
}
function openFuel() { show('pause', false); ui.modal('fuel'); renderFuel(); clearInterval(fuelTimer); fuelTimer = setInterval(renderFuel, 1000); }
$('pFuelBtn').addEventListener('click', openFuel);
$('fStart').addEventListener('click', () => { if (fuel.startRefill()) hud.say('Synthesizer running'); renderFuel(); });
$('fBoost').addEventListener('click', () => { if (fuel.boost()) { hud.say('Tank full'); fuelPrompted = false; } renderFuel(); });
$('fClose').addEventListener('click', resume);

/* ---------------- main loop ---------------- */
let last = performance.now(), place = '', speedFx = 0;
const tmp = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const live = state.running && !state.paused;
  const raw = controls.update(dt);
  const inp = live && race.active ? race.input(raw, dt) : raw;
  fuel.tick(dt, live);
  // out of fuel: the engine cuts, except mid-race where you are allowed to finish
  if (fuel.empty && !race.active) {
    inp.throttle = 0; inp.nos = false;
    if (live && !fuelPrompted && car.kmh < 3) { fuelPrompted = true; openFuel(); }
  } else if (!fuel.empty) fuelPrompted = false;
  if (live) {
    while (controls.shifts.length) {
      const d = controls.shifts.shift(), ratio = car.rpm / car.spec.redline;
      if (car.shift(d)) { audio.blip(d > 0 ? 520 : 380, 0.06, 'square', 0.05); race.onShift(d, ratio); }
    }
    car.offroad = !onRoad(car.x, car.z);
    for (let s = 0; s < 2; s++) {
      car.step(dt / 2, inp, race.locked);
      const hit = collide(car, 1.7);
      if (hit) { refreshFL(); if (hit > 3) { car.hit(hit); audio.thump(hit); barrierNote(); race.onHit(hit); navigator.vibrate && hit > 8 && navigator.vibrate(20); } }
    }
    stepTraffic(dt);
    race.update(dt);
    if (!race.active) { race.checkMarkers(car); checkShops(); }
  } else controls.shifts.length = 0;
  streamer.update(car.x, car.z, spawnTraffic, dropTraffic);
  syncModel(model, car, live ? dt : 0);
  trails.update(model, car, live && quality >= 1);
  // speed streaks at the edge of the screen
  const sfx = clamp((car.kmh - 130) / 110, 0, 0.7) + (car.nos && live ? 0.3 : 0);
  if (Math.abs(sfx - speedFx) > 0.02) { speedFx = sfx; $('speedfx').style.opacity = sfx.toFixed(2); }
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
  if (state.showroom) {
    const a = now / 4000;
    camera.position.set(car.x + Math.sin(a) * 6.5, 1.9, car.z + Math.cos(a) * 6.5); camera.lookAt(car.x, 0.7, car.z);
  }
  const fov = (tall ? 74 : 62) + clamp(v / car.spec.top, 0, 1) * (tall ? 12 : 14) + (car.nos ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4)); camera.updateProjectionMatrix(); }

  // blinking red beacons on towers and cranes
  blink += dt;
  const on = (blink % 1.6) < 0.8;
  for (const g of streamer.loaded.values()) if (g.userData.reds) g.userData.reds.visible = on;

  if (state.running) {
    hud.update(car, dt, marks()); hud.steer(-inp.steer);
    fuelHud -= dt;
    if (fuelHud <= 0) { fuelHud = 0.5; hud.fuel(fuel.level); }
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
  if (window.__cam) { camera.position.copy(window.__cam.p); camera.lookAt(window.__cam.t); camera.fov = window.__cam.fov || 40; camera.updateProjectionMatrix(); }
  wet.update();
  if (composer && quality >= 2) composer.render(); else renderer.render(scene, camera);
}
applyQuality(); resize();
requestAnimationFrame(frame);
window.__ti = { live, scene, T, camera, THREE, car, state, controls, streamer, traffic, race, fuel, save, shops, get model() { return model; } };

import { D } from './data.js';
// Player progress, kept on the phone for now. Later this moves to TIC's Supabase.
const KEY = 'ti.save.v2';
export const newCar = paint => ({ paint, glow: '#FF2A10', rims: null, spoiler: null, scoop: null, stripe: null,
  vinyl: null, vinylColor: '#FFC400', decals: false, tune: { height: 0, camber: 0, final: 0, lock: 0 },
  parts: { engine: 0, turbo: 0, gearbox: 0, tyres: 0, nitrous: 0, weight: 0 } });
const fresh = () => ({ cash: D.fuel.startCash, wins: {}, best: {}, found: {}, clubs: {}, current: null, cars: {},
  fuel: { level: 1, refillAt: null, refillStart: null, charges: 6, day: '' } });

export const save = (() => {
  const f = fresh();
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { s = {}; }
  // fill in anything an older save is missing
  s = { ...f, ...s, fuel: { ...f.fuel, ...(s.fuel || {}) }, cars: s.cars || {} };
  for (const c of Object.values(s.cars)) { const n = newCar(c.paint); c.parts = { ...n.parts, ...(c.parts || {}) }; c.tune = { ...n.tune, ...(c.tune || {}) }; for (const k of ['vinyl', 'vinylColor', 'decals']) if (!(k in c)) c[k] = n[k]; }
  if (!s.cars[s.current]) s.current = Object.keys(s.cars)[0] || null;
  return s;
})();

export const START_PAINT = Object.fromEntries(Object.entries(D.cars.cars).map(([id, c]) => [id, c.paint]));

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
}

export const money = n => '$' + Math.round(n).toLocaleString('en-US');

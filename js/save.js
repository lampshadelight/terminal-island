// Player progress, kept on the phone for now. Later this moves to TIC's Supabase.
const KEY = 'ti.save.v1';
export const newCar = paint => ({ paint, glow: '#FF2A10', rims: null, spoiler: null, scoop: null, stripe: null,
  parts: { engine: 0, turbo: 0, gearbox: 0, tyres: 0, nitrous: 0, weight: 0 } });
const fresh = () => ({ cash: 1500, wins: {}, best: {}, found: {}, current: 'zephyr', cars: { zephyr: newCar('#BF0003') },
  fuel: { level: 1, refillAt: null, refillStart: null, charges: 6, day: '' } });

export const save = (() => {
  const f = fresh();
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { s = {}; }
  // fill in anything an older save is missing
  s = { ...f, ...s, fuel: { ...f.fuel, ...(s.fuel || {}) }, cars: s.cars && Object.keys(s.cars).length ? s.cars : f.cars };
  for (const c of Object.values(s.cars)) c.parts = { ...newCar().parts, ...(c.parts || {}) };
  if (!s.cars[s.current]) s.current = Object.keys(s.cars)[0];
  return s;
})();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
}

export const money = n => '$' + Math.round(n).toLocaleString('en-US');

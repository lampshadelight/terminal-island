// Player progress, kept on the phone for now. Later this moves to TIC's Supabase.
const KEY = 'ti.save.v1';
const fresh = () => ({ cash: 1500, wins: {}, best: {} });

export const save = (() => {
  let s;
  try { s = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { s = fresh(); }
  return s;
})();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
}

export const money = n => '$' + Math.round(n).toLocaleString('en-US');

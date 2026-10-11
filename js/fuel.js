import { save, persist } from './save.js';
import { D } from './data.js';

/* ------------------------------------------------------------------
   The ethanol synthesizer. A full tank lasts 15 minutes of driving.
   Refilling takes 4 hours and uses 1 electricity charge; boosting the
   synthesizer to refill now costs double (2 charges). You get 6 charges
   a day. Stored on the phone for now; TIC's Supabase later.
   ------------------------------------------------------------------ */
export const TANK_SECONDS = D.fuel.tankMinutes * 60;
export const REFILL_MS = D.fuel.refillHours * 3600 * 1000;
export const DAILY_CHARGES = D.fuel.dailyCharges;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export class Fuel {
  constructor(say) { this.f = save.fuel; this.say = say; this.saveT = 0; this.warned = this.f.level <= 0.1 ? 2 : this.f.level <= 0.2 ? 1 : 0; this.tick(0, false); }
  get level() { return this.f.level; }
  get empty() { return this.f.level <= 0; }
  get charges() { return this.f.charges; }
  get refilling() { return !!this.f.refillAt; }
  get msLeft() { return this.f.refillAt ? Math.max(0, this.f.refillAt - Date.now()) : 0; }
  tick(dt, driving) {
    const f = this.f, d = today();
    if (f.day !== d) { f.day = d; f.charges = DAILY_CHARGES; persist(); }
    if (f.refillAt && Date.now() >= f.refillAt) { f.level = 1; f.refillAt = f.refillStart = null; this.warned = 0; persist(); this.say('The synthesizer has filled your tank'); }
    if (driving && f.level > 0) {
      f.level = Math.max(0, f.level - dt / TANK_SECONDS);
      if (f.level <= 0.2 && this.warned < 1) { this.warned = 1; this.say('Fuel low: 3 minutes left'); }
      if (f.level <= 0.1 && this.warned < 2) { this.warned = 2; this.say('Fuel very low'); }
      this.saveT += dt; if (this.saveT > 5 || f.level === 0) { this.saveT = 0; persist(); }
    }
  }
  startRefill() {
    const f = this.f;
    if (f.refillAt || f.level >= 1) return false;
    if (f.charges < 1) { this.say('No charges left today'); return false; }
    f.charges -= 1; f.refillStart = Date.now(); f.refillAt = f.refillStart + REFILL_MS; persist(); return true;
  }
  // refill right now: double the electricity, so 2 charges (1 more if a refill is already running)
  boostCost() { return this.f.refillAt ? 1 : D.fuel.boostCost; }
  boost() {
    const f = this.f, cost = this.boostCost();
    if (f.level >= 1 && !f.refillAt) return false;
    if (f.charges < cost) { this.say('Not enough charges left today'); return false; }
    f.charges -= cost; f.level = 1; f.refillAt = f.refillStart = null; this.warned = 0; persist(); return true;
  }
}

export const fmtLeft = ms => { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };

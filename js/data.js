/* All game data (map, cars, shops, races, fuel rules) lives in plain JSON
   files under data/, so a future engine version can load the same files. */
const load = name => fetch(new URL(`../data/${name}.json`, import.meta.url)).then(r => r.json());
const [world, cars, garage, fuel, events] = await Promise.all(['world', 'cars', 'garage', 'fuel', 'events'].map(load));
export const D = { world, cars, garage, fuel, events };

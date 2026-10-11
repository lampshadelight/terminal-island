# Terminal Island

A night-time street racing game for phones, built for The Induction Club (TIC).
Open world, tilt steering, manual gears. All cars, brands and places are original.

Play: https://lampshadelight.github.io/terminal-island/

## Controls
- **Tilt:** hold the phone sideways and turn it like a steering wheel. Tip the top away from you to accelerate, toward you to brake.
- **Left side:** shift up / shift down.
- **Right side:** NOS and drift (handbrake).
- **Keyboard:** WASD or arrows, E/Q to shift, Shift for NOS, Space to drift, P to pause, M for the map.

## What's in it
- **Terminal Island:** a natural island with a coast road, the Ridge Road over the hills, the town of Neon Row, the Dockside port and the Old Terminal airfield. Grass off the road slows you down. Roads to the Foundry, Highcliff and the Causeway stop at construction barriers.
- **Races:** drive into a glowing marker. Circuit (Neon Loop), drift (Harbour Drift), drag (Quay Quarter) and roll (Runway Roll). Drag and roll are played in portrait: keep the phone level, and the level zone shrinks as you go faster.
- **Shops:** a car dealer, performance parts, paint, body kits and accessories, hidden around the island. They appear on the map once you find them.
- **Fuel:** a tank lasts 15 minutes of driving. The synthesizer refills it in 4 hours for 1 charge, or right away for 2. You get 6 charges a day. Saved on the phone for now.

## Cars
Every car is an original design inspired by a real street car, with invented brands and no real badges.
- Starters (pick one): Hikari Kaze (180SX-inspired), Tachi Hornet (Civic), Mazura Vortex (RX-8), Brauer Dreier (E36), Kagero Ronin (AE86)
- At the dealer: Sanko Solstice (Eclipse), Hikari Zephyr (Skyline R34), Brannock Vandal (Mustang), Ravelle Strix (mid-engine exotic)

## Tuning, clubs and live races
- Torque Works has a dyno (power and torque curves) and tuning sliders: ride height, camber, final drive and steering lock.
- Spectra Paint sells vinyls (flames, side band, speed slashes, splatter, checker) in seven colours, plus invented sponsor decals.
- Three street clubs, each with a boss race that appears once you win its qualifying events: The Kings (Neon Row circuit), Harbour Drift Union (drift) and Runway Syndicate (760 m drag). See Pause > Clubs.
- Pause > Race a friend: one phone hosts and shows a four letter code, the other joins with it. The phones connect directly through the free PeerJS service. Live races pay no prize money.

## Graphics
Wet streets that reflect the city, glow around lights (High), light trails and speed streaks. Pause menu → Graphics switches Low / Medium / High.

## Code
Game data lives in plain JSON under `data/` (island layout, cars, shops and prices, races and clubs, fuel rules), so an engine version (Unity or Godot) can load the same files later.

- `js/data.js` loads the JSON files
Plain JavaScript modules and three.js, no build step.
- `js/world.js` the island: coast, curved roads, town, port, airfield, trees, hills and collision
- `js/car.js` car list and driving model
- `js/carmodel.js` car body shapes
- `js/fx.js` wet roads, glow and light trails
- `js/controls.js` tilt, touch and keyboard
- `js/hud.js` dashboard and maps
- `js/race.js` race events, rivals and the portrait balance mode
- `js/garage.js` shops, upgrades, tuning, dyno and the garage
- `js/livery.js` vinyls and sponsor decals
- `js/live.js` live races against a friend
- `js/fuel.js` fuel tank and daily charges
- `js/save.js` progress saved on the phone
- `js/main.js` game loop and menus

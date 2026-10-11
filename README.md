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
- **Terminal Island:** Neon Row, Dockside and Old Terminal, joined by tunnels. The Foundry, Highcliff and the Causeway are under construction.
- **Races:** drive into a glowing marker. Circuit (Neon Loop), drift (Harbour Drift), drag (Quay Quarter) and roll (Runway Roll). Drag and roll are played in portrait: keep the phone level, and the level zone shrinks as you go faster.
- **Shops:** a car dealer, performance parts, paint, body kits and accessories, hidden around the island. They appear on the map once you find them.
- **Fuel:** a tank lasts 15 minutes of driving. The synthesizer refills it in 4 hours for 1 charge, or right away for 2. You get 6 charges a day. Saved on the phone for now.

## Cars
Every car is an original design inspired by a real street car, with invented brands and no real badges.
- Starters (pick one): Hikari Kaze (180SX-inspired), Tachi Hornet (Civic), Mazura Vortex (RX-8), Brauer Dreier (E36), Sanko Solstice (Eclipse)
- At the dealer: Hikari Zephyr (Skyline R34), Brannock Vandal (Mustang), Ravelle Strix (mid-engine exotic)

## Graphics
Wet streets that reflect the city, glow around lights (High), light trails and speed streaks. Pause menu → Graphics switches Low / Medium / High.

## Code
Plain JavaScript modules and three.js, no build step.
- `js/world.js` island layout, districts, tunnels, collision, streaming
- `js/car.js` car list and driving model
- `js/carmodel.js` car body shapes
- `js/fx.js` wet roads, glow and light trails
- `js/controls.js` tilt, touch and keyboard
- `js/hud.js` dashboard and maps
- `js/race.js` race events, rivals and the portrait balance mode
- `js/garage.js` shops, upgrades and the garage
- `js/fuel.js` fuel tank and daily charges
- `js/save.js` progress saved on the phone
- `js/main.js` game loop and menus

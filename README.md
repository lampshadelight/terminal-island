# Terminal Island

A night-time street racing game for phones, built for The Induction Club (TIC).
Open world, tilt steering, manual gears. All cars, brands and places are original.

Play: https://lampshadelight.github.io/terminal-island/

## Controls
- **Tilt:** hold the phone sideways and turn it like a steering wheel. Tip the top away from you to accelerate, toward you to brake.
- **Left side:** shift up / shift down.
- **Right side:** NOS and drift (handbrake).
- **Keyboard:** WASD or arrows, E/Q to shift, Shift for NOS, Space to drift, P to pause, M for the map.

## Code
Plain JavaScript modules and three.js, no build step.
- `js/world.js` island layout, districts, tunnels, collision, streaming
- `js/car.js` cars and driving model
- `js/controls.js` tilt, touch and keyboard
- `js/hud.js` dashboard and maps
- `js/main.js` game loop and menus

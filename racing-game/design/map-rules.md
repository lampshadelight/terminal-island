# Map rules: sealed roads, junctions and off-road

Status: draft for Hass, 22 Oct 2026. Covers the north island (export v42). Built from Hass's notes in "Map rules and road audit". Values marked **TBC** need Hass's call.

The rules are checked by `map-index/audit_roads.py`, which reads the export and writes `map-index/map-index-v42.json`. The map itself is not edited.

## 1. Speeds and grip

- **Grip for sealed roads: μ = 0.8** (wet). Hass set this and will fine tune it later.
- **Speeds are what the car can reach**, not class labels. A highway may carry 330 km/h. The car tops out at 440 km/h (speed3 model).
- **Target speed per road (Hass, 22 Oct):** 400 km/h for the island expressway (the M1/M2 ring: Bayline, Corniche, Sea Wall Viaduct, Dockside Quay, East Sea Wall) and for every road with a tunnel section (Neon Row Bypass, Bayline and Corniche tunnels, Terminal Link). Every other road is 150 km/h. The 400 km/h roads use metal banks on their near-vertical corners. Airside roads and slip roads are on the 150 km/h rule for now (**TBC**: airside may need its own value).
- **Corner speed cap** for a corner with radius R and bank θ: v = √(gR·(tanθ + μ) / (1 − μ·tanθ)).

## 2. Banking

- **Bank needed** to hold speed v at radius R: tanθ = (A − μ) / (1 + μA), where A = v²/(gR). Zero if A ≤ μ.
- **Grip-only limit:** with μ = 0.8, the bank needed never passes 51.3°, whatever the speed. Steeper banks are only needed if you want a car to ride the bank with no grip.
- **Steep bank (45° or more):** noted in the index as a steep bank. These are the near-vertical banks Hass wants to flag. Each one gets a metal bank (hot-wheels style) attached to the road edge, with the edge, side and wall edits that go with it.
- **Short bank:** actual bank more than 2° under need, or a speed cap under 90% of the target. Fix by raising the bank, widening, or lowering the target for that road.
- **Speed bands** (in every corner record, `bank_needed_by_kmh`): bank needed at 100, 150, 200, 250, 330 and 400 km/h. Use these to set per-road targets.
- **Bank sign:** "inside" is the side the corner centre is on. Bank is measured as inside edge height minus outside edge height. The sign convention still needs a check against a known banked road before it is trusted.

## 3. Widths

- Highways: 16 m or more (existing export rule). Main: 9 m (**TBC**). Minor: 7 m (**TBC**).
- Widening: where a corner's speed cap is short and bank cannot fix it, widen the road on the inside first.

## 4. Joins and junctions

- **Joints:** where roads end at one point, the ends share one cross section. A turn of more than 15° in one step needs the "drive slowly" treatment (the export already marks three of these).
- **Taper:** a road that narrows at a join narrows at 1:8, not in one step.
- **Flares (junction corners):** the flare corner speed must be at least 80% of the slowest approach target. Below that, the flare radius needs to grow.
- **Junction style:** the approved geometric junctions. Guide line for every way through, cat's-eyes every 3 m, white stripes on paving no line uses. No traffic lights, stop lines or give-way lines anywhere on the network (Hass, the network is a race track).
- **Lane lines:** merges must join the right lane to the right lane, and the left to the left. Checked by hand against junction paint for now. A machine check is future work.
- **Lessons:** the junction-template and junction-design rules in `design/junction-templates/` and the junction design lessons still apply. Sketch every junction, check each level separately, and do not place cushions or barriers unless a hard nose needs them.

## 5. Surfaces

Sealed road, dirt, sand, wet sand, rock, loose rock, grass and snow. The export's `surface.u8` already has codes for these, with 0 no-go. Each surface needs its grip value (**TBC**, off-road grip is not set yet).

## 6. Off road

- **Trails:** two types. **Explore** trails keep at least one lane width of clear space. **Race** trails are for racing. A trail can mix both.
- **Barriers:** bushes, rocks, mud, ice and snow can stop low 4WDs. Trees, rocks and other immovable objects are walls.
- **Maze areas:** the land inside the road loop becomes either decoration (immovable objects) or an off-road maze for exploration. Entrances are hidden. The maze walls are the immovable objects above.
- **Leaving the road:** a car facing the road and accelerating towards it rolls out. Otherwise it uses reverse to get out of a tight spot and face the road.
- **Accessible and inaccessible areas:** at the border, events depend on the cross section.
  - Change in slope: the car slides off.
  - Mud, sand, rock and similar: the car stops.
  - Tops of buildings and immovable objects or landscapes that should not be reachable: zero friction, so the car carries on in the direction it was going.
- **Guard rails:** only stop a car coming from off road onto the road. They keep cars from leaving the track. The ping-pong between rails still needs a fix.
- **Edge physics** for sliding off the road, on road and off road, stays as it is.
- **Off-road banks and walls:** the same steep-bank and metal-bank rules apply to off-road edges, with off-road grip (TBC).

## 7. Open items

- Confirm the expressway list and whether airside and slip roads stay at 150 km/h.
- Main and minor widths, and off-road grip values (Hass).
- Sign check of the bank convention.
- Trail audit: the trail index is not built yet. It needs trail widths and clearance checks.

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
- **Bank sign (fixed 22 Oct):** bank is positive when the outside edge is higher than the inside edge, the way a real corner is banked. The earlier audit had this backwards, so its speed caps were slightly off. The index and exit records are recalculated.

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
- **Minimum trail width (proposed, 23 Oct, for Hass to confirm):** measured clear width, solid to solid, across the centreline.
  - Explore trails and links: at least **4 m** (Hass, 23 Oct; was 3.5 m).
  - Race, time trial, hill climb and circuit trails: at least **7 m**.
  - Nothing solid within **4 m** of a race trail centreline (the 4wd-offroad.md rule). This already gives an 8 m corridor.
- **v43 finding:** every trail is carved at 5.5 m (`width_m` in trails.json). That is under the 7 m race width. Built cells (buildings, fences, piers, zone 1) are within 4 m of many points on T7, T8, T14, L1 and L4. The count uses an 8 m grid and zone 1 is grown by 6 m, so it is an upper bound. Full list: `map-index/trail-widths-v43.json`, script `map-index/trail_width_audit.py`.
- **Edge physics** for sliding off the road, on road and off road, stays as it is.
- **Off-road banks and walls:** the same steep-bank and metal-bank rules apply to off-road edges, with off-road grip (TBC).

## 7. Open items

- Confirm whether airside roads stay at 150 km/h (see section 9).
- Expressway gap at c_seafront_e: Hass approved upgrading it to a highway (22 Oct). It is a map change for the export owner, so it is not made in this pass.
- Main and minor widths, and off-road grip values (Hass).
- Sign check of the bank convention.
- Trail audit: the trail index is not built yet. It needs trail widths and clearance checks.

## 8. Steep banks (concrete, no metal attachments)

Hass (24 Oct): metal bank attachments are dropped. Steep banks are made by shaping the concrete road and its structure itself.

- **When one is needed:** a corner needs a steep bank when the bank it needs for the road's target speed is 45° or more. The index flags these as `steep_bank`. On v42 the 400 km/h roads had 16 such corners, needing 45° to 49.5°. Grip can hold all of them under the 51.3° limit.
- **Where:** only on the outside of large turns (60° or more, TBC), never at intersections or mid-road (Hass ruling, 22 Oct).
- **Shape:** the road pivots on its centreline, as section 11 sets out. The outside edge rises and the inside drops, and the whole structure is shaped to match.
- **Entry and exit:** the bank eases in and out at 3° per 10 m (confirmed, 22 Oct), using the flat-then-gentle-curve shape from section 13.
- **Edges:** the outside edge carries a barrier or rail along its top where the drop is. Off-road edges follow the same shape (grip TBC).
- **Audit:** every steep corner is checked against the concrete bank that is in the export. A corner that needs a steep bank but has none is flagged. The old "bank record" approach is superseded.

## 9. Expressway continuity, exits and airside

**Continuity.** The 400 km/h ring must be one unbroken chain. Hass (22 Oct) found a regular road joining two sections. On the v42 export the chain is:
- Bayline (c_bayline) to Corniche (c_corniche) at the south-west end, then Corniche to Marina Parade (c_marina, M4, 20 m) at (4151, 5500).
- Marina to Seafront East (c_seafront_e, minor C, 14 m, 1107 m) at (5972, 5397).
- Seafront East to East Sea Wall (c_seawall_e) and the Neon Row Bypass tunnel at (6505, 4456).
- East Sea Wall to Dockside Quay, then the Sea Wall Viaduct back to Bayline.

**The gap is c_seafront_e.** It is a minor 14 m road between two expressway sections. Hass approved upgrading it to a highway (22 Oct), which makes one 400 km/h chain. This is a map change for the export owner. Marina (M4) is treated as part of the ring here, so confirm that too.

**Exits and slip roads.** Any road that leaves the 400 km/h ring must slow the car first. Braking from 400 km/h at the wet grip figure of 0.8 g needs this much road before the corner:

    brake distance = (400 km/h)² − (corner speed)²) / (2 × 0.8 × 9.81)

- The exit's corner is designed for the speed the car arrives at after braking, not for 400 km/h.
- The expressway needs a braking zone of that length before each exit, with a speed sign.
- The exit's own corner gets the bank that speed needs.

On v42 there are five exits with a corner under 150 m radius:
| Exit | Corner radius | Corner speed (no bank) | Brake zone from 400 km/h |
|---|---|---|---|
| c_harbour_out (a quick right, 4 m after the junction) | 28 m | 53 km/h | about 773 m |
| c_bellavista | 111 m | 106 km/h | about 731 m |
| c_arrivals | 112 m | 107 km/h | about 730 m |
| m_redwater | 115 m | 108 km/h | about 729 m |
| c_yard_back | 29 m | 54 km/h | about 772 m |

The brake zone is 730 to 770 m. Some exits have no road like that before them. These are the first design problems to fix.

**Airside.** Airside roads are the airport's own roads: the runway, taxiways, rapid exits, apron loops and the gymkhana apron. They are closed in free roam. They are not on the public network. They stay at 150 km/h for now. Hass to say whether the runway needs a higher value.

## 10. Exit banks (Hass, 22 Oct; metal attachments dropped 24 Oct)

Hass asked for metal banks on the exits and for each bank to stay clear of other roads and paths. The airport is not changed.

- **Records (superseded for the metal part, 24 Oct):** `map-index/exit-metal-banks.json` still lists the bank angles. The metal-bank flags in it no longer apply; the banks are built into the concrete. Eight records covering the exit corner on five exits. Each is banked for the 150 km/h exit target, rounded up to whole degrees.
- **Footprint rule:** the bank takes 4 m beyond the outer edge, plus 2 m clearance. No other road may be inside that band or within 2 m of it, if its height is within 3 m or it is a tunnel. No trail point may be inside it.
- **Result:** seven of eight records are clear. The one that clashes is c_harbour_out-c01, a 28 m quick right at 43°. Its outer band would cover c_harbour_in, a one-way slip. **Decided (Hass, 22 Oct): move c_harbour_in.** This is a map change for the export owner. The bank stays at 43° and the corner keeps its speed. The c_harbour_out record stays blocked until the move is in the export and the footprint check passes again.
- **Airport:** not checked or changed.

**Recheck, 22 Oct (after the rule above).** Of the seven remaining exit records, only c_bellavista-c07 (85° turn, 78 m from its junction, 36° bank) is a metal bank. c_harbour_out-c01 is dropped as an intersection. The others are not metal banks: c_arrivals-c01 and c_yard_back-c03 are at intersections, and the rest are turns under 60°. Those keep a normal bank only (not metal). Hass to confirm whether ordinary banks on those turns are fine.

## 11. Whole-road banking (Hass, 22 Oct)

Hass asked for banking across the whole road, not just a raised outside edge, so the entire carriageway is banked through each corner.

- **Rule:** each corner's carriageway is tilted across its full width, with the outside edge higher than the inside edge, at the bank needed for the road's target speed (section 2). No flat strip in the middle of the road.
- **Metal banks sit on top:** section 8 still applies. A metal bank is an extra ramp on the outside of a large turn, and it is added to the whole-road bank, not in place of it.
- **Ramp in and out:** the whole-road bank eases in and out at 3° per 10 m, as in section 8.
- **Audit:** at every corner sample the cross-fall across the full width (outside minus inside edge height) must match the bank needed, within 2°. Short = flag. This check is not in the audit yet; the index still uses the edge-height data that is there now.
- **Shape (Hass, 22 Oct, confirmed):** the road pivots on its centreline. The inside edge drops below the centre, and the outside edge rises above it. The centre height stays where the export puts it. The audit should check that the outside rise and the inside drop are about equal, within 2 cm, around each centre sample.

## 12. v46 audit (23 Oct)

- Index rebuilt on export v46: `map-index/map-index-v46.json` (v42 kept for comparison). 83 roads (+8 interchange ramps `c_ix_*`), 974 corners, 135 junctions. Steep-bank corners rose from 49 to 59.
- Trail widths on v46: `map-index/trail-widths-v46.json`. Race and circuit trails now mostly measure 6.5 to 7.0 m, so the earlier 5.5 m carve is gone. L1 (airport link) was flagged by my 8 m grid check, but the heightmap check (widths44.py, cross slope under 25%, within 0.5 m of centre height) puts it at 4.00 m minimum with 0 points under 4 m. The grid check was too coarse, so L1 is fine. The grid check is only used for a rough first pass.
- Open item: the interchange ramps `c_ix_e1`, `e3`, `e4`, `w2`, `w3` and `w4` get the 400 km/h target because they run through the bypass tunnel. The exit braking rule (section 9) may need to apply to them, since they are slip roads. Hass to decide.
- The footprint check (section 10) was run on v42 geometry only. Re-run it before any exit bank is built.

## 13. Road rules (open list, Hass 24 Oct)

Notes only. Nothing in the export has been changed for these. Hass will add more.

1. **Expressway near the spaghetti intersection:** the main ring expressway there is currently wavy. It should have no turns, only gentle bends. Check it against this rule in the next export.
2. **Banking only on high-speed turns.** Low-speed turns get no banking. Speed is judged by the road's target (section 1).
3. **Run-off lanes on turns:** every turn that needs one has a run-off lane on the inside and on the outside. The run-off lane is part of the carriageway for the width audit (section 6).
4. **Banking shape:** a flat section first, then a gentle curve into the bank. Not a flat gradient or a straight ramp. The bank eases in from the flat part, and the same easing happens on the way out. This is an extra condition on the 3° per 10 m ramp rule in section 8.

## 14. Audit scope (Hass, 24 Oct)

The audit covers these, each by its own item name. Nothing is lumped as "furniture".

- **Roads:** centreline, width, banks, grade, joints and dead ends.
- **Junctions:** junction records, flares and their corner speeds.
- **Barricades:** any barrier or barricade standing on or across a road, including old roadside barricades. Hass found some at the pier entrance (24 Oct).
- **Road furniture, by name:**
  - crash barriers and steel barriers
  - crash cushions
  - water-filled barrels
  - signs (speed, direction, warning, event, tunnel)
  - camera posts and gantries
  - chevron boards
  - reflector posts
  - rumble strips
  - kerbs
  - pedestrian crossings
  - bus shelters
  - benches
  - bins
  - fences and gates (including the airport fences, which are not to be changed)
  - rock aprons
  - timber posts (off-road)
  - 4WD ONLY gates
  - painted lines and guide lines

**Why the first audit missed the barricades (24 Oct):** it only read the road, junction, flare and joint data. It never read signage.json, street-furniture.json, the crash attenuator data or places.json, so it could not see objects on the road. Barricades need their own check against the road surface before any audit is called complete.

## 15. Road lights and poles (Hass, 24 Oct)

Notes only. Nothing in the export has been changed for these.

1. **Highways:** road-side lights stand only on highways, and they sit behind barriers. Gantry poles count as road-side lights, so they go behind barriers too.
2. **Urban areas:** road-side lights do not need barriers. They must be completely off the road, outside the carriageway.
3. **Breakable poles:** light poles are breakable. Hitting one slows the car more than a speed sign or a smaller sign does. Exact slow-down values are to be set (TBC).

## 16. Barricade reflectors (Hass, 24 Oct)

Notes only. Barricades need reflectors on them. The exact spec comes later from Hass (TBC). Until then, the audit (section 14) lists every barricade as missing reflectors, and that is not a failure yet.

## 17. Lines, barricade placement and exit signs (Hass, 24 Oct)

Notes only. Nothing in the export has been changed for these.

1. **One standard line style.** Every road uses the same line style, so lines match at intersections. At present the roads use different styles, which is why they don't line up at junctions. The standard style is to be set (TBC).
2. **Barricade placement:** every road-side section at a high-speed turn gets a barricade. At present some are missing completely. Exact placement rules are to be set (TBC).
3. **Exit signs:** exits need street signs at the exit and leading up to it. At present they are not visible.

## 18. Expressway flatness and overpasses (Hass, 24 Oct)

Notes only. Nothing in the export has been changed for these.

1. **Expressways sit flat.** Every expressway road is flat, except through turns. Intersections of expressways are not banked.
2. **Banked turns:** the outer part of a turn is banked. Section 11 applies, with the outside edge rising. The bank still follows the flat-then-gentle-curve shape in section 13.
3. **Overpass for fast banked turns:** where a fast banked turn is needed on an expressway, an overpass is built rather than banking the expressway itself. The overpass follows the banking rules (sections 2, 8, 11 and 13).

## 19. Placeholder buildings and access (Hass, 24 Oct)

Notes only. Do not start until Hass gives the go.

1. **Placeholder buildings for unbuilt places.** Every map point of interest that is not built yet gets a placeholder building, including petrol stations, coffee shops and fast food restaurants. A map icon with no building on the ground is a bug.
2. **Access roads for each placeholder.** Each placeholder building gets its own road and entrance and exit, so it can be reached from the network.
3. **Correct entrances and exits.** Every road entrance and exit to and from a road, a building, or an off-road trail must join correctly, with the trail rules in sections 6 and 14.
4. **Audit.** The audit (section 14) checks that every map icon has a building, and that every building has a working access road.

## 20. Highway design rules (Hass approved, 24 Oct)

Notes only. Nothing in the export has been changed for these.

1. **Transition curves:** a straight eases into a bend gradually, not in one jump into a fixed curve. This pairs with the gentle bank rule (section 13).
2. **Sight distance:** a driver can see far enough ahead to react at the design speed, including over crests and around bends.
3. **Merge and exit lanes:** an on-ramp has an acceleration lane long enough to reach highway speed. An off-ramp has a deceleration lane that starts before the turn.
4. **Exit spacing:** a minimum gap between exits, so merges don't overlap. The minimum is TBC.
5. **Gradients:** highways keep hills to about 4 to 6%, with crests and dips rounded off.
6. **Shoulders:** a hard shoulder about 3 m wide on the outside, and a narrow one about 1 m wide on the inside.
7. **Clear zone:** nothing solid near the road edge unless a barrier protects it.
8. **Barrier ends:** barrier ends are bent away from the road or buried. They are never left blunt facing traffic.
9. **Median barrier:** a continuous barrier separates the two directions of traffic.
10. **Lane width:** about 3.5 m per lane, the same throughout.
11. **Rumble strips:** on the shoulder edges.
12. **Tunnels:** lighting gets gradually brighter or darker at the portals, so the eyes adjust. Walls and lighting stay even inside.
13. **Sign sequence:** advance exit signs at about 2 km, 1 km and 500 m, then a sign at the exit itself.
14. **Three lanes each way (Hass, 24 Oct):** the ring expressway and the tunnels become three lanes in each direction, with a median barrier (rule 9). This changes the width rule in section 3 for expressways, and the median width is TBC.

## 21. Driveway rules (Hass approved, 24 Oct)

Notes only. Nothing in the export has been changed for these.

1. **Clear of junctions:** no driveway close to a junction or on the inside of a fast bend. Keep about 30 m clear in town, and further on fast roads (exact distance TBC).
2. **No highway driveways:** buildings next to an expressway are reached from a side road, never straight off the highway.
3. **Width:** about 3 to 4 m for a house, and 6 to 8 m for a shop or petrol station.
4. **Petrol stations:** separate entry and exit driveways.
5. **Smooth edge:** the kerb drops to the driveway so a car can drive over it, with a small rounded corner where it meets the road.
6. **Gentle slope:** 10 to 15% at most, flat for the first few metres off the road, and no scraping.
7. **Clear view:** nothing tall beside the driveway, so drivers coming out can see traffic.
8. **Car parks:** one-way loops with marked bays and a turning area, so no car has to reverse onto the road.

## 22. Road types, camber, lanes, city, mountain, bridges, surfaces, ends and signs (Hass approved, 24 Oct)

Notes only. Nothing in the export has been changed for these. No runaway lanes (Hass, 24 Oct).

1. **Road templates:** each kind of road has one fixed width and lane count: expressway, main road, city street, mountain road and lane. Every road follows its template.
2. **Camber and drainage:** a slight slope from the centre to the edges, so rain runs off. Puddles collect only where they are meant to.
3. **Lane drops:** when a road goes from three lanes to two, the outside lane tapers away over a long distance. It never just ends.
4. **City streets:** kerbs, footpaths and parking lanes along the sides, all at the same kerb height.
5. **Mountain roads:** passing bays, and barriers wherever there is a drop.
6. **Bridges:** joints line up with the road surface so there is no bump. A solid side wall, and a straight run on and off the bridge.
7. **Surfaces:** set rules for where asphalt, concrete and cobbles go. Each surface keeps the same grip (TBC).
8. **No dead ends:** every road connects back into the network (Hass, 24 Oct, replacing the turning circle rule). The export has six dead ends now: three pier ends, the Resort Bay Promenade start, and the two summit ends (Whitepeak Hill Climb and Cloudline). Each needs a decision: connect it, or keep it as a documented exception (TBC).
9. **Name and number signs:** a road name and route number sign after every junction.

## 23. Later task: pier dockyard (Hass, 24 Oct)

Notes only, for later. The pier area becomes a proper dockyard. The three pier dead ends (c_pier1, c_pier2 and c_pier3) wait for that redesign, so they are not changed now. Section 22, rule 8 still applies once the dockyard is designed.

## 24. Terminal 1 building length (Hass approved, 24 Oct)

Notes only, for when the terminal is rebuilt. The Terminal 1 building should be about 300 to 400 m long. Real terminals run about 300 to 800 m, and Sydney's international terminal is about 600 m. The current game terminal has not been measured.


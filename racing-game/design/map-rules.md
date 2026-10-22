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
- **Edge physics** for sliding off the road, on road and off road, stays as it is.
- **Off-road banks and walls:** the same steep-bank and metal-bank rules apply to off-road edges, with off-road grip (TBC).

## 7. Open items

- Confirm whether airside roads stay at 150 km/h (see section 9).
- Fix the expressway gap at c_seafront_e (section 9). This is a map change, not made in this pass.
- Main and minor widths, and off-road grip values (Hass).
- Sign check of the bank convention.
- Trail audit: the trail index is not built yet. It needs trail widths and clearance checks.

## 8. Metal banks (steep corners)

**Where they go (Hass ruling, 22 Oct):** metal banks go only on the outside of large turns. Never at an intersection, never in the middle of a road. A large turn is 60° of turn or more (TBC). Intersections are any point within 40 m of a junction (TBC).

**When one is needed.** A corner needs a metal bank when the bank it needs to hold the road's target speed is 45° or more. The index marks these as `steep_bank`. On 22 Oct the 400 km/h roads have 16 such corners, needing 45° to 49.5°. The steepest need is still under the 51.3° grip limit, so grip can hold every one. The bank exists so the car can ride the steep part of the corner, not because grip fails. If a future target needs more than 51.3°, the audit flags it for a wall-ride design review.

**Shape.** A separate steel ramp, built on the outside of the corner, that the road surface rises into. Its lower edge sits exactly on the road's outside edge, with no step. It rises at the corner's needed bank and follows the corner's radius. Its top edge is a drop, so it always gets a rail along it (section 4 and the firm rule on edges).

**Entry and exit.** The bank angle ramps up from the road's own cross-fall to the full angle, and back down at the exit. The ramp must not change angle faster than **3° per 10 m** of road (Hass, 22 Oct). The ramp runs at least one road width before the corner's start and after its end.

**Joins.**
- Road edge: the bank's lower edge is the road's outside edge. The road mesh is cut along it, so there is no gap or step (same rule as the road joins in the export README).
- Walls and rails: a steel rail along the top edge. Where the bank is steep, the inside of the road keeps its normal edge or barrier. No invisible walls.
- Off road: the same shape and joins apply to off-road edges (Hass, 22 Oct). Grip for those is TBC.

**Adding them to the map.** A bank is an edit to the road's outside edge. It is not a new road. The exporter takes each `steep_bank` corner and writes a bank record: road id, start and end distance, side, maximum angle, ramp length and rail on or off. The Unity side builds the ramp and rail from that record. Nothing else on the road moves.

**How the audit checks them.**
1. Every `steep_bank` corner has a bank record. Missing = error.
2. The bank's maximum angle is at least the bank needed at the road's target. Short = error.
3. The ramp's angle change rate is within the TBC limit. Too fast = error.
4. The ramp runs at least one road width past each end of the corner. Short = error.
5. The top edge has a rail. Missing = error.
6. Any bank needing more than 51.3° is flagged for design review.

**Status.** The current export has no metal bank records. The audit lists the 16 steep corners as the work to do, and the checks above are written but not yet run against any records.

## 9. Expressway continuity, exits and airside

**Continuity.** The 400 km/h ring must be one unbroken chain. Hass (22 Oct) found a regular road joining two sections. On the v42 export the chain is:
- Bayline (c_bayline) to Corniche (c_corniche) at the south-west end, then Corniche to Marina Parade (c_marina, M4, 20 m) at (4151, 5500).
- Marina to Seafront East (c_seafront_e, minor C, 14 m, 1107 m) at (5972, 5397).
- Seafront East to East Sea Wall (c_seawall_e) and the Neon Row Bypass tunnel at (6505, 4456).
- East Sea Wall to Dockside Quay, then the Sea Wall Viaduct back to Bayline.

**The gap is c_seafront_e.** It is a minor 14 m road between two expressway sections. Two fixes, both map changes for the export owner: upgrade it to a 16 m highway (preferred, one 400 km/h chain), or put a new highway section in its place. Marina (M4) is treated as part of the ring here, so confirm that too.

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

## 10. Exit metal banks (Hass, 22 Oct)

Hass asked for metal banks on the exits and for each bank to stay clear of other roads and paths. The airport is not changed.

- **Records:** `map-index/exit-metal-banks.json`. Eight records covering the exit corner on five exits. Each is banked for the 150 km/h exit target, rounded up to whole degrees.
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


import json, math, sys
from collections import Counter
EXP = '/mnt/project-files/racing-game/concepts/north-island/race-map/final/unity-export/'
G = 9.81
MU = 0.8               # wet sealed grip (Hass: set to 0.8, fine tune later)
TOP = 440.0            # speed3 top car, km/h
CORNER_R = 200.0       # samples with radius under this are corner samples
STRAIGHT_R = 500.0     # samples at or over this count as straight for a road's top speed
STEEP = 45.0           # near-vertical bank: note for the metal bank
BANK_MAX_GRIP = math.degrees(math.atan(1/MU))   # 51.3: no bank needed beyond this, grip is enough

d = json.load(open(EXP + 'roads.json'))
nums = json.load(open(EXP + 'road-numbers.json'))
flares = json.load(open(EXP + 'junction-flares.json'))
cls = {r['road']: r for r in nums['roads']}
EXPRESS = {'c_bayline', 'c_corniche', 'c_seawall_n', 'c_dock_quay', 'c_seawall_e'}  # M1/M2 ring highways around the island

def circum(p, q, r):
    ax, ay = p; bx, by = q; cx, cy = r
    dd = 2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by))
    if abs(dd) < 1e-9: return None
    ux = ((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/dd
    uy = ((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/dd
    return ux, uy

def cap_kmh(R, bank_deg):
    if R is None: return TOP
    t = math.tan(math.radians(bank_deg))
    if 1-MU*t <= 0: return TOP
    v = math.sqrt(G*R*(t+MU)/(1-MU*t))*3.6
    return min(TOP, v)

def bank_needed(v_kmh, R):
    v = v_kmh/3.6; A = v*v/(G*R)
    if A <= MU: return 0.0
    return math.degrees(math.atan((A-MU)/(1+MU*A)))

index = {'version': d['version'], 'source': 'unity-export roads.json, road-numbers.json, junction-flares.json',
         'assumptions': {'mu_wet': MU, 'car_top_kmh': TOP, 'corner_radius_m': CORNER_R, 'straight_radius_m': STRAIGHT_R,
                         'steep_bank_deg': STEEP, 'grip_only_bank_limit_deg': round(BANK_MAX_GRIP, 1),
                         'target_speed': 'per road: the best speed the car carries on its straight samples (R>=500 m), capped at 440. Hass to override per road.'},
         'roads': [], 'flags': []}
def flag(kind, ident, msg, sev='warn'):
    index['flags'].append({'severity': sev, 'kind': kind, 'id': ident, 'message': msg})

for r in d['roads']:
    rid = r['id']; c = cls.get(rid, {}); k = c.get('cls', r['kind'])
    X, Y, Z = r['x'], r['y'], r['z']; n = len(X)
    radii = [None]*n; side = [0]*n
    for i in range(1, n-1):
        cc = circum((X[i-1], Y[i-1]), (X[i], Y[i]), (X[i+1], Y[i+1]))
        if not cc: continue
        R = math.hypot(cc[0]-X[i], cc[1]-Y[i])
        if R > 5000: continue
        nl = (r['xl'][i]-X[i], r['yl'][i]-Y[i])
        radii[i] = R
        side[i] = 1 if (cc[0]-X[i])*nl[0]+(cc[1]-Y[i])*nl[1] > 0 else -1   # +1 means inside is left
    def bank_at(q):
        w = math.hypot(r['xl'][q]-r['xr'][q], r['yl'][q]-r['yr'][q]) or r['width_m']
        zin, zout = (r['zl'][q], r['zr'][q]) if side[q] > 0 else (r['zr'][q], r['zl'][q])
        return math.degrees(math.atan((zin-zout)/w))
    # the road's target speed: best speed the car carries on its straight samples
    straight_caps = [cap_kmh(radii[q], bank_at(q)) for q in range(n) if radii[q] is None or radii[q] >= STRAIGHT_R]
    has_tunnel = any(q == 2 for q in r['struct'])
    target = 400 if (rid in EXPRESS or has_tunnel) else 150
    target_src = 'expressway or tunnel: 400 km/h, metal banks' if target == 400 else 'other road: 150 km/h'
    rec = {'id': rid, 'name': r['name'], 'class': k, 'route': c.get('route'), 'kind': r['kind'],
           'closed': r['closed'], 'length_m': r['length_m'], 'width_m': r['width_m'],
           'target_kmh': target, 'target_source': target_src, 'corners': [], 'steep_bank': []}
    sm = {0: 0.0, 1: 0.0, 2: 0.0}
    for i in range(n-1): sm[r['struct'][i]] += math.hypot(X[i+1]-X[i], Y[i+1]-Y[i])
    rec['struct_m'] = {'ground': round(sm[0]), 'bridge': round(sm[1]), 'tunnel': round(sm[2])}
    gmax = 0.0
    for i in range(n):
        j = max(i-1, 0); m = min(i+3, n-1)
        dist = math.hypot(X[m]-X[j], Y[m]-Y[j])
        if dist > 1: gmax = max(gmax, abs(Z[m]-Z[j])/dist*100)
    rec['max_grade_pct'] = round(gmax, 1)
    if gmax > 12: flag('grade', rid, f'steepest 12 m is {gmax:.1f} %', 'info')
    i = 0
    while i < n:
        if radii[i] is not None and radii[i] < CORNER_R and side[i] != 0:
            j = i
            while j+1 < n and radii[j+1] is not None and radii[j+1] < CORNER_R and side[j+1] == side[i]: j += 1
            run = range(i, j+1)
            Rmin = min(radii[q] for q in run)
            banks = [bank_at(q) for q in run]
            bank_act = sum(banks)/len(banks)
            cap = min(cap_kmh(radii[q], bank_at(q)) for q in run)
            need = bank_needed(target, Rmin)
            a0 = math.atan2(Y[min(i+1, n-1)]-Y[i], X[min(i+1, n-1)]-X[i])
            a1 = math.atan2(Y[j]-Y[max(j-1, 0)], X[j]-X[max(j-1, 0)])
            turn = math.degrees(abs((a1-a0+math.pi) % (2*math.pi) - math.pi))
            cid = f'{rid}-c{len(rec["corners"])+1:02d}'
            rec['corners'].append({'id': cid, 's_from_m': round(r['s'][i]), 's_to_m': round(r['s'][j]),
                                   'min_radius_m': round(Rmin, 1), 'turn_deg': round(turn, 1),
                                   'inside': 'left' if side[i] > 0 else 'right',
                                   'bank_actual_deg': round(bank_act, 1), 'bank_needed_for_target_deg': round(need, 1),
                                   'speed_cap_kmh': round(cap), 'target_kmh': target,
                                   'bank_needed_by_kmh': {str(v): round(bank_needed(v, Rmin), 1) for v in (100, 150, 200, 250, 330, 400)}})
            if need >= STEEP:
                rec['steep_bank'].append(cid)
                flag('steep_bank', cid, f'{rid} s={r["s"][i]:.0f} m: radius {Rmin:.0f} m needs {need:.1f} deg bank for {target} km/h. Note for metal bank.', 'note')
            elif cap < 0.9*target:
                flag('corner_short', cid, f'{rid} s={r["s"][i]:.0f} m: radius {Rmin:.0f} m, bank {bank_act:.1f} deg caps at {cap:.0f} km/h, road target {target}')
            i = j+1
        else:
            i += 1
    index['roads'].append(rec)

jx = []
for j in d['junctions']:
    rec = {'type': j['type'], 'rider': j['rider'], 'host': j['host'], 'at_m': [j['x'], j['y']], 'height_m': j['z'], 'has_seam': bool(j.get('seam'))}
    if j['rider'] not in cls and j['rider'] not in {r['id'] for r in d['roads']}:
        flag('junction_ref', str(rec['at_m']), 'junction rider missing', 'error')
    jx.append(rec)
index['junctions'] = jx
index['junction_counts'] = dict(Counter(j['type'] for j in jx))

fl = []
for f in flares['flares']:
    at = f['at']
    if isinstance(at, str): at = [float(v) for v in at.strip('[]').split(',')]
    rds = f['roads'] if isinstance(f['roads'], list) else []
    rec = {'id': f['id'], 'at_m': at, 'roads': rds, 'radius_m': f.get('radius_m'),
           'corner_speed_kmh': f.get('corner_speed_kmh'), 'where': f.get('where')}
    fl.append(rec)
    if rds and rec['corner_speed_kmh'] is not None:
        tgt = min(next((rr['target_kmh'] for rr in index['roads'] if rr['id'] == x), TOP) for x in rds)
        if float(rec['corner_speed_kmh']) < 0.8*tgt:
            flag('flare_speed', rec['id'], f"holds {rec['corner_speed_kmh']} km/h, under 80% of the slowest approach target {tgt} km/h", 'info')
index['flares'] = fl

jo = [{'kind': j['kind'], 'at_m': [j['x'], j['y']], 'turn_deg': j.get('turn_deg'), 'members': j.get('members')} for j in d['joints']]
for j in jo:
    turns = j['turn_deg'] if isinstance(j['turn_deg'], list) else [j['turn_deg'] or 0]
    if max(turns) > 15: flag('joint_kink', str(j['at_m']), f"joint turns {max(turns)} deg in one step", 'info')
index['joints'] = jo
index['dead_ends'] = d.get('dead_ends', [])
index['summary'] = {'roads': len(index['roads']), 'corners': sum(len(r['corners']) for r in index['roads']),
                    'steep_bank_corners': sum(len(r['steep_bank']) for r in index['roads']),
                    'junctions': len(jx), 'flares': len(fl), 'joints': len(jo), 'flags': dict(Counter(f['kind'] for f in index['flags']))}
json.dump(index, open(sys.argv[1], 'w'), indent=1)
print(json.dumps(index['summary']))

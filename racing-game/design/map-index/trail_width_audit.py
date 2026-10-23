import json, math, sys
EXP = '/mnt/project-files/racing-game/concepts/north-island/race-map/final/unity-export/'
N = 1025; SP = 8.0
surf = open(EXP + 'surface.u8', 'rb').read()
zone = open(EXP + 'veg-zones.u8', 'rb').read()
tr = json.load(open(EXP + 'trails.json'))
REQ = {'race': 7.0, 'time_trial': 7.0, 'hill_climb': 7.0, 'circuit': 7.0, 'link': 4.0}   # explore-type links need 3.5 m (Hass); races 7 m (story note)
CAP = 6.0   # look at most 6 m to each side (zone 11 corridor)

def solid(x, y):
    j = round(x / SP); i = round(y / SP)
    if not (0 <= i < N and 0 <= j < N): return True
    k = i * N + j
    return surf[k] == 0 or zone[k] == 1

def open_side(x, y, dx, dy):
    d = 0.0
    while d < CAP:
        d += 0.5
        if solid(x + dx * d, y + dy * d): return d - 0.5
    return CAP

rows = []
for t in tr['trails']:
    req = REQ.get(t['kind'], 3.5)
    line = t['line']
    res = []
    for k in range(len(line)):
        a = line[max(k - 1, 0)]; b = line[min(k + 1, len(line) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        x, y = line[k][0], line[k][1]
        w = open_side(x, y, nx, ny) + open_side(x, y, -nx, -ny)
        res.append((round(x), round(y), w))
    narrow = [r for r in res if r[2] < req]
    runs = []
    cur = None
    for idx, (x, y, w) in enumerate(res):
        if w < req:
            if cur is None: cur = [idx, idx, w]
            else: cur[1] = idx; cur[2] = min(cur[2], w)
        else:
            if cur: runs.append(cur); cur = None
    if cur: runs.append(cur)
    rows.append((t['id'], t['name'], t['kind'], req, len(res), len(narrow), round(min(r[2] for r in res), 1), runs, res))
    print(f"{t['id']:4} {t['kind']:10} need {req} m: {len(narrow)}/{len(res)} points narrow, min open {min(r[2] for r in res):.1f} m, {len(runs)} runs")
json.dump([{'id': r[0], 'name': r[1], 'kind': r[2], 'required_m': r[3], 'points': r[4], 'narrow_points': r[5],
            'min_open_m': r[6], 'runs': [{'from_xy': [round(r[8][q[0]][0]), round(r[8][q[0]][1])], 'to_xy': [round(r[8][q[1]][0]), round(r[8][q[1]][1])], 'min_open_m': round(q[2], 1), 'points': q[1] - q[0] + 1} for q in r[7]]} for r in rows],
          open(sys.argv[1], 'w'), indent=1)

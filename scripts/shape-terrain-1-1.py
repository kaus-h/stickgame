import json, math, random, sys
p = sys.argv[1]
lvl = json.load(open(p, encoding='utf-8'))
# Flanks that may be shaped: (solid id) -> sides. Pool/wall-adjacent flanks stay straight.
FREE = {
  'c1-start': {'right'},
  'c1-landing': {'left', 'right'},
  'c2-far': {'left', 'right'},
  'c3-high-ledge': {'left'},
  'c4-far': {'right'},
  'c5-far': {'left'},
}
LIP = 0.9
def r(v): return round(v * 20) / 20
def flank(rnd, top, bot, width):
  """Inward offsets down a free flank, from the lip to the bottom: pedestal taper with knuckles."""
  depth = min(1.7, width * 0.2) * rnd.uniform(0.75, 1.0)
  pts = []
  y = top + LIP
  pts.append((0.0, y))
  knuckle = rnd.uniform(0.35, 0.65)
  n = 4
  for i in range(1, n + 1):
    t = i / n
    y = top + LIP + (bot - top - LIP) * t
    d = depth * (0.35 + 0.65 * t) if t > 0.2 else depth * 0.45 * (t / 0.2)
    if abs(t - knuckle) < 0.12: d *= 0.7  # a rock knuckle pushing back out under the lip
    d += rnd.uniform(-0.05, 0.05)
    pts.append((max(0.15, d), y))
  pts[-1] = (pts[-1][0], bot)
  return pts
out = []
for s in lvl['solids']:
  sides = FREE.get(s['id'])
  if not sides:
    out.append(s); continue
  R = s['rect']; x0, y0, w, h = R['x'], R['y'], R['w'], R['h']; x1, y1 = x0 + w, y0 + h
  rnd = random.Random(s['id'])
  right = flank(rnd, y0, y1, w) if 'right' in sides else [(0, y0 + LIP), (0, y1)]
  left = flank(rnd, y0, y1, w) if 'left' in sides else [(0, y0 + LIP), (0, y1)]
  pts = [(x0, y0), (x1, y0)]
  pts += [(x1 - d, y) for d, y in right]
  # Bottom: roots dipping to the ink line between the two flank feet.
  bl, br = x0 + left[-1][0], x1 - right[-1][0]
  SINK = 0.6 if y1 >= 11.4 - 1e-9 else 0.0
  pts.append((br, y1 + SINK)); pts.append((bl, y1 + SINK))
  pts += [(x0 + d, y) for d, y in reversed(left)]
  pts = [[r(x), r(y)] for x, y in pts]
  # drop consecutive duplicates
  ded = [pts[0]] + [q for a, q in zip(pts, pts[1:]) if q != a]
  if ded[-1] == ded[0]: ded.pop()
  for x, y in ded:
    assert x0 - 1e-9 <= x <= x1 + 1e-9 and y0 - 1e-9 <= y <= y1 + 0.6 + 1e-9, (s['id'], x, y)
  out.append({k2: v for k2, v in s.items() if k2 != 'rect'} | {'points': ded})
lvl['solids'] = out
txt = json.dumps(lvl, indent=2, ensure_ascii=False)
open(p, 'w', encoding='utf-8', newline='').write(txt + '\n')
print('shaped', sum(1 for s in out if 'points' in s))

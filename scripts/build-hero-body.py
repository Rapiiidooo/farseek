import base64
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "receipts/verification-upper-body/source-study"
DATA = json.loads((SOURCE / "upper-body-source.json").read_text())
SUPPORTS = [0.2, 0.4, 0.6, 0.8]
NAMES = ["hips", "spine", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm"]
NAMES += [side + "ShoulderSkin" + str(i + 1) for side in ["left", "right"] for i in range(len(SUPPORTS))]


def add(a, b):
    return [x + y for x, y in zip(a, b)]


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def mul(a, s):
    return [x * s for x in a]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def unit(a):
    return mul(a, 1 / max(1e-12, math.sqrt(dot(a, a))))


def mean(values):
    return [sum(v[i] for v in values) / len(values) for i in range(len(values[0]))]


def smooth(a, b, v):
    t = max(0, min(1, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def profile(rows, value, linear=False):
    if value <= rows[0][0]:
        return rows[0][1]
    for (x, a), (y, b) in zip(rows, rows[1:]):
        if value <= y:
            return a + (b - a) * ((value - x) / (y - x) if linear else smooth(x, y, value))
    return rows[-1][1]


def torso(p):
    x, y, z = p
    height = profile([[0.72685, 1.007], [1.86665, 1.105], [2.79665, 1.21], [4.32855, 1.365], [5.2458, 1.45], [5.8, 1.511]], y, linear=True)
    width = profile([[0.72685, 0.102], [2.8, 0.116], [4.6, 0.115], [5.25, 0.119], [5.8, 0.09]], y)
    center = profile([[0.72685, 0.215], [1.86665, 0.521], [2.79665, 0.636], [4.32855, 0.533], [5.2458, 0.207], [5.8, 0.229]], y)
    depth = profile([[0.72685, 0.095], [2.8, 0.115], [4.33, 0.117], [5.8, 0.09]], y)
    offset = profile([[0.72685, -0.003], [2.8, 0.008], [4.33, 0.0], [5.2458, -0.006], [5.8, -0.028]], y)
    return [x * width, height, (z - center) * depth + offset]


def arm_transform(p, source_a, source_b, target_a, target_b, source_normal, target_normal):
    axis = sub(source_b, source_a)
    t = dot(sub(p, source_a), axis) / dot(axis, axis)
    radial = sub(sub(p, source_a), mul(axis, t))
    direction = sub(target_b, target_a)
    source_bend = unit(cross(source_normal, unit(axis)))
    target_bend = unit(cross(target_normal, unit(direction)))
    radial = add(mul(target_normal, dot(radial, source_normal)), mul(target_bend, dot(radial, source_bend)))
    return add(add(target_a, mul(direction, t)), mul(radial, 0.0775 if source_a[1] > 4 else 0.085))


segments = []
for suffix, sign in [("L", 1), ("R", -1)]:
    s = [1.67712 * sign, 5.2458, 0.14605]
    e = [3.12936 * sign, 3.49319, 0.13201]
    w = [4.31185 * sign, 2.45181, 1.75655]
    shoulder = [0.21 * sign, 1.45, 0]
    elbow = add(shoulder, [sign * 0.04036019927841896, -0.2860849419332723, 0.02502918922463357])
    wrist = add(elbow, [sign * 0.03409740973521604, -0.232014525634894, 0.07093395903066399])
    source_normal = unit(cross(sub(e, s), sub(w, e)))
    target_normal = unit(cross(sub(elbow, shoulder), sub(wrist, elbow)))
    segments.extend([(s, e, shoulder, elbow, source_normal, target_normal), (e, w, elbow, wrist, source_normal, target_normal)])


def mapped_weights(p, weights):
    result = [0.0] * 6
    for name, weight in weights.items():
        side = 2 if name.endswith(".L") else 4
        if name.startswith("upperarm"):
            result[side] += weight
        elif name.startswith(("lowerarm", "wrist", "metacarpal", "finger")):
            result[side + 1] += weight
        elif name.startswith("shoulder"):
            result[1] += weight * 0.7
            result[side] += weight * 0.3
        else:
            hip = 1 - smooth(0.8, 2.0, p[1])
            result[0] += weight * hip
            result[1] += weight * (1 - hip)
    total = sum(result)
    return [v / total for v in result]


positions, weights = [], []
for p, source_weights in zip(DATA["positions"], DATA["weights"]):
    influence = mapped_weights(p, source_weights)
    transforms = [torso(p), torso(p)] + [arm_transform(p, *segment) for segment in segments]
    point = [sum(t[k] * w for t, w in zip(transforms, influence)) for k in range(3)]
    body_weight = influence[0] + influence[1]
    x, y, z = point
    width = profile([[1.007, 0.173], [1.12, 0.149], [1.24, 0.159], [1.37, 0.187], [1.45, 0.207]], y)
    front = profile([[1.007, 0.101], [1.14, 0.082], [1.25, 0.087], [1.35, 0.096], [1.40, 0.080], [1.445, 0.048], [1.50, 0.026]], y)
    envelope = front * math.sqrt(max(0, 1 - (x / width) ** 2))
    bust_height = 0.072 if y > 1.352 else 0.083
    bust = sum(math.exp(-((x - side * 0.074) / 0.065) ** 2) for side in [-1, 1])
    bust *= math.exp(-((y - 1.352) / bust_height) ** 2)
    envelope += 0.042 * bust
    bridge = front * math.sqrt(max(0, 1 - (0.055 / width) ** 2))
    bridge += 0.042 * sum(math.exp(-((0.055 - side * 0.074) / 0.065) ** 2) for side in [-1, 1]) * math.exp(-((y - 1.352) / bust_height) ** 2)
    envelope += max(0, bridge - envelope) * (1 - smooth(0.015, 0.055, abs(x))) * 0.6
    fabric = body_weight * smooth(0.0, 0.035, z) * (1 - smooth(1.45, 1.50, y))
    point[2] += (envelope - z) * fabric * 0.90
    waist = math.exp(-((y - 1.15) / 0.09) ** 2) * body_weight
    point[0] *= 1 - 0.10 * waist
    back_depth = profile([[1.007, 0.095], [1.18, 0.078], [1.36, 0.092], [1.44, 0.085], [1.50, 0.045]], y)
    back = -back_depth * math.sqrt(max(0, 1 - (x / width) ** 2))
    point[2] += (back - z) * body_weight * smooth(0.0, 0.025, -z) * 0.85
    side_ease = 0.003 * math.exp(-((y - 1.22) / 0.12) ** 2) * body_weight
    point[0] += math.copysign(side_ease * smooth(0.06, 0.14, abs(x)), x)
    shoulder = smooth(1.33, 1.43, y) * smooth(0.085, 0.23, abs(x))
    point[0] *= 1 - 0.015 * shoulder
    point[1] -= 0.016 * smooth(0.075, 0.16, abs(x)) * (1 - smooth(0.21, 0.28, abs(x))) * smooth(1.40, 1.50, y)
    positions.append(point)
    weights.append(influence)
faces = [[corner[0] for corner in face] for face in DATA["faces"]]
neighbors = defaultdict(set)
for face in faces:
    for a, b in zip(face, face[1:] + face[:1]):
        neighbors[a].add(b)
        neighbors[b].add(a)
for _ in range(3):
    smoothed = []
    for i, p in enumerate(positions):
        elbow = math.exp(-((p[1] - 1.165) / 0.06) ** 2) * (1 - weights[i][0] - weights[i][1])
        factor = elbow * 0.4
        average = mean([positions[j] for j in neighbors[i]])
        smoothed.append(add(mul(p, 1 - factor), mul(average, factor)))
    positions = smoothed


def subdivide(values, polygons):
    centers = [mean([values[i] for i in face]) for face in polygons]
    edges, adjacent = defaultdict(list), defaultdict(list)
    for f, face in enumerate(polygons):
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append(f)
            adjacent[a].append(f)
    out = [p[:] for p in values]
    ids, connected, boundary = {}, defaultdict(list), defaultdict(list)
    for (a, b), sharing in edges.items():
        connected[a].append(b)
        connected[b].append(a)
        if len(sharing) == 1:
            point = mean([values[a], values[b]])
            boundary[a].append(b)
            boundary[b].append(a)
        else:
            assert len(sharing) == 2
            point = mean([values[a], values[b], centers[sharing[0]], centers[sharing[1]]])
        ids[(a, b)] = len(out)
        out.append(point)
    for i in adjacent:
        if boundary[i]:
            out[i] = [(values[i][k] * 6 + sum(values[j][k] for j in boundary[i])) / 8 for k in range(len(values[i]))]
        else:
            n = len(connected[i])
            f = mean([centers[j] for j in adjacent[i]])
            r = mean([mean([values[i], values[j]]) for j in connected[i]])
            out[i] = [(f[k] + 2 * r[k] + (n - 3) * values[i][k]) / n for k in range(len(values[i]))]
    offset = len(out)
    out.extend(centers)
    quads = []
    for f, face in enumerate(polygons):
        for j, a in enumerate(face):
            b, previous = face[(j + 1) % len(face)], face[j - 1]
            quads.append([a, ids[tuple(sorted((a, b)))], offset + f, ids[tuple(sorted((previous, a)))]])
    return out, quads


skin_uv, uv_faces = subdivide(DATA["uvs"], [[corner[1] for corner in face] for face in DATA["faces"]])
weights, _ = subdivide(weights, faces)
positions, faces = subdivide(positions, faces)
normals = [[0.0] * 3 for _ in positions]
triangles = []
for face in faces:
    for j in range(1, len(face) - 1):
        a, b, c = face[0], face[j], face[j + 1]
        triangles.extend([a, b, c])
        normal = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]))
        for i in [a, b, c]:
            normals[i] = add(normals[i], normal)
for i, (p, influence) in enumerate(zip(positions, weights)):
    n = unit(normals[i])
    body_weight = influence[0] + influence[1]
    ease = 0.0015 * body_weight
    a = math.atan2(p[0], p[2])
    fold = 0.0012 * math.sin(p[1] * 94 + a * 2.7) * math.exp(-((p[1] - 1.11) / 0.085) ** 2) * body_weight
    positions[i] = add(p, mul(n, ease + fold))

indices, influences, uv, colors = [], [], [], []
for p, weight in zip(positions, weights):
    weight = weight[:] + [0] * 8
    for side, arm in enumerate([2, 4]):
        if p[0] * (1 if side == 0 else -1) <= 0:
            continue
        total = weight[1] + weight[arm]
        if total < 1e-8:
            continue
        amount = weight[arm] / total
        lateral = smooth(0.115, 0.24, abs(p[0]))
        blend = smooth(1.25, 1.35, p[1])
        amount += (lateral - amount) * blend
        slots = [1] + list(range(6 + side * 4, 10 + side * 4)) + [arm]
        value = amount * 5
        low = min(4, math.floor(value))
        mix = value - low
        weight[1] = weight[arm] = 0
        weight[slots[low]] += total * (1 - mix)
        weight[slots[low + 1]] += total * mix
    order = sorted(range(len(NAMES)), key=lambda i: weight[i], reverse=True)[:4]
    total = sum(weight[i] for i in order)
    indices.extend(order)
    influences.extend(weight[i] / total for i in order)
    uv.extend([p[0] / 0.085, p[1] / 0.085])
    shade = 0.98 + 0.014 * math.sin(p[0] * 25 + p[1] * 4)
    colors.extend([shade] * 3)

normals = [[0.0] * 3 for _ in positions]
for a, b, c in zip(triangles[::3], triangles[1::3], triangles[2::3]):
    normal = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]))
    for i in [a, b, c]:
        normals[i] = add(normals[i], normal)
normals = [unit(n) for n in normals]
vertices, exported, raw_triangles = {}, [], []
for face, uv_face in zip(faces, uv_faces):
    polygon = []
    for vertex, texcoord in zip(face, uv_face):
        key = (vertex, texcoord)
        if key not in vertices:
            vertices[key] = len(exported)
            exported.append(key)
        polygon.append(vertices[key])
    for j in range(1, len(polygon) - 1):
        raw_triangles.append([polygon[0], polygon[j], polygon[j + 1]])
output_positions = [positions[i] for i, _ in exported]
output_normals = [normals[i] for i, _ in exported]
output_uv = [skin_uv[j] for _, j in exported]
output_cloth_uv = [uv[i * 2:i * 2 + 2] for i, _ in exported]
output_colors = [colors[i * 3:i * 3 + 3] for i, _ in exported]
output_weights = []
for i, _ in exported:
    row = [0.0] * len(NAMES)
    for index, influence in zip(indices[i * 4:i * 4 + 4], influences[i * 4:i * 4 + 4]):
        row[index] += influence
    output_weights.append(row)


def armhole(p):
    edge = profile([[1.0, 0.205], [1.27, 0.193], [1.33, 0.164], [1.42, 0.155], [1.48, 0.121], [1.53, 0.095]], p[1])
    return abs(p[0]) - edge


values = [armhole(p) for p in output_positions]
cuts, clothed, bare = {}, [], []


def cut(a, b):
    a, b = sorted([a, b])
    key = (a, b)
    if key not in cuts:
        t = values[a] / (values[a] - values[b])
        cuts[key] = len(output_positions)
        for collection in [output_positions, output_normals, output_uv, output_cloth_uv, output_colors, output_weights]:
            collection.append(add(mul(collection[a], 1 - t), mul(collection[b], t)))
        output_normals[-1] = unit(output_normals[-1])
        values.append(0)
    return cuts[key]


for triangle in raw_triangles:
    for sign, target_indices in [(1, bare), (-1, clothed)]:
        polygon = []
        for a, b in zip(triangle, triangle[1:] + triangle[:1]):
            inside_a, inside_b = values[a] * sign >= 0, values[b] * sign >= 0
            if inside_a:
                polygon.append(a)
            if inside_a != inside_b:
                polygon.append(cut(a, b))
        for i in range(1, len(polygon) - 1):
            target_indices.extend([polygon[0], polygon[i], polygon[i + 1]])

edges = defaultdict(list)
welded, weld_ids = {}, []
for p in output_positions:
    key = tuple(round(v, 8) for v in p)
    if key not in welded:
        welded[key] = len(welded)
    weld_ids.append(welded[key])
for triangle in raw_triangles:
    for a, b in zip(triangle, triangle[1:] + triangle[:1]):
        edges[tuple(sorted([weld_ids[a], weld_ids[b]]))].append([a, b])
neck_edges = [pairs[0] for pairs in edges.values() if len(pairs) == 1 and all(output_positions[i][1] > 1.50 for i in pairs[0])]
neck_top = {}
for index in sorted({i for pair in neck_edges for i in pair}):
    neck_top[index] = len(output_positions)
    p = output_positions[index]
    output_positions.append([p[0] * 0.94, p[1] + 0.016, 0.019 + (p[2] - 0.019) * 0.96])
    output_normals.append(output_normals[index][:])
    output_uv.append(output_uv[index][:])
    output_cloth_uv.append([p[0] / 0.085, (p[1] + 0.016) / 0.085])
    output_colors.append([0.7] * 3)
    output_weights.append(output_weights[index][:])
for a, b in neck_edges:
    clothed.extend([b, a, neck_top[a], b, neck_top[a], neck_top[b]])

triangles = clothed + bare
skin_colors = []
changed = set()


def muscle(t, center, spread, angle, bearing, width):
    turn = math.atan2(math.sin(angle - bearing), math.cos(angle - bearing))
    return math.exp(-((t - center) / spread) ** 2 - (turn / width) ** 2)


for index, p in enumerate(output_positions):
    sign = 1 if p[0] >= 0 else -1
    segment = segments[0 if sign > 0 else 2]
    shoulder, elbow = segment[2], segment[3]
    wrist = segments[1 if sign > 0 else 3][3]
    upper_axis = unit(sub(elbow, shoulder))
    fore_axis = unit(sub(wrist, elbow))
    upper_length = math.sqrt(dot(sub(elbow, shoulder), sub(elbow, shoulder)))
    fore_length = math.sqrt(dot(sub(wrist, elbow), sub(wrist, elbow)))
    upper_t = dot(sub(p, shoulder), upper_axis) / upper_length
    fore_t = dot(sub(p, elbow), fore_axis) / fore_length
    blend = smooth(-0.045, 0.055, fore_t)
    mask = smooth(0.009, 0.035, armhole(p)) * (1 - smooth(0.79, 0.94, fore_t))
    mask *= smooth(-0.09, 0.04, upper_t)
    delta = [0, 0, 0]
    for lower, origin, axis, length, t, factor in [
        (False, shoulder, upper_axis, upper_length, upper_t, 1 - blend),
        (True, elbow, fore_axis, fore_length, fore_t, blend),
    ]:
        radial = sub(sub(p, origin), mul(axis, t * length))
        outward = unit(sub([sign, 0, 0], mul(axis, sign * axis[0])))
        front = mul(unit(cross(outward, axis)), -sign)
        angle = math.atan2(dot(radial, front), dot(radial, outward))
        lobe = lambda center, spread, bearing, width: muscle(t, center, spread, angle, bearing, width)
        if not lower:
            relief = 0.0038 * lobe(0.17, 0.20, 0, 1.3)
            relief += 0.0078 * lobe(0.55, 0.23, math.pi / 2, 0.9)
            relief += 0.0050 * lobe(0.49, 0.30, -math.pi / 2, 1.0)
            relief -= 0.0015 * lobe(0.37, 0.14, 0.67, 0.24)
            relief -= 0.0013 * lobe(0.38, 0.18, -0.74, 0.29)
            relief -= 0.00525 * lobe(0.98, 0.19, math.pi / 2, 1.0)
            relief -= 0.0020 * lobe(0.89, 0.17, 0, 2.7)
        else:
            relief = 0.0045 * lobe(0.22, 0.19, 0.52, 0.78)
            relief += 0.0030 * lobe(0.31, 0.25, -0.60, 0.75)
            relief -= 0.00525 * lobe(-0.02, 0.21, math.pi / 2, 1.0)
            relief -= 0.0018 * lobe(0.64, 0.22, 0, 2.6)
            relief += 0.0012 * lobe(0.69, 0.19, 0.35 - 0.40 * t, 0.14)
            relief += 0.0008 * lobe(0.70, 0.17, -0.32, 0.12)
        relief += 0.0032 * math.exp(-(fore_t / 0.095) ** 2) * math.exp(-((abs(angle) - math.pi) / 0.5) ** 2)
        relief += 0.0038 * math.exp(-(fore_t / 0.075) ** 2) * math.exp(-((angle + math.pi / 2) / 0.55) ** 2)
        delta = add(delta, mul(unit(radial), relief * mask * factor))
    if dot(delta, delta) > 1e-16:
        output_positions[index] = add(p, delta)
        changed.add(index)
    warmth = mask * math.exp(-(fore_t / 0.19) ** 2)
    skin_colors.append([1, 1 - 0.036 * warmth, 1 - 0.052 * warmth])

normal_sums = defaultdict(lambda: [0.0, 0.0, 0.0])
normal_keys = [tuple(round(v, 8) for v in p) for p in output_positions]
affected_normals = set()
for a, b, c in zip(triangles[::3], triangles[1::3], triangles[2::3]):
    n = cross(sub(output_positions[b], output_positions[a]), sub(output_positions[c], output_positions[a]))
    for i in [a, b, c]:
        normal_sums[normal_keys[i]] = add(normal_sums[normal_keys[i]], n)
    if any(i in changed for i in [a, b, c]):
        affected_normals.update(normal_keys[i] for i in [a, b, c])
for i, key in enumerate(normal_keys):
    if key in affected_normals:
        output_normals[i] = unit(normal_sums[key])

indices, influences = [], []
for row in output_weights:
    order = sorted(range(len(NAMES)), key=lambda i: row[i], reverse=True)[:4]
    total = sum(row[i] for i in order)
    indices.extend(order)
    influences.extend(row[i] / total for i in order)


def encode(values, kind):
    return base64.b64encode(struct.pack("<" + kind * len(values), *values)).decode()


result = {
    "joints": NAMES,
    "supportFractions": SUPPORTS,
    "position": encode([v for p in output_positions for v in p], "f"),
    "normal": encode([v for p in output_normals for v in p], "f"),
    "uv": encode([v for p in output_cloth_uv for v in p], "f"),
    "skinUv": encode([v for p in output_uv for v in p], "f"),
    "skinColor": encode([v for p in skin_colors for v in p], "f"),
    "color": encode([v for p in output_colors for v in p], "f"),
    "skinIndex": encode(indices, "B"),
    "skinWeight": encode(influences, "f"),
    "index": encode(triangles, "H"),
    "clothedIndexCount": len(clothed),
}
target = ROOT / "game/assets/explorer/body.js"
target.write_text("export default " + json.dumps(result, separators=(",", ":")) + ";\n")
report = {"vertices": len(output_positions), "triangles": len(triangles) // 3, "clothTriangles": len(clothed) // 3, "skinTriangles": len(bare) // 3, "armholeCuts": len(cuts), "neckEdges": len(neck_edges), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "source": str(SOURCE.relative_to(ROOT)), "joints": NAMES}
receipt = ROOT / "receipts/verification-arms-detail"
receipt.mkdir(parents=True, exist_ok=True)
(receipt / "build.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))

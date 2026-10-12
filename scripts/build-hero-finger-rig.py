# Writes game/assets/explorer/gloves-rig.js: the fifteen finger bones of the CC0 MakeHuman hand
# that posed the glove, and each glove vertex's smoothed bone weights, so the relaxed glove can
# be skinned. The MakeHuman sources are untracked; pass the checkout that holds them.
#   python3 scripts/build-hero-finger-rig.py [<checkout with receipts/verification-realism/sources>]
import base64
from collections import defaultdict
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SOURCES = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT
SOURCE = SOURCES / "receipts/verification-realism/sources/base.obj"
STUDY = SOURCES / "receipts/verification-upper-body/source-study"
EXPLORER = ROOT / "game/assets/explorer"
OUTPUT = EXPLORER / "gloves-rig.js"

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("gloves", ROOT / "scripts/build-hero-gloves.py")
gloves = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gloves)
add, sub, mul, dot, cross, unit, mean = gloves.add, gloves.sub, gloves.mul, gloves.dot, gloves.cross, gloves.unit, gloves.mean
apply, compose, rotate_at, subdivide = gloves.apply, gloves.compose, gloves.rotate_at, gloves.subdivide

FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"]
SCALES = [0.09, 0.097, 0.082]
# The angles that posed the shipped relaxed glove (gloves-relaxed.js) and the grip (gloves.js).
RELAXED = [[7, 11, 8], [12, 16, 10], [14, 20, 12], [16, 22, 14], [18, 24, 16]]
GRIP = [[18, 27, 24], [42, 60, 37], [45, 63, 39], [48, 65, 41], [52, 67, 43]]
OPPOSITION = {"relaxed": -20, "grip": -47}
ADDUCTION = [15, 12, 0, -7, -12]


def invert(m):
    r = [[m[j][i] for j in range(3)] for i in range(3)]
    return [r[i] + [-dot(r[i], [m[0][3], m[1][3], m[2][3]])] for i in range(3)]


def decode(text):
    raw = base64.b64decode(text)
    return [list(struct.unpack_from("<3f", raw, i * 12)) for i in range(len(raw) // 12)]


def shipped(name):
    text = (EXPLORER / name).read_text().strip()
    return json.loads(text[len("export default "):].rstrip(";"))


def main():
    vertices, faces = [], []
    group = ""
    for line in SOURCE.read_text().splitlines():
        values = line.split()
        if not values:
            continue
        if values[0] == "v":
            vertices.append(list(map(float, values[1:4])))
        elif values[0] == "g":
            group = values[1]
        elif values[0] == "f" and group == "body":
            faces.append([int(corner.split("/")[0]) - 1 for corner in values[1:]])
    rig = json.loads((STUDY / "default.mhskel").read_text())
    weight_data = json.loads((STUDY / "default_weights.mhw").read_text())
    assert rig["license"] == weight_data["license"] == "CC0"
    raw_bones = {name: {key: mean([vertices[i] for i in rig["joints"][bone[key]]]) for key in ["head", "tail"]} | {"parent": bone["parent"]} for name, bone in rig["bones"].items()}
    wrist = raw_bones["wrist.L"]["head"]
    forearm = unit(sub(wrist, raw_bones["lowerarm01.L"]["head"]))
    a = unit(sub(raw_bones["finger3-1.L"]["head"], wrist))
    t = sub(raw_bones["finger2-1.L"]["head"], raw_bones["finger5-1.L"]["head"])
    t = unit(sub(t, mul(a, dot(t, a))))
    p = mul(cross(t, a), -1)
    canonical = lambda point: [dot(sub(point, wrist), axis) for axis in [t, a, p]]
    bones = {name: {"head": canonical(bone["head"]), "tail": canonical(bone["tail"]), "parent": bone["parent"]} for name, bone in raw_bones.items()}
    weights = defaultdict(dict)
    for bone, pairs in weight_data["weights"].items():
        for i, value in pairs:
            weights[i][bone] = value
    extracted, polygons, lookup = [], [], {}
    for face in faces:
        if not all(vertices[i][0] > 3.65 for i in face):
            continue
        points = [{"position": vertices[i], "source": {i: 1}} for i in face]
        clipped = []
        for pa, pb in zip(points, points[1:] + points[:1]):
            da, db = dot(sub(pa["position"], wrist), forearm), dot(sub(pb["position"], wrist), forearm)
            if da >= 0:
                clipped.append(pa)
            if (da >= 0) != (db >= 0):
                u = da / (da - db)
                clipped.append({"position": add(pa["position"], mul(sub(pb["position"], pa["position"]), u)), "source": {next(iter(pa["source"])): 1 - u, next(iter(pb["source"])): u}})
        if len(clipped) < 3:
            continue
        polygon = []
        for point in clipped:
            key = tuple(round(x, 8) for x in point["position"])
            if key not in lookup:
                lookup[key] = len(extracted)
                w = defaultdict(float)
                for source, influence in point["source"].items():
                    for bone, value in weights[source].items():
                        w[bone] += value * influence
                total = sum(w.values())
                extracted.append({"position": canonical(point["position"]), "weights": {name: value / total for name, value in w.items()}})
            polygon.append(lookup[key])
        polygons.append(list(reversed(polygon)))
    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
    names = [f"finger{finger}-{segment}.L" for finger in range(1, 6) for segment in range(1, 4)]
    axes = {name: unit(cross(unit(sub(bones[name]["tail"], bones[name]["head"])), [0, 0, 1])) for name in names}

    def pose(angles, opposition, adduction):
        matrices = {}
        for finger in range(1, 6):
            for segment in range(1, 4):
                name = f"finger{finger}-{segment}.L"
                head = bones[name]["head"]
                local = rotate_at(axes[name], angles[finger - 1][segment - 1], head)
                if finger == segment == 1:
                    local = compose(local, rotate_at([0, 1, 0], opposition, head))
                if segment == 1 and adduction:
                    local = compose(local, rotate_at([0, 0, 1], adduction[finger - 1], head))
                matrices[name] = compose(matrices.get(bones[name]["parent"], identity), local)
        return matrices

    def bake(matrices):
        posed = []
        for point in extracted:
            position = [0, 0, 0]
            for name, weight in point["weights"].items():
                position = add(position, mul(apply(matrices.get(name, identity), point["position"]), weight))
            posed.append([position[k] * SCALES[k] for k in range(3)])
        return subdivide(posed, polygons)[0][: len(posed)]

    relaxed_pose = pose(RELAXED, OPPOSITION["relaxed"], ADDUCTION)
    grip_pose = pose(GRIP, OPPOSITION["grip"], None)
    relaxed, grip = bake(relaxed_pose), bake(grip_pose)
    shipped_relaxed = decode(shipped("gloves-relaxed.js"))
    shipped_grip = decode(shipped("gloves.js")["grip"])
    correspondence = max(max(math.dist(x, y) for x, y in zip(relaxed, shipped_relaxed)), max(math.dist(x, y) for x, y in zip(grip, shipped_grip)))
    assert len(relaxed) == len(shipped_relaxed) and correspondence < 1e-6, correspondence

    # The same smoothing pass that refined the posed vertices refines their weights.
    finger_weights = subdivide([[point["weights"].get(name, 0.0) for name in names] for point in extracted], polygons)[0][: len(extracted)]
    skin_index, skin_weight = [], []
    for row in finger_weights:
        total = max(0.0, min(1.0, sum(row)))
        kept = sorted(((value, b) for b, value in enumerate(row) if value > 1e-6), reverse=True)[:3]
        share = sum(value for value, _ in kept)
        parts = [(0, 1 - total)] + [(b + 1, value * total / share) for value, b in kept]
        units = [math.floor(value * 255) for _, value in parts]
        order = sorted(range(len(parts)), key=lambda k: parts[k][1] * 255 - units[k], reverse=True)
        for k in order[: 255 - sum(units)]:
            units[k] += 1
        parts = [(bone, unit_count) for (bone, _), unit_count in zip(parts, units)] + [(0, 0)] * (4 - len(parts))
        skin_index += [bone for bone, _ in parts]
        skin_weight += [unit_count for _, unit_count in parts]

    def skinned(target):
        worst = 0
        scale = [[SCALES[0], 0, 0, 0], [0, SCALES[1], 0, 0], [0, 0, SCALES[2], 0]]
        unscale = [[1 / SCALES[0], 0, 0, 0], [0, 1 / SCALES[1], 0, 0], [0, 0, 1 / SCALES[2], 0]]
        deltas = [identity] + [compose(scale, compose(target[name], compose(invert(relaxed_pose[name]), unscale))) for name in names]
        for i, rest in enumerate(relaxed):
            position = [0, 0, 0]
            for k in range(4):
                position = add(position, mul(apply(deltas[skin_index[i * 4 + k]], rest), skin_weight[i * 4 + k] / 255))
            worst = max(worst, math.dist(position, grip[i]))
        return worst

    deviation = skinned(grip_pose)
    assert deviation < 0.0025, deviation
    out = []
    for finger in range(1, 6):
        for segment in range(1, 4):
            name = f"finger{finger}-{segment}.L"
            parent = bones[name]["parent"]
            origin = bones[parent]["head"] if parent in names else [0, 0, 0]
            out.append({
                "name": f"{FINGERS[finger - 1]}{segment}",
                "parent": names.index(parent) if parent in names else -1,
                "head": [round(v, 7) + 0.0 for v in sub(bones[name]["head"], origin)],
                "axis": [round(v, 7) + 0.0 for v in axes[name]],
                "relaxed": RELAXED[finger - 1][segment - 1],
                "grip": GRIP[finger - 1][segment - 1],
            })
    data = {
        "scale": SCALES,
        "opposition": OPPOSITION,
        "adduction": ADDUCTION,
        "bones": out,
        "skinIndex": base64.b64encode(bytes(skin_index)).decode(),
        "skinWeight": base64.b64encode(bytes(skin_weight)).decode(),
    }
    OUTPUT.write_text("export default " + json.dumps(data, separators=(",", ":")) + ";\n")
    subprocess.run(["npm", "run", "format", "--", str(OUTPUT)], cwd=ROOT, check=True, capture_output=True)
    print(json.dumps({
        "vertices": len(relaxed),
        "correspondence": correspondence,
        "skinnedGripDeviation": deviation,
        "sources": {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in [("base.obj", SOURCE), ("default.mhskel", STUDY / "default.mhskel"), ("default_weights.mhw", STUDY / "default_weights.mhw")]},
        "output": {"bytes": OUTPUT.stat().st_size, "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest()},
    }, indent=2))


if __name__ == "__main__":
    main()

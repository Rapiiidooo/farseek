import base64
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "receipts/verification-realism/sources/base.obj"
STUDY = ROOT / "receipts/verification-upper-body/source-study"
RECEIPTS = ROOT / "receipts/verification-upper-body/gloves"
OUTPUT = ROOT / "game/assets/explorer/gloves.js"


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
    return mul(a, 1 / math.sqrt(dot(a, a)))


def mean(values):
    return [sum(v[i] for v in values) / len(values) for i in range(len(values[0]))]


def bounds(points):
    return [[min(p[k] for p in points), max(p[k] for p in points)] for k in range(3)]


def apply(matrix, p):
    return [dot(row[:3], p) + row[3] for row in matrix]


def compose(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] + [sum(a[i][k] * b[k][3] for k in range(3)) + a[i][3]] for i in range(3)]


def rotate_at(axis, degrees, point):
    x, y, z = unit(axis)
    angle = math.radians(degrees)
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    rows = [[t*x*x+c, t*x*y-s*z, t*x*z+s*y], [t*x*y+s*z, t*y*y+c, t*y*z-s*x], [t*x*z-s*y, t*y*z+s*x, t*z*z+c]]
    return [row + [point[i] - dot(row, point)] for i, row in enumerate(rows)]


def encode(values, kind):
    return base64.b64encode(struct.pack("<" + kind * len(values), *values)).decode()


def subdivide(points, faces):
    edges = defaultdict(list)
    touching = defaultdict(list)
    for fi, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted([a, b]))].append(fi)
            touching[a].append(fi)
    centers = [mean([points[i] for i in face]) for face in faces]
    incident = defaultdict(list)
    boundary = defaultdict(list)
    for edge, around in edges.items():
        a, b = edge
        incident[a].append(edge)
        incident[b].append(edge)
        if len(around) == 1:
            boundary[a].append(b)
            boundary[b].append(a)
    refined = []
    for i, point in enumerate(points):
        if i in boundary:
            assert len(boundary[i]) == 2
            refined.append(mul(add(mul(point, 6), add(*[points[j] for j in boundary[i]])), 1 / 8))
        else:
            n = len(incident[i])
            f = mean([centers[j] for j in touching[i]])
            r = mean([mean([points[a], points[b]]) for a, b in incident[i]])
            refined.append(mul(add(add(f, mul(r, 2)), mul(point, n - 3)), 1 / n))
    edge_ids = {}
    for edge, around in edges.items():
        edge_ids[edge] = len(refined)
        refined.append(mean([points[i] for i in edge] + [centers[i] for i in around]) if len(around) == 2 else mean([points[i] for i in edge]))
    face_start = len(refined)
    refined.extend(centers)
    polygons = []
    for fi, face in enumerate(faces):
        for j, a in enumerate(face):
            polygons.append([a, edge_ids[tuple(sorted([a, face[(j + 1) % len(face)]]))], face_start + fi, edge_ids[tuple(sorted([face[j - 1], a]))]])
    return refined, polygons


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
                extracted.append({"position": canonical(point["position"]), "weights": {name: value / total for name, value in w.items()}, "source": point["source"]})
            polygon.append(lookup[key])
        polygons.append(list(reversed(polygon)))
    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
    scales = [0.09, 0.097, 0.082]
    pose_angles = {
        "open": [[6, 9, 7], [8, 12, 8], [9, 13, 9], [10, 15, 10], [12, 17, 11]],
        "grip": [[18, 27, 24], [42, 60, 37], [45, 63, 39], [48, 65, 41], [52, 67, 43]],
    }
    data = {}
    report = {"source": {"baseMeshSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "weightsSha256": hashlib.sha256((STUDY / "default_weights.mhw").read_bytes()).hexdigest(), "skeletonSha256": hashlib.sha256((STUDY / "default.mhskel").read_bytes()).hexdigest(), "license": "CC0", "manifest": "../source-study/source-manifest.json"}, "sourceWrist": wrist, "sourceBasis": [t, a, p], "sourceForearm": forearm, "scales": scales, "sourceVertices": len(extracted), "sourcePolygons": len(polygons), "subdivisions": 0, "smoothingPasses": 1, "poses": {}}
    for mode, angles in pose_angles.items():
        matrices = {}
        for finger in range(1, 6):
            for segment in range(1, 4):
                name = f"finger{finger}-{segment}.L"
                bone = bones[name]
                direction = unit(sub(bone["tail"], bone["head"]))
                axis = unit(cross(direction, [0, 0, 1]))
                local = rotate_at(axis, angles[finger - 1][segment - 1], bone["head"])
                if finger == segment == 1:
                    local = compose(local, rotate_at([0, 1, 0], -12 if mode == "open" else -47, bone["head"]))
                matrices[name] = compose(matrices.get(bone["parent"], identity), local)
        posed = []
        for point in extracted:
            position = [0, 0, 0]
            for name, weight in point["weights"].items():
                position = add(position, mul(apply(matrices.get(name, identity), point["position"]), weight))
            posed.append([position[k] * scales[k] for k in range(3)])
        refined, _ = subdivide(posed, polygons)
        refined, quads = refined[:len(posed)], polygons
        rest, _ = subdivide([[point["position"][k] * scales[k] for k in range(3)] for point in extracted], polygons)
        rest = rest[:len(posed)]
        triangles = [j for face in quads for i in range(1, len(face) - 1) for j in [face[0], face[i], face[i + 1]]]
        uv = [value for point in rest for value in [point[0] / 0.045, point[1] / 0.045]]
        data[mode] = encode([value for point in refined for value in point], "f")
        if mode == "open":
            data["index"] = encode(triangles, "H")
            data["uv"] = encode(uv, "f")
        tips = {}
        for finger in range(1, 6):
            name = f"finger{finger}-3.L"
            point = apply(matrices[name], bones[name]["tail"])
            tips[str(finger)] = [point[k] * scales[k] for k in range(3)]
        edges = defaultdict(int)
        for face in quads:
            for x, y in zip(face, face[1:] + face[:1]):
                edges[tuple(sorted([x, y]))] += 1
        assert all(value <= 2 for value in edges.values())
        assert all(math.isfinite(value) for point in refined for value in point)
        report["poses"][mode] = {"anglesDegrees": angles, "thumbOppositionDegrees": -12 if mode == "open" else -47, "bounds": bounds(refined), "vertices": len(refined), "triangles": len(triangles) // 3, "boundaryEdges": sum(v == 1 for v in edges.values()), "nonmanifoldEdges": sum(v > 2 for v in edges.values()), "fingertips": tips}
        RECEIPTS.mkdir(parents=True, exist_ok=True)
        (RECEIPTS / f"{mode}.obj").write_text("\n".join(["v " + " ".join(str(value) for value in point) for point in refined] + ["f " + " ".join(str(i + 1) for i in face) for face in quads]) + "\n")
    OUTPUT.write_text("export default " + json.dumps(data, separators=(",", ":")) + ";\n")
    report["output"] = {"path": "../../../game/assets/explorer/gloves.js", "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), "bytes": OUTPUT.stat().st_size}
    (RECEIPTS / "build.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"verticesPerPose": report["poses"]["open"]["vertices"], "trianglesPerPose": report["poses"]["open"]["triangles"], "bytes": OUTPUT.stat().st_size}))


if __name__ == "__main__":
    main()

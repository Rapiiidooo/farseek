import json
import math
import base64
import struct
import subprocess
from collections import defaultdict
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "receipts/verification-realism/sources"
DEST = ROOT / "game/assets/explorer"
DEST.mkdir(parents=True, exist_ok=True)


def obj(path):
    vertices, uv, faces, groups = [], [], [], []
    group = ""
    for line in path.read_text().splitlines():
        values = line.split()
        if not values:
            continue
        if values[0] == "v":
            vertices.append(list(map(float, values[1:4])))
        elif values[0] == "vt":
            uv.append(list(map(float, values[1:3])))
        elif values[0] == "g":
            group = values[1]
        elif values[0] == "f":
            faces.append([tuple(int(x) - 1 for x in token.split("/")[:2]) for token in values[1:]])
            groups.append(group)
    return vertices, uv, faces, groups


def mean(points):
    return [sum(p[k] for p in points) / len(points) for k in range(len(points[0]))]


base, base_uv, base_faces, base_groups = obj(SOURCE / "base.obj")


def fit_proxy(path, count):
    scales = [1, 1, 1]
    fitted = []
    reading = False
    for line in path.read_text().splitlines():
        v = line.split()
        if not v or v[0].startswith("#"):
            continue
        if v[0] in ("x_scale", "y_scale", "z_scale"):
            axis = "xyz".index(v[0][0])
            scales[axis] = abs(base[int(v[1])][axis] - base[int(v[2])][axis]) / float(v[3])
        elif v[0] == "verts":
            reading = True
        elif reading and v[0].isdigit():
            if len(v) == 1:
                fitted.append(base[int(v[0])][:])
            elif len(v) == 9:
                ids = list(map(int, v[:3]))
                weights = list(map(float, v[3:6]))
                offsets = list(map(float, v[6:9]))
                fitted.append([sum(base[ids[j]][k] * weights[j] for j in range(3)) + offsets[k] * scales[k] for k in range(3)])
            if len(fitted) == count:
                break
    assert len(fitted) == count, (path, count, len(fitted))
    return fitted


def subdivide(vertices, faces):
    centers = [mean([vertices[i] for i in face]) for face in faces]
    edges = defaultdict(list)
    adjacent = defaultdict(list)
    for f, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append(f)
            adjacent[a].append(f)
    edge_ids = {}
    out = [p[:] for p in vertices]
    connected = defaultdict(list)
    boundary = defaultdict(list)
    for edge, sharing in edges.items():
        a, b = edge
        connected[a].append(b)
        connected[b].append(a)
        if len(sharing) == 1:
            point = mean([vertices[a], vertices[b]])
            boundary[a].append(b)
            boundary[b].append(a)
        else:
            assert len(sharing) == 2
            point = mean([vertices[a], vertices[b], centers[sharing[0]], centers[sharing[1]]])
        edge_ids[edge] = len(out)
        out.append(point)
    for i in adjacent:
        if boundary[i]:
            out[i] = [(vertices[i][k] * 6 + sum(vertices[j][k] for j in boundary[i])) / 8 for k in range(3)]
        else:
            n = len(connected[i])
            f = mean([centers[j] for j in adjacent[i]])
            r = mean([mean([vertices[i], vertices[j]]) for j in connected[i]])
            out[i] = [(f[k] + 2 * r[k] + (n - 3) * vertices[i][k]) / n for k in range(3)]
    face_offset = len(out)
    out.extend(centers)
    quads = []
    for f, face in enumerate(faces):
        for j, a in enumerate(face):
            b, previous = face[(j + 1) % len(face)], face[j - 1]
            quads.append([a, edge_ids[tuple(sorted((a, b)))], face_offset + f, edge_ids[tuple(sorted((previous, a)))]])
    return out, quads


def subdivide_uv(uv, faces):
    values, new_faces = [], []
    for face in faces:
        corners = [uv[i] for i in face]
        center = mean(corners)
        for j, corner in enumerate(corners):
            offset = len(values)
            values.extend([corner, mean([corner, corners[(j + 1) % len(face)]]), center, mean([corner, corners[j - 1]])])
            new_faces.append(list(range(offset, offset + 4)))
    return values, new_faces


def transform(p):
    return [p[0] * 0.09, p[1] * 0.09 + 0.975983, p[2] * 0.09 - 0.054]


def export_mesh(name, vertices, uv, faces, smooth=False, morphs=None):
    ids = sorted({i for face in faces for i, _ in face})
    remap = {old: new for new, old in enumerate(ids)}
    v = [vertices[i] for i in ids]
    pf = [[remap[i] for i, _ in face] for face in faces]
    uf = [[j for _, j in face] for face in faces]
    targets = {key: [value[i] for i in ids] for key, value in (morphs or {}).items()}
    if smooth:
        for key in targets:
            targets[key], _ = subdivide(targets[key], pf)
        v, new_pf = subdivide(v, pf)
        uv, uf = subdivide_uv(uv, uf)
        pf = new_pf
    normals = [[0, 0, 0] for _ in v]
    for face in pf:
        for j in range(1, len(face) - 1):
            a, b, c = (v[face[k]] for k in (0, j, j + 1))
            ab, ac = [b[k] - a[k] for k in range(3)], [c[k] - a[k] for k in range(3)]
            n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
            for i in (face[0], face[j], face[j + 1]):
                normals[i] = [normals[i][k] + n[k] for k in range(3)]
    for i, n in enumerate(normals):
        length = math.sqrt(sum(x * x for x in n)) or 1
        normals[i] = [x / length for x in n]
    packed = {"position": [], "normal": [], "uv": [], "index": [], "morphs": {k: [] for k in targets}}
    corners = {}
    for face, uv_face in zip(pf, uf):
        indices = []
        for i, j in zip(face, uv_face):
            key = (i, *(round(x, 7) for x in uv[j]))
            if key not in corners:
                corners[key] = len(corners)
                packed["position"].extend(round(x, 7) for x in transform(v[i]))
                packed["normal"].extend(round(x, 5) for x in normals[i])
                packed["uv"].extend(round(x, 7) for x in uv[j])
                for target, values in targets.items():
                    packed["morphs"][target].extend(round(x, 7) for x in transform(values[i]))
            indices.append(corners[key])
        for j in range(1, len(indices) - 1):
            packed["index"].extend([indices[0], indices[j], indices[j + 1]])
    encode = lambda values, kind: base64.b64encode(struct.pack("<" + kind * len(values), *values)).decode()
    binary = {
        "position": encode(packed["position"], "f"),
        "normal": encode([round(x * 32767) for x in packed["normal"]], "h"),
        "uv": encode([round(x * 65535) for x in packed["uv"]], "H"),
        "index": encode(packed["index"], "H"),
        "morphs": {},
    }
    for key, values in packed["morphs"].items():
        changes = []
        for i in range(len(corners)):
            delta = [round((values[i * 3 + k] - packed["position"][i * 3 + k]) * 1000000) for k in range(3)]
            if any(delta):
                changes.extend([i, *delta])
        binary["morphs"][key] = encode(changes, "i")
    path = DEST / (name + ".js")
    path.write_text("export default " + json.dumps(binary, separators=(",", ":")) + ";\n")
    print(name, len(corners), "vertices", len(packed["index"]) // 3, "triangles", path.stat().st_size, "bytes")


head_faces = [face for face, group in zip(base_faces, base_groups) if group == "body" and min(base[i][1] for i, _ in face) >= 5.8]
targets = {}
for name, components in {
    "blink": [("eyeBlinkLeft", 1), ("eyeBlinkRight", 1)],
    "effort": [("eyeSquintLeft", 0.4), ("eyeSquintRight", 0.4), ("browDownLeft", 0.15), ("browDownRight", 0.15)],
    "breathe": [("jawOpen", 0.13)],
}.items():
    target = [p[:] for p in base]
    for component, weight in components:
        for line in (SOURCE / "faceunits" / (component + ".target")).read_text().splitlines():
            values = line.split()
            if len(values) == 4 and values[0].isdigit():
                i = int(values[0])
                for k in range(3):
                    target[i][k] += float(values[k + 1]) * weight
    targets[name] = target
rest_head = [[p[k] + (targets["blink"][i][k] - p[k]) * 0.05 for k in range(3)] for i, p in enumerate(base)]
for name in ("effort", "breathe"):
    targets[name] = [[p[k] + rest_head[i][k] - base[i][k] for k in range(3)] for i, p in enumerate(targets[name])]
export_mesh("head", rest_head, base_uv, head_faces, smooth=True, morphs=targets)
for name, directory, stem in [
    ("hair", "hair/ponytail01", "ponytail01"),
    ("brows", "eyebrows/eyebrow005", "eyebrow005"),
    ("eyes", "eyes/high-poly", "high-poly"),
]:
    source = SOURCE / directory
    vertices, uv, faces, _ = obj(source / (stem + ".obj"))
    fitted = fit_proxy(source / (stem + ".mhclo"), len(vertices))
    if name == "eyes":
        for side, sign in (("left", 1), ("right", -1)):
            half = [face for face in faces if mean([fitted[i] for i, _ in face])[0] * sign > 0]
            export_mesh(side + "-eye", fitted, uv, half)
    elif name == "hair":
        targets = {"sway": [], "lift": []}
        for p in fitted:
            weight = max(0, min(1, (7.15 - p[1]) / 1.45)) ** 1.6
            weight *= max(0, min(1, (-p[2] - 0.35) / 0.35))
            targets["sway"].append([p[0] + 0.18 * weight, p[1], p[2]])
            targets["lift"].append([p[0], p[1] + 0.09 * weight, p[2] - 0.18 * weight])
        export_mesh(name, fitted, uv, faces, morphs=targets)
    else:
        export_mesh(name, fitted, uv, faces)

for source, name in [
    ("skins/young_caucasian_female2/young_lightskinned_female_diffuse2.png", "skin.webp"),
    ("hair/ponytail01/ponytail01_diffuse.png", "hair.webp"),
    ("eyebrows/eyebrow005/eyebrow005.png", "brows.webp"),
    ("eyes/materials/brown_eye.png", "eyes.webp"),
    ("LICENSE.ASSETS.md", "LICENSE-CC0.txt"),
]:
    if name.endswith(".webp"):
        subprocess.run(["cwebp", "-quiet", "-q", "92", "-m", "6", str(SOURCE / source), "-o", str(DEST / name)], check=True)
    else:
        shutil.copyfile(SOURCE / source, DEST / name)

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeSurface(THREE, kind) {
  const size = 128;
  const heights = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + 17.23) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grain = hash(x, y);
      const weave = Math.sin((x * TAU) / 4) * Math.sin((y * TAU) / 4);
      const soft = Math.sin((x * TAU) / 32 + Math.sin((y * TAU) / 32)) * 0.5;
      const h =
        kind === "leather"
          ? grain * 0.55 + soft * 0.25
          : weave * 0.43 + grain * 0.18;
      heights[i] = h;
      const shade =
        kind === "leather"
          ? 230 + grain * 18 + soft * 7
          : 235 + weave * 8 + grain * 10;
      const rough = kind === "leather" ? 181 + grain * 39 : 224 + weave * 11;
      for (let c = 0; c < 3; c++) {
        albedo[i * 4 + c] = shade;
        roughness[i * 4 + c] = rough;
      }
      albedo[i * 4 + 3] = roughness[i * 4 + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (xx, yy) =>
        heights[((yy + size) % size) * size + ((xx + size) % size)];
      const dx = (at(x - 1, y) - at(x + 1, y)) * 0.55;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.55;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = ((dx / length) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      normal[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const texture = (data, color = false) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    if (color) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    map: texture(albedo, true),
    roughnessMap: texture(roughness),
    normalMap: texture(normal),
  };
}

function partsOf(THREE, geometry) {
  const index = geometry.index;
  const count = geometry.attributes.position.count;
  const links = new Int32Array(count);
  for (let i = 0; i < count; i++) links[i] = i;
  const root = (i) => {
    while (links[i] !== i) {
      links[i] = links[links[i]];
      i = links[i];
    }
    return i;
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = root(index.getX(i));
    links[root(index.getX(i + 1))] = a;
    links[root(index.getX(i + 2))] = a;
  }
  const parts = new Map();
  const p = geometry.attributes.position;
  for (let i = 0; i < index.count; i += 3) {
    const k = root(index.getX(i));
    if (!parts.has(k)) parts.set(k, { indices: [], box: new THREE.Box3() });
    const part = parts.get(k);
    for (let j = 0; j < 3; j++) {
      const n = index.getX(i + j);
      part.indices.push(n);
      part.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, n));
    }
  }
  return [...parts.values()];
}

function subset(THREE, geometry, indices) {
  const remap = new Map();
  const old = [];
  const index = indices.map((i) => {
    if (!remap.has(i)) {
      remap.set(i, old.length);
      old.push(i);
    }
    return remap.get(i);
  });
  const result = new THREE.BufferGeometry();
  for (const [key, source] of Object.entries(geometry.attributes)) {
    const data = new source.array.constructor(old.length * source.itemSize);
    old.forEach((v, i) => {
      for (let c = 0; c < source.itemSize; c++)
        data[i * source.itemSize + c] = source.array[v * source.itemSize + c];
    });
    result.setAttribute(
      key,
      new THREE.BufferAttribute(data, source.itemSize, source.normalized),
    );
  }
  result.setIndex(index);
  return result;
}

function subdivide(THREE, geometry, passes) {
  let out = geometry;
  for (let pass = 0; pass < passes; pass++) {
    const p = [...out.attributes.position.array];
    const index = out.index.array;
    const cache = new Map(),
      next = [];
    const mid = (a, b) => {
      const key = a < b ? a + ":" + b : b + ":" + a;
      if (cache.has(key)) return cache.get(key);
      const n = p.length / 3;
      for (let c = 0; c < 3; c++) p.push((p[a * 3 + c] + p[b * 3 + c]) / 2);
      cache.set(key, n);
      return n;
    };
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i],
        b = index[i + 1],
        c = index[i + 2];
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    geometry.setIndex(next);
    out.dispose();
    out = geometry;
  }
  out.computeVertexNormals();
  return out;
}

export function attachRealisticOutfit(THREE, group) {
  const J = group.userData.joints;
  const shift = J.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const materials = new Map();
  group.traverse((o) => {
    if (o.isMesh && !Array.isArray(o.material))
      materials.set(o.material.color.getHex(), o.material);
  });
  const indigo = materials.get(0x2d3656);
  const canvas = materials.get(0xcdbf9f);
  const clothMaps = makeSurface(THREE, "cloth");
  const leatherMaps = makeSurface(THREE, "leather");
  const textured = new Set();
  const physical = new Map();
  const clothColors = new Set([
    0x2d3656, 0xc2412d, 0xcdbf9f, 0x6b6a45, 0xa99b78, 0x55617b,
  ]);
  const leatherColors = new Set([0x4b2e1e, 0x352820]);
  group.traverse((o) => {
    if (!o.isMesh || o.parent === J.head) return;
    const old = o.material;
    const hex = old.color.getHex();
    if (!clothColors.has(hex) && !leatherColors.has(hex)) return;
    if (!physical.has(old)) {
      const isLeather = leatherColors.has(hex);
      const m = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(m, old);
      Object.assign(m, isLeather ? leatherMaps : clothMaps);
      m.normalScale.setScalar(isLeather ? 0.28 : 0.19);
      m.roughness = isLeather ? 0.76 : 0.96;
      m.sheen = isLeather ? 0 : 0.22;
      m.sheenRoughness = 0.8;
      m.sheenColor.copy(old.color).multiplyScalar(0.7);
      m.vertexColors = true;
      m.name = isLeather ? "explorer.leather" : "explorer.cloth";
      physical.set(old, m);
    }
    o.material = physical.get(old);
    textured.add(o);
  });
  const cloth = physical.get(indigo);
  const trouser = physical.get(canvas);
  const removeMaterials = (joint, colors) => {
    for (const mesh of [...joint.children]) {
      if (mesh.isMesh && colors.includes(mesh.material.color.getHex())) {
        joint.remove(mesh);
        mesh.geometry.dispose();
        textured.delete(mesh);
      }
    }
  };
  for (const side of ["left", "right"]) {
    removeMaterials(J[side + "UpperArm"], [0x2d3656]);
    removeMaterials(J[side + "LowerArm"], [0x2d3656, 0xcdbf9f]);
    for (const mesh of [...J[side + "UpperLeg"].children]) {
      if (
        !mesh.isMesh ||
        ![0xcdbf9f, 0xa99b78, 0x9a6a35].includes(mesh.material.color.getHex())
      )
        continue;
      const pocket = partsOf(THREE, mesh.geometry)
        .filter(({ box }) => {
          const center = box.getCenter(new THREE.Vector3());
          return Math.abs(center.x) > 0.065 && box.max.y - box.min.y < 0.15;
        })
        .flatMap(({ indices }) => indices);
      if (pocket.length) {
        const old = mesh.geometry;
        mesh.geometry = subset(THREE, old, pocket);
        old.dispose();
      } else {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        textured.delete(mesh);
      }
    }
    removeMaterials(J[side + "LowerLeg"], [0xa99b78]);
    const leg = J[side + "LowerLeg"];
    const foot = new THREE.Group();
    foot.name = side + "Foot";
    foot.position.set(0, -0.37, 0);
    leg.add(foot);
    J[side + "Foot"] = foot;
    for (const mesh of [...leg.children]) {
      if (!mesh.isMesh) continue;
      const keep = [],
        move = [];
      for (const part of partsOf(THREE, mesh.geometry)) {
        const center = part.box.getCenter(new THREE.Vector3());
        const isBoot = center.y < -0.2;
        (isBoot ? move : keep).push(...part.indices);
      }
      if (move.length) {
        const geo = subset(THREE, mesh.geometry, move);
        geo.translate(0, 0.37, 0);
        const moved = new THREE.Mesh(geo, mesh.material);
        foot.add(moved);
        if (textured.has(mesh)) textured.add(moved);
      }
      if (keep.length) {
        const original = mesh.geometry;
        mesh.geometry = subset(THREE, original, keep);
        original.dispose();
      } else {
        leg.remove(mesh);
        mesh.geometry.dispose();
        textured.delete(mesh);
      }
    }
    removeMaterials(leg, [0xcdbf9f]);
  }
  const secondary = (group.userData.secondary ||= {});
  const extractKit = (joint, name, pivot, select) => {
    const handle = new THREE.Group();
    handle.name = name;
    handle.position.copy(pivot);
    joint.add(handle);
    for (const mesh of [...joint.children]) {
      if (!mesh.isMesh) continue;
      const keep = [],
        move = [];
      for (const part of partsOf(THREE, mesh.geometry))
        (select(part.box, mesh.material) ? move : keep).push(...part.indices);
      if (!move.length) continue;
      const moved = new THREE.Mesh(
        subset(THREE, mesh.geometry, move),
        mesh.material,
      );
      moved.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      handle.add(moved);
      if (textured.has(mesh)) textured.add(moved);
      if (keep.length) {
        const old = mesh.geometry;
        mesh.geometry = subset(THREE, old, keep);
        old.dispose();
      } else {
        joint.remove(mesh);
        mesh.geometry.dispose();
        textured.delete(mesh);
      }
    }
    return handle;
  };
  secondary.backpack = extractKit(
    J.spine,
    "explorerBackpack",
    new THREE.Vector3(0, 0.31, -0.17),
    (box) => {
      const c = box.getCenter(new THREE.Vector3());
      return c.z < -0.15 && c.y > 0.025;
    },
  );
  secondary.satchel = extractKit(
    J.hips,
    "explorerSatchel",
    new THREE.Vector3(-0.2, -0.01, -0.13),
    (box, mat) => {
      const c = box.getCenter(new THREE.Vector3());
      return (
        c.x < -0.17 &&
        c.y < -0.005 &&
        [0x4b2e1e, 0x9a6a35].includes(mat.color.getHex())
      );
    },
  );

  for (const mesh of secondary.backpack.children) {
    if (mesh.material.color.getHex() !== 0x6b6a45) continue;
    mesh.geometry = subdivide(THREE, mesh.geometry, 2);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const panel = Math.exp(-((x / 0.11) ** 4) - ((y + 0.14) / 0.105) ** 4);
      const back = smooth(-0.02, -0.045, z);
      const fold =
        Math.sin(x * 94 + y * 31) *
        0.0014 *
        Math.exp(-(((Math.abs(x) - 0.1) / 0.035) ** 2));
      positions.setZ(i, z - back * (panel * 0.017 + fold));
    }
    mesh.geometry.computeVertexNormals();
  }
  for (const joint of [J.hips, J.leftUpperLeg, J.rightUpperLeg]) {
    removeMaterials(joint, [0x2d3656]);
    if (joint === J.hips) removeMaterials(joint, [0xcdbf9f]);
    for (const mesh of joint.children) {
      if (!mesh.isMesh) continue;
      const hex = mesh.material.color.getHex();
      const p = mesh.geometry.attributes.position;
      if (joint !== J.hips || ![0x4b2e1e, 0x9a6a35].includes(hex)) continue;
      for (const part of partsOf(THREE, mesh.geometry)) {
        const center = part.box.getCenter(new THREE.Vector3());
        const belt = part.box.max.x - part.box.min.x > 0.32 && center.y > 0;
        const buckle =
          Math.abs(center.x) < 0.05 && center.z > 0.12 && center.y > 0.02;
        if (!belt && !buckle) continue;
        for (const i of new Set(part.indices))
          p.setY(i, 0.06 + (p.getY(i) - 0.06) * (belt ? 0.62 : 0.82));
      }
      mesh.geometry.computeVertexNormals();
    }
  }
  for (const mesh of J.spine.children) {
    if (!mesh.isMesh || mesh.material.color.getHex() !== 0x2d3656) continue;
    const p = mesh.geometry.attributes.position;
    for (const part of partsOf(THREE, mesh.geometry)) {
      if (part.box.max.y - part.box.min.y < 0.45) continue;
      for (const i of new Set(part.indices)) {
        const x = p.getX(i),
          y = p.getY(i) + 1.05,
          z = p.getZ(i);
        const a = Math.atan2(x, z);
        const waist = Math.exp(-(((y - 1.12) / 0.075) ** 2));
        const fold =
          waist *
          (Math.sin(y * 107 + a * 2.8) * 0.0022 +
            Math.sin(y * 58 - a * 3) * 0.0013);
        const tuckedY = y + 0.05 * (1 - smooth(0.972, 1.09, y));
        p.setXYZ(
          i,
          x + Math.sin(a) * fold,
          tuckedY - 1.05,
          z + Math.cos(a) * fold,
        );
      }
    }
    mesh.geometry.computeVertexNormals();
  }

  class ExplorerCloth extends THREE.SkinnedMesh {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.rigNames = [...source.rigNames];
      this.rigInverses = source.rigInverses.map((m) => m.clone());
      this.rigOwner = null;
      return this;
    }
    updateMatrixWorld(force) {
      super.updateMatrixWorld(force);
      if (!this.parent || !this.rigNames || this.rigOwner === this.parent)
        return;
      const bones = this.rigNames.map((name) =>
        this.parent.getObjectByName(name),
      );
      if (bones.some((bone) => !bone)) return;
      this.skeleton = new THREE.Skeleton(
        bones,
        this.rigInverses.map((m) => m.clone()),
      );
      this.rigOwner = this.parent;
    }
  }
  group.updateMatrixWorld(true);
  const bindCloth = (name, geo, material, names) => {
    const mesh = new ExplorerCloth(geo, material);
    mesh.name = name;
    mesh.rigNames = names;
    mesh.rigInverses = names.map((n) => J[n].matrixWorld.clone().invert());
    mesh.skeleton = new THREE.Skeleton(
      names.map((n) => J[n]),
      mesh.rigInverses.map((m) => m.clone()),
    );
    mesh.bind(mesh.skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  for (const side of ["left", "right"]) {
    const foot = J[side + "Foot"];
    let partNumber = 0;
    for (const mesh of [...foot.children]) {
      const keep = [],
        flex = [];
      for (const part of partsOf(THREE, mesh.geometry)) {
        const center = part.box.getCenter(new THREE.Vector3());
        (center.y + 0.13 > 0.145 ? flex : keep).push(...part.indices);
      }
      if (!flex.length) continue;
      const geometry = subset(THREE, mesh.geometry, flex).applyMatrix4(
        foot.matrixWorld,
      );
      const p = geometry.attributes.position;
      const indices = new Uint16Array(p.count * 4),
        weights = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const shin = smooth(0.115, 0.235, p.getY(i) - shift.y);
        indices[i * 4 + 1] = 1;
        weights[i * 4] = shin;
        weights[i * 4 + 1] = 1 - shin;
      }
      geometry.setAttribute("skinIndex", new THREE.BufferAttribute(indices, 4));
      geometry.setAttribute(
        "skinWeight",
        new THREE.BufferAttribute(weights, 4),
      );
      const flexed = bindCloth(
        side + "BootFlex" + partNumber++,
        geometry,
        mesh.material,
        [side + "LowerLeg", side + "Foot"],
      );
      if (textured.has(mesh)) textured.add(flexed);
      if (keep.length) {
        const old = mesh.geometry;
        mesh.geometry = subset(THREE, old, keep);
        old.dispose();
      } else {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        textured.delete(mesh);
      }
    }
  }
  const makeCloth = (name, material, names, rings, sides, at, weights) => {
    const positions = [],
      uv = [],
      colors = [],
      indices = [],
      skinIndex = [],
      skinWeight = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        const weight = weights(t, a);
        const { point, shade, length, radius } = at(t, a);
        positions.push(...point.add(shift).toArray());
        uv.push((a * radius) / 0.085, length / 0.085);
        colors.push(shade, shade, shade);
        skinIndex.push(0, 1, 2, names.length > 3 ? 3 : 0);
        skinWeight.push(
          weight[0] || 0,
          weight[1] || 0,
          weight[2] || 0,
          weight[3] || 0,
        );
      }
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i,
          b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(skinIndex, 4),
    );
    geo.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(skinWeight, 4),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const normals = geo.attributes.normal;
    const normal = new THREE.Vector3();
    for (let j = 0; j <= rings; j++) {
      const first = j * (sides + 1),
        last = first + sides;
      const firstPoint = new THREE.Vector3().fromBufferAttribute(
        geo.attributes.position,
        first,
      );
      const lastPoint = new THREE.Vector3().fromBufferAttribute(
        geo.attributes.position,
        last,
      );
      if (firstPoint.distanceToSquared(lastPoint) > 1e-10) continue;
      normal
        .fromBufferAttribute(normals, first)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    return bindCloth(name, geo, material, names);
  };
  const profile = (rows, t) => {
    const index = Math.max(
      0,
      Math.min(rows.length - 2, rows.findIndex((r) => r[0] >= t) - 1),
    );
    const a = rows[index],
      b = rows[index + 1];
    const u = smooth(a[0], b[0], t);
    return a[1] + (b[1] - a[1]) * u;
  };
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const shoulder = J[side + "UpperArm"]
      .getWorldPosition(new THREE.Vector3())
      .sub(shift);
    const elbow = J[side + "LowerArm"]
      .getWorldPosition(new THREE.Vector3())
      .sub(shift);
    const wrist = J[side + "Hand"]
      .getWorldPosition(new THREE.Vector3())
      .sub(shift);
    const upperDir = elbow.clone().sub(shoulder).normalize();
    const lowerDir = wrist.clone().sub(elbow).normalize();
    const length = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) - 0.036;
    const shoulderStart = shoulder
      .clone()
      .add(new THREE.Vector3(-sign * 0.062, 0.007, 0));
    const cuff = wrist.clone().addScaledVector(lowerDir, -0.036);
    const axis = new THREE.CatmullRomCurve3([
      shoulderStart,
      shoulder.clone().addScaledVector(upperDir, 0.12),
      elbow,
      elbow.clone().lerp(cuff, 0.55),
      cuff,
    ]);
    const elbowT = 0.316 / (length + 0.027);
    makeCloth(
      side + "JacketSleeve",
      cloth,
      ["spine", side + "UpperArm", side + "LowerArm"],
      56,
      36,
      (t, a) => {
        const center = axis.getPointAt(t);
        const tangent = axis.getTangentAt(t);
        const right = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
        const forward = tangent.clone().cross(right).normalize();
        let radius = profile(
          [
            [0, 0],
            [0.075, 0.044],
            [0.16, 0.059],
            [0.3, 0.054],
            [0.54, 0.046],
            [0.65, 0.047],
            [0.86, 0.039],
            [1, 0.037],
          ],
          t,
        );
        const elbowFold = Math.exp(-(((t - elbowT) / 0.105) ** 2));
        const cuffFold = Math.exp(-(((t - 0.94) / 0.12) ** 2));
        const fold =
          0.0045 * elbowFold * Math.sin(t * 93 + Math.sin(a * 2 + sign) * 1.9) +
          0.0026 * cuffFold * Math.sin(t * 101 + a * 1.8) +
          0.0017 * Math.sin(a * 4 + t * 12 + sign) * Math.sin(t * Math.PI);
        radius += fold;
        const seam =
          Math.exp(
            -(
              (Math.atan2(
                Math.sin(a - sign * 0.65),
                Math.cos(a - sign * 0.65),
              ) /
                0.07) **
              2
            ),
          ) * 0.001;
        const point = center
          .addScaledVector(right, Math.sin(a) * (radius + seam))
          .addScaledVector(forward, Math.cos(a) * (radius * 0.91 + seam));
        return {
          point,
          radius,
          length: t * length,
          shade: 0.96 + fold * 4 + 0.028 * Math.cos(a * 3 + t * 5),
        };
      },
      (t) => {
        const torso = 1 - smooth(0, 0.23, t);
        const lower = smooth(elbowT - 0.13, elbowT + 0.13, t);
        return [torso, (1 - torso) * (1 - lower), (1 - torso) * lower];
      },
    );
    makeCloth(
      side + "FieldTrousers",
      trouser,
      [
        "hips",
        side + "UpperLeg",
        side + "LowerLeg",
        (side === "left" ? "right" : "left") + "UpperLeg",
      ],
      80,
      48,
      (t, a) => {
        const y = 1.006 - t * 0.706;
        const angle = (sign > 0 ? a : TAU - a) - Math.PI / 2;
        let radius = profile(
          [
            [0, 0.09],
            [0.27, 0.092],
            [0.44, 0.085],
            [0.7, 0.071],
            [0.78, 0.067],
            [0.94, 0.073],
            [1, 0.071],
          ],
          t,
        );
        const knee = Math.exp(-(((y - 0.51) / 0.08) ** 2));
        const ankle = Math.exp(-(((y - 0.335) / 0.047) ** 2));
        const fold =
          0.0036 *
            knee *
            (0.55 - 0.45 * Math.cos(a)) *
            Math.sin(y * 94 + Math.sin(a * 2 + sign) * 2.7) +
          0.0028 * ankle * Math.sin(y * 117 + a * 1.7) +
          0.0015 * Math.sin(a * 4 + t * 9) * Math.sin(t * Math.PI);
        radius += fold;
        const outer = Math.exp(
          -(
            (Math.atan2(
              Math.sin(a - (sign * Math.PI) / 2),
              Math.cos(a - (sign * Math.PI) / 2),
            ) /
              0.055) **
            2
          ),
        );
        const rise = smooth(0.805, 0.985, y);
        const inside = Math.max(0, -Math.sin(angle)) ** 4;
        const join = smooth(0.775, 0.805, y);
        const legX =
          0.1 + Math.sin(angle) * radius - (0.1 - radius) * inside * join;
        const half = (angle + Math.PI / 2) / 2;
        const waistX = Math.sin(half) * 0.178;
        const waistZ = Math.cos(half) * 0.116;
        const point = new THREE.Vector3(
          sign * THREE.MathUtils.lerp(legX, waistX, rise),
          y,
          THREE.MathUtils.lerp(Math.cos(angle) * radius * 0.95, waistZ, rise) -
            0.004 * (1 - rise),
        );
        const dust = 0.035 * smooth(0.53, 0.9, t) * (0.5 + 0.5 * Math.cos(a));
        return {
          point,
          radius,
          length: t * 0.706,
          shade: 0.94 + fold * 4 + dust + outer * 0.022,
        };
      },
      (t, a) => {
        const y = 1.006 - t * 0.706;
        const hip = smooth(0.855, 0.985, y);
        const lower = 1 - smooth(0.445, 0.555, y);
        const seam =
          Math.exp(-((Math.atan2(Math.sin(a), Math.cos(a)) / 0.42) ** 2)) *
          smooth(0.745, 0.805, y);
        const upper = (1 - hip) * (1 - lower);
        return [
          hip,
          upper * (1 - seam * 0.5),
          (1 - hip) * lower,
          upper * seam * 0.5,
        ];
      },
    );
  }
  const leftTrousers = group.getObjectByName("leftFieldTrousers").geometry;
  const rightTrousers = group.getObjectByName("rightFieldTrousers").geometry;
  const lp = leftTrousers.attributes.position,
    rp = rightTrousers.attributes.position;
  const ln = leftTrousers.attributes.normal,
    rn = rightTrousers.attributes.normal;
  for (let row = 0; row <= 80; row++) {
    for (const [left, right] of [
      [row * 49, row * 49 + 48],
      [row * 49 + 48, row * 49],
    ]) {
      const l = new THREE.Vector3().fromBufferAttribute(lp, left);
      const r = new THREE.Vector3().fromBufferAttribute(rp, right);
      if (l.distanceToSquared(r) > 1e-10) continue;
      const normal = new THREE.Vector3()
        .fromBufferAttribute(ln, left)
        .add(new THREE.Vector3().fromBufferAttribute(rn, right))
        .normalize();
      ln.setXYZ(left, normal.x, normal.y, normal.z);
      rn.setXYZ(right, normal.x, normal.y, normal.z);
    }
  }
  group.updateMatrixWorld(true);
  for (const mesh of textured) {
    if (!mesh.parent) continue;
    const geo = mesh.geometry;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    const uv = new Float32Array(p.count * 2);
    const point = new THREE.Vector3();
    const origin = group.matrixWorld.clone().invert();
    const world = origin.multiply(mesh.matrixWorld);
    const leatherSurface = mesh.material.name === "explorer.leather";
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(world).sub(shift);
      const nx = Math.abs(n.getX(i)),
        ny = Math.abs(n.getY(i)),
        nz = Math.abs(n.getZ(i));
      const scale = leatherSurface ? 0.11 : 0.085;
      uv[i * 2] = (nx > nz && nx > ny ? point.z : point.x) / scale;
      uv[i * 2 + 1] = (ny > nx && ny > nz ? point.z : point.y) / scale;
      const variation =
        Math.sin(point.x * 63 + point.y * 17) *
        Math.sin(point.z * 47 - point.y * 21);
      const wear = leatherSurface
        ? 0.035 * (0.5 + variation * 0.5)
        : 0.018 * variation;
      let shade = 0.97 + wear;
      if (point.y < 0.15) shade += 0.025 * (1 - smooth(0.04, 0.15, point.y));
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const palette = new Map([
    [0x2d3656, 0x424957],
    [0xc2412d, 0xa34c39],
    [0xcdbf9f, 0xb5a489],
    [0x4b2e1e, 0x514036],
    [0x6b6a45, 0x646249],
    [0x55617b, 0x626877],
  ]);
  const recolored = new Set();
  group.traverse((mesh) => {
    if (!mesh.isMesh || recolored.has(mesh.material)) return;
    const color = palette.get(mesh.material.color.getHex());
    if (color === undefined) return;
    mesh.material.color.setHex(color);
    if (mesh.material.sheenColor)
      mesh.material.sheenColor.copy(mesh.material.color).multiplyScalar(0.7);
    recolored.add(mesh.material);
  });
  group.userData.appearance = {
    version: 6,
    clothing: "skinned",
    textures: "procedural-pbr",
    feet: "articulated",
  };
  return group;
}

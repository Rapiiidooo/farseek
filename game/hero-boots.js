const TAU = Math.PI * 2;
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function attachRefinedBoots(THREE, group) {
  const J = group.userData.joints;
  const former = group.getObjectByName("leftBootFlex1");
  if (!former || group.userData.appearance?.boots === "sculpted") return group;
  const leather = former.material.clone();
  leather.name = "explorer.bootLeather";
  leather.roughness = 0.71;
  leather.normalScale.setScalar(0.16);
  leather.clearcoat = 0.04;
  leather.clearcoatRoughness = 0.65;
  const tongueMaterial = leather.clone();
  tongueMaterial.color.multiplyScalar(0.84);
  const rubber = leather.clone();
  rubber.name = "explorer.bootRubber";
  rubber.color.setHex(0x292823);
  rubber.roughness = 0.97;
  rubber.clearcoat = 0;
  const laceMaterial = leather.clone();
  laceMaterial.name = "explorer.bootLaces";
  laceMaterial.color.setHex(0x827767);
  laceMaterial.roughness = 0.94;
  laceMaterial.clearcoat = 0;
  const eyeletMaterial = new THREE.MeshStandardMaterial({
    color: 0x554d3f,
    roughness: 0.65,
    metalness: 0.65,
    vertexColors: true,
  });

  class BootSkin extends THREE.SkinnedMesh {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.rigNames = [...source.rigNames];
      this.rigInverses = source.rigInverses.map((matrix) => matrix.clone());
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
        this.rigInverses.map((matrix) => matrix.clone()),
      );
      this.rigOwner = this.parent;
    }
  }

  const geometry = (rows, columns, at, closed = true) => {
    const positions = [],
      uv = [],
      colors = [],
      indices = [];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= columns; i++) {
        const point = at(j / rows, i / columns);
        positions.push(...point.toArray());
        uv.push((i / columns) * 3.5, (j / rows) * 3.8);
        const shade = 0.95 + Math.sin(point.x * 48 + point.y * 21) * 0.018;
        colors.push(shade, shade, shade);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns; i++) {
        const a = j * (columns + 1) + i,
          b = a + columns + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    if (closed) {
      const normal = result.attributes.normal;
      for (let j = 0; j <= rows; j++) {
        const first = j * (columns + 1),
          last = first + columns;
        const n = new THREE.Vector3()
          .fromBufferAttribute(normal, first)
          .add(new THREE.Vector3().fromBufferAttribute(normal, last))
          .normalize();
        normal.setXYZ(first, n.x, n.y, n.z);
        normal.setXYZ(last, n.x, n.y, n.z);
      }
    }
    return result;
  };
  const combine = (geometries) => {
    const positions = [],
      normals = [],
      uv = [],
      colors = [],
      indices = [];
    for (const geo of geometries) {
      const offset = positions.length / 3;
      const p = geo.attributes.position;
      positions.push(...p.array);
      normals.push(...geo.attributes.normal.array);
      uv.push(...geo.attributes.uv.array);
      for (let i = 0; i < p.count; i++) colors.push(0.96, 0.96, 0.96);
      for (const index of geo.index.array) indices.push(index + offset);
      geo.dispose();
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    result.setIndex(indices);
    return result;
  };
  const tube = (points, radius, segments = 16, closed = false) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, closed),
      segments,
      radius,
      5,
      closed,
    );
  const table = [
    [0.019, 0.058, 0.194, -0.104],
    [0.039, 0.059, 0.197, -0.104],
    [0.058, 0.056, 0.184, -0.101],
    [0.077, 0.051, 0.157, -0.097],
    [0.1, 0.047, 0.112, -0.088],
    [0.126, 0.046, 0.076, -0.075],
    [0.152, 0.049, 0.072, -0.073],
    [0.19, 0.057, 0.073, -0.077],
    [0.235, 0.065, 0.078, -0.082],
    [0.285, 0.073, 0.078, -0.08],
    [0.314, 0.075, 0.075, -0.078],
    [0.32, 0.077, 0.077, -0.08],
    [0.323, 0.074, 0.074, -0.077],
    [0.318, 0.071, 0.071, -0.074],
  ];
  const sectionCurve = new THREE.CatmullRomCurve3(
    table.map(([y, width, front, back]) => new THREE.Vector3(width, y, front)),
  );
  const backCurve = new THREE.CatmullRomCurve3(
    table.map(([y, width, front, back]) => new THREE.Vector3(back, y, width)),
  );
  const profile = (y) => {
    let low = 0,
      high = 10 / (table.length - 1);
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) / 2;
      if (sectionCurve.getPoint(mid).y < y) low = mid;
      else high = mid;
    }
    const t = (low + high) / 2;
    const row = sectionCurve.getPoint(t);
    return [row.x, row.z, backCurve.getPoint(t).x];
  };
  const foldsAt = (y, a) =>
    Math.exp(-(((y - 0.155) / 0.055) ** 2)) *
    (0.0022 * Math.sin(y * 102 + Math.cos(a) * 1.6) +
      0.0013 * Math.sin(y * 176 - Math.sin(a) * 1.8));
  group.updateMatrixWorld(true);
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const foot = J[side + "Foot"];
    const origin = foot.getWorldPosition(new THREE.Vector3());
    for (const mesh of [...foot.children]) {
      if (!mesh.isMesh) continue;
      foot.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const mesh of [...group.children]) {
      if (!new RegExp("^" + side + "BootFlex[0-9]+$").test(mesh.name)) continue;
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    const bind = (name, geo, material) => {
      const positions = geo.attributes.position;
      const indices = [],
        weights = [];
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        const shin = smooth(0.1, 0.18, y + 0.13);
        indices.push(0, 1, 0, 0);
        weights.push(shin, 1 - shin, 0, 0);
        positions.setXYZ(
          i,
          positions.getX(i) + origin.x,
          y + origin.y,
          positions.getZ(i) + origin.z,
        );
      }
      geo.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(indices, 4),
      );
      geo.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(weights, 4),
      );
      const mesh = new BootSkin(geo, material);
      mesh.name = side + name;
      mesh.rigNames = [side + "LowerLeg", side + "Foot"];
      mesh.rigInverses = mesh.rigNames.map((name) =>
        J[name].matrixWorld.clone().invert(),
      );
      mesh.skeleton = new THREE.Skeleton(
        mesh.rigNames.map((name) => J[name]),
        mesh.rigInverses.map((matrix) => matrix.clone()),
      );
      mesh.bind(mesh.skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    };
    const outline = (a, scale = 1) => {
      const cosine = Math.cos(a),
        sine = Math.sin(a);
      const z =
        0.039 +
        Math.sign(cosine) *
          Math.abs(cosine) ** 0.91 *
          (cosine >= 0 ? 0.161 : 0.148);
      const arch = Math.exp(-(((z + 0.01) / 0.04) ** 2));
      const width = 0.063 * (0.81 + 0.19 * smooth(-0.5, 0.25, cosine));
      const medial = smooth(0, 0.8, -sign * sine);
      const x =
        sine * (width - medial * arch * 0.008) -
        sign * 0.003 * smooth(0.09, 0.18, z);
      return new THREE.Vector3(x * scale, 0, z * scale);
    };
    const soleProfile = [
      [0, 0.002],
      [0.965, 0],
      [1, 0.003],
      [1, 0.011],
      [0.993, 0.018],
      [0.965, 0.023],
      [0, 0.023],
    ];
    const sole = geometry(soleProfile.length - 1, 48, (v, u) => {
      const [scale, y] = soleProfile[Math.round(v * (soleProfile.length - 1))];
      const p = outline(u * TAU, scale);
      const rocker = 0.005 * smooth(0.125, 0.2, p.z);
      const arch = 0.005 * Math.exp(-(((p.z + 0.012) / 0.032) ** 2));
      p.y = y + rocker + arch - 0.13;
      return p;
    });
    const soleMesh = new THREE.Mesh(sole, rubber);
    soleMesh.name = side + "BootSole";
    foot.add(soleMesh);
    const upper = geometry(36, 40, (v, u) => {
      const row = sectionCurve.getPoint(v),
        rear = backCurve.getPoint(v);
      const a = u * TAU,
        c = Math.cos(a),
        s = Math.sin(a);
      const y = row.y,
        width = row.x;
      const centerZ = (row.z + rear.x) / 2;
      const depth = (row.z - rear.x) / 2;
      const folds = foldsAt(y, a);
      const lateral = 1 - 0.08 * Math.max(0, -c) * (1 - smooth(0.09, 0.14, y));
      const x =
        s * (width * lateral + folds) -
        sign * 0.003 * smooth(0.1, 0.17, centerZ + c * depth);
      const z = centerZ + c * (depth + folds * 0.7);
      return new THREE.Vector3(x, y - 0.13, z);
    });
    bind("BootFlex1", upper, leather);
    const tongue = geometry(
      20,
      6,
      (v, u) => {
        const y = 0.1 + v * 0.207;
        const [width, front, back] = profile(y);
        const a = (u - 0.5) * 0.68;
        const folds = foldsAt(y, a);
        return new THREE.Vector3(
          Math.sin(a) * (width + folds),
          y - 0.13,
          (front + back) / 2 +
            Math.cos(a) * ((front - back) / 2 + folds * 0.7) +
            0.0025,
        );
      },
      false,
    );
    bind("BootTongue", tongue, tongueMaterial);
    const laces = [],
      eyelets = [];
    const heights = [0.106, 0.132, 0.161, 0.19, 0.219, 0.247, 0.278];
    const lacePoint = (x, y) => {
      const [width, front, back] = profile(y);
      const depth = (front - back) / 2;
      const folds = foldsAt(y, Math.asin(x / width));
      return new THREE.Vector3(
        x,
        y - 0.13,
        (front + back) / 2 +
          Math.sqrt(Math.max(0, 1 - (x / (width + folds)) ** 2)) *
            (depth + folds * 0.7) +
          0.0045,
      );
    };
    for (let i = 0; i < heights.length; i++) {
      const y = heights[i];
      for (const x of [-0.019, 0.019]) {
        const center = lacePoint(x, y);
        const ring = new THREE.TorusGeometry(0.0032, 0.00085, 4, 7);
        ring.translate(...center.toArray());
        eyelets.push(ring);
      }
      if (i === heights.length - 1) continue;
      for (const sign of [-1, 1]) {
        const points = [
          lacePoint(sign * 0.019, y),
          lacePoint(0, (y + heights[i + 1]) / 2),
          lacePoint(-sign * 0.019, heights[i + 1]),
        ];
        points[1].z += 0.001;
        laces.push(tube(points, 0.00165, 6));
      }
    }
    bind("BootLaces", combine(laces), laceMaterial);
    bind("BootEyelets", combine(eyelets), eyeletMaterial);
    const seams = [];
    for (const angle of [-1.1, 1.1]) {
      const points = [];
      for (let i = 0; i <= 18; i++) {
        const y = 0.115 + (i / 18) * 0.191;
        const [width, front, back] = profile(y);
        const folds = foldsAt(y, angle);
        points.push(
          new THREE.Vector3(
            Math.sin(angle) * (width + folds + 0.0008),
            y - 0.13,
            (front + back) / 2 +
              Math.cos(angle) * ((front - back) / 2 + folds * 0.7),
          ),
        );
      }
      seams.push(tube(points, 0.0008, 18));
    }
    const welt = Array.from({ length: 49 }, (_, i) => {
      const p = outline((i / 48) * TAU, 0.945);
      p.y = -0.105 + 0.004 * smooth(0.125, 0.2, p.z);
      return p;
    });
    seams.push(tube(welt, 0.00115, 48, true));
    bind("BootStitching", combine(seams), tongueMaterial);
  }
  group.userData.appearance.boots = "sculpted";
  group.updateMatrixWorld(true);
  return group;
}

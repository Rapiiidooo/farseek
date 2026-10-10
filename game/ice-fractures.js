export function iceFractureTexture(THREE) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([255, 0, 0, 255], i * 4);
  let seed = 229;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const line = (ax, ay, bx, by, from, to, width) => {
    const dx = bx - ax,
      dy = by - ay;
    const length = dx * dx + dy * dy;
    for (
      let y = Math.max(0, Math.floor(Math.min(ay, by) - width));
      y <= Math.min(size - 1, Math.ceil(Math.max(ay, by) + width));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(Math.min(ax, bx) - width));
        x <= Math.min(size - 1, Math.ceil(Math.max(ax, bx) + width));
        x++
      ) {
        const along = Math.max(
          0,
          Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length),
        );
        const distance = Math.hypot(x - ax - dx * along, y - ay - dy * along);
        const coverage = Math.max(0, 1 - distance / width);
        if (!coverage) continue;
        const offset = (y * size + x) * 4;
        const age = Math.round((from + (to - from) * along) * 255);
        if (age < data[offset]) data[offset] = age;
        data[offset + 1] = Math.max(
          data[offset + 1],
          Math.round(coverage * 255),
        );
      }
    }
  };
  for (let ray = 0; ray < 9; ray++) {
    let x = 60,
      y = 66;
    const angle = (ray / 9) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    for (let step = 0; step < 7; step++) {
      const heading = angle + (rand() - 0.5) * 0.5;
      const nextX = x + Math.cos(heading) * (8 + rand() * 5);
      const nextY = y + Math.sin(heading) * (8 + rand() * 5);
      const age = 0.05 + (step / 7) * 0.7;
      line(x, y, nextX, nextY, age, age + 0.12, 1.3);
      if (step > 1 && step < 6 && rand() < 0.64) {
        const branch = heading + (rand() > 0.5 ? 1 : -1) * (0.5 + rand() * 0.8);
        let branchX = x,
          branchY = y;
        for (let twig = 0; twig < 3; twig++) {
          const turn = branch + (rand() - 0.5) * 0.7;
          const tipX = branchX + Math.cos(turn) * (6 + rand() * 6);
          const tipY = branchY + Math.sin(turn) * (6 + rand() * 6);
          const branchAge = Math.min(0.93, age + 0.1 + twig * 0.1);
          line(
            branchX,
            branchY,
            tipX,
            tipY,
            branchAge,
            Math.min(0.99, branchAge + 0.09),
            0.85,
          );
          branchX = tipX;
          branchY = tipY;
        }
      }
      x = nextX;
      y = nextY;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function iceFractureMaterial(base, texture) {
  const material = base.clone();
  const load = { value: 0 };
  material.map = texture;
  material.userData.iceLoad = load;
  material.customProgramCacheKey = () => "fd-ice-fractures";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fdIceLoad = load;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float fdIceTop;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfdIceTop = max(0.0, normal.y);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float fdIceTop;\nuniform float fdIceLoad;",
      )
      .replace(
        "#include <map_fragment>",
        `
        vec4 fdCrack = texture2D(map, vMapUv);
        float fdGrowth = smoothstep(fdCrack.r - 0.09, fdCrack.r + 0.09, fdIceLoad);
        float fdEdge = fdCrack.g * fdIceTop;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.95, 1.0), fdEdge * (0.045 + fdGrowth * 0.84));
      `,
      );
  };
  return material;
}

export function setIceFractureLoad(material, value) {
  material.userData.iceLoad.value = Math.max(0, Math.min(1, value));
}

export function iceFractureUV(THREE, geometry, box, index) {
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = (position.getX(i) - box.minX) / (box.maxX - box.minX);
    const z = (position.getZ(i) - box.minZ) / (box.maxZ - box.minZ);
    uv[i * 2] = index % 2 ? 1 - x : x;
    uv[i * 2 + 1] = index > 1 ? 1 - z : z;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

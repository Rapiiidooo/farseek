import * as THREE from "three";
import { detailBatch } from "./prop-detail.js";
import { finishMaterial } from "./asset-finish.js";
import { mineralSurface, mineralSurfaceReady } from "./mineral-surface.js";
import { weatherStone } from "./stone-weather.js";

export function prepareCourtSurface(material) {
  mineralSurface(THREE, material, {
    source: new URL("./textures/court-sandstone-albedo.webp", import.meta.url)
      .href,
    tile: 2.4 / material.userData.tileMeters,
    strength: 0.82,
  });
  return weatherStone(material, { strength: 0.36 });
}

export async function buildCourtDetail(level) {
  const root = new THREE.Group();
  root.name = "court-scenery";
  const { world, assets } = level;
  const galleries = [];
  const anchors = [];
  const terrain = new Set();
  level.root.traverse((node) => {
    for (const material of node.material ? [node.material].flat() : []) {
      if (
        /^fd-terrain-(floor|dressed|masonry)/.test(
          material.customProgramCacheKey(),
        )
      )
        terrain.add(material);
    }
  });
  for (const material of terrain) prepareCourtSurface(material);
  for (const [x, z, yaw] of [
    [2.22, 24.5, Math.PI / 2],
    [27.78, 29.6, -Math.PI / 2],
  ]) {
    const gallery = await assets.make("court_gallery");
    gallery.position.set(x, 0, z);
    gallery.rotation.y = yaw;
    root.add(gallery);
    gallery.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gallery);
    const collider = world.add(
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
      "rock",
      null,
      { grab: false, stand: false },
    );
    galleries.push({
      x,
      z,
      yaw,
      bounds: [bounds.min.toArray(), bounds.max.toArray()],
      collider,
    });
  }
  const material = (color, name, roughness = 0.94) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness });
    value.name = name;
    return finishMaterial(THREE, value, name);
  };
  const stone = material(0xb57f4f, "stone");
  const bone = material(0xd8c49d, "stone");
  const basalt = material(0x6a5139, "stone");
  const cloth = material(0x88795d, "fabric");
  cloth.side = THREE.DoubleSide;
  const rope = material(0xa49673, "fabric");
  const iron = material(0x6c5940, "metal", 0.64);
  const paper = material(0xcbbb97, "paper");
  const contactCanvas = document.createElement("canvas");
  contactCanvas.width = contactCanvas.height = 32;
  const context = contactCanvas.getContext("2d");
  const fade = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  fade.addColorStop(0, "rgba(255,255,255,0.34)");
  fade.addColorStop(0.45, "rgba(255,255,255,0.22)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, 32, 32);
  const contactMap = new THREE.CanvasTexture(contactCanvas);
  contactMap.userData.sharedAssetFinish = true;
  const contact = new THREE.MeshBasicMaterial({
    color: 0x53452f,
    map: contactMap,
    transparent: true,
    depthWrite: false,
  });
  const batch = detailBatch(THREE, root);
  let seed = 2701;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const floor = (x, z, y) => {
    const height = world.ground(x, z, 0.01, y, 0.05);
    return Number.isFinite(height)
      ? height + level.driftAt(x, z, height)
      : null;
  };
  const ribbon = (center, radius, width, start, span, segments, value) => {
    const [x, y, z] = center;
    const positions = [],
      uv = [];
    for (let i = 0; i < segments; i++) {
      const a = start + (span * i) / segments,
        b = start + (span * (i + 1)) / segments;
      const point = (angle, r) => [
        x + Math.cos(angle) * r,
        y,
        z + Math.sin(angle) * r,
      ];
      const quad = [
        point(a, radius),
        point(a, radius - width),
        point(b, radius - width),
        point(b, radius),
      ];
      for (const p of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) {
        positions.push(...p);
        uv.push(p[0], p[2]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    batch.add(value, geometry);
  };
  for (const mirror of level.mirrors) {
    const { x, z } = mirror;
    for (let arc = 0; arc < 8; arc++) {
      const angle = (arc * Math.PI) / 4;
      ribbon(
        [x, 0.021, z],
        1.13,
        0.035,
        angle + 0.02,
        Math.PI / 4 - 0.07,
        4,
        basalt,
      );
      const radius = 1.28;
      batch.box(
        bone,
        [0.075, 0.012, 0.17],
        [x + Math.cos(angle) * radius, 0.018, z + Math.sin(angle) * radius],
        [0, Math.PI / 2 - angle, 0],
      );
    }
    anchors.push({ kind: "mirror-inlay", x, y: 0.021, z });
  }
  for (const side of [-1, 1]) {
    const x = 15 + side * 8.15;
    for (let z = 18.5; z < 34; z += 1.3) {
      const y = floor(x, z, 0);
      if (
        y === null ||
        y > 0.1 ||
        world.occupied(x, z, 0.25, y + 0.05, y + 0.3)
      )
        continue;
      const gap = random() < 0.24;
      if (!gap)
        batch.box(
          basalt,
          [0.11, 0.012, 0.8 + random() * 0.25],
          [x, y + 0.016, z],
        );
      if (gap || random() < 0.3) {
        batch.line(
          basalt,
          [
            [x - 0.25, y + 0.013, z - 0.19],
            [x + 0.035, y + 0.014, z + 0.04],
            [x + 0.22, y + 0.014, z + 0.09],
          ],
          0.006,
        );
      }
    }
  }
  for (let i = 0; i < 11; i++) {
    const x = 8.28 + i * 0.51;
    const height = 0.06 + random() * 0.13;
    const yaw = (random() - 0.5) * 0.1;
    const width =
      Math.abs(Math.cos(yaw)) * 0.46 + Math.abs(Math.sin(yaw)) * 0.67;
    const depth =
      Math.abs(Math.sin(yaw)) * 0.46 + Math.abs(Math.cos(yaw)) * 0.67;
    world.add(
      x - width / 2,
      9.7,
      36.4 - depth / 2,
      x + width / 2,
      9.7 + height,
      36.4 + depth / 2,
      "rock",
      null,
      { grab: false, stand: false },
    );
    batch.box(
      i % 3 ? stone : bone,
      [0.46, height, 0.67],
      [x, 9.7 + height / 2, 36.4],
      [0, yaw, 0],
    );
  }
  const fire = [23.5, 8, 38.05];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5,
      radius = 0.46 + random() * 0.03;
    world.addRound(
      fire[0] + Math.cos(angle) * radius,
      fire[2] + Math.sin(angle) * radius,
      0.125,
      8,
      8.165,
      "prop",
      null,
      { grab: false, stand: true, cam: false },
    );
    const pebble = new THREE.SphereGeometry(1, 10, 5);
    const vertices = pebble.attributes.position;
    for (let k = 0; k < vertices.count; k++) {
      const x = vertices.getX(k),
        y = vertices.getY(k),
        z = vertices.getZ(k);
      const wear =
        1 +
        Math.sin(x * 11.7 + z * 8.2 + y * 3.1) * 0.09 +
        Math.sin(y * 14.2 - z * 3.2) * 0.045;
      vertices.setXYZ(k, x * wear, y * wear, z * wear);
    }
    pebble.computeVertexNormals();
    pebble.scale(0.11, 0.09, 0.075);
    batch.add(
      stone,
      pebble,
      [
        fire[0] + Math.cos(angle) * radius,
        fire[1] + 0.065,
        fire[2] + Math.sin(angle) * radius,
      ],
      [0, angle, 0.15],
    );
    batch.add(
      contact,
      new THREE.PlaneGeometry(0.32, 0.24),
      [
        fire[0] + Math.cos(angle) * radius,
        8.009,
        fire[2] + Math.sin(angle) * radius,
      ],
      [-Math.PI / 2, 0, angle],
    );
  }
  for (let i = 0; i < 6; i++) {
    const angle = random() * Math.PI;
    batch.box(
      basalt,
      [0.045, 0.035, 0.48],
      [
        fire[0] + (random() - 0.5) * 0.3,
        8.034,
        fire[2] + (random() - 0.5) * 0.3,
      ],
      [0, angle, 0],
    );
  }
  anchors.push({ kind: "cold-fire", x: fire[0], y: fire[1], z: fire[2] });
  const sheet = new THREE.PlaneGeometry(1.24, 0.88, 8, 6).rotateX(-Math.PI / 2);
  const points = sheet.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i);
    points.setY(
      i,
      0.024 + Math.sin(x * 15 + z * 8) * 0.01 + Math.cos(z * 21) * 0.004,
    );
  }
  sheet.computeVertexNormals();
  batch.add(cloth, sheet, [22.4, 8, 39.25], [0, -0.18, 0]);
  for (const x of [21.95, 22.5, 22.84])
    batch.line(
      iron,
      [
        [x, 8.06, 39.38],
        [x + 0.04, 8.062, 38.95],
      ],
      0.018,
      6,
    );
  for (let i = 0; i < 3; i++)
    batch.ring(
      rope,
      0.23 - i * 0.032,
      0.014,
      [22.85, 8.06, 39.18],
      [Math.PI / 2, 0, 0],
    );
  batch.box(paper, [0.45, 0.005, 0.29], [22.25, 8.055, 39.25], [0, -0.18, 0]);
  batch.line(
    basalt,
    [
      [22.08, 8.06, 39.28],
      [22.14, 8.06, 39.17],
      [22.25, 8.06, 39.3],
      [22.33, 8.06, 39.18],
      [22.42, 8.06, 39.26],
    ],
    0.004,
  );
  batch.line(
    rope,
    [
      [23.05, 8.052, 39.14],
      [23.2, 8.035, 39.05],
      [23.35, 8.025, 39.14],
    ],
    0.012,
    5,
  );
  anchors.push({ kind: "survey-cloth", x: 22.4, y: 8.024, z: 39.25 });
  batch.finish();
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = true;
    }
  });
  level.root.add(root);
  root.userData.courtScenery = { revision: 1, galleries, anchors };
  await mineralSurfaceReady(level.root);
  return root;
}

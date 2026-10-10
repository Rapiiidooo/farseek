import * as THREE from "three";
import { detailBatch } from "./prop-detail.js";
import { finishAsset, finishMaterial } from "./asset-finish.js";
import { forestRoute } from "./forest-route.js";
import { isleAt } from "./world.js";
import * as COURT from "./court.js";

const palettes = {
  court: [0xad8358, 0xd8b482, 0x6d5237],
  two: [0x51495d, 0x95889b, 0x344743],
  three: [0xc1b8a0, 0xe1d7b7, 0x707c57],
  four: [0x9bb8c9, 0xe5edf0, 0x809fad],
  five: [0x747b58, 0xafa17a, 0x415735],
  six: [0xbcb6a1, 0xd2d7ba, 0x526e63],
};

export function addEarlyWorldDetail(instance, id, { variant = 1 } = {}) {
  if (!palettes[id] || instance.detail) return instance.detail;
  const root = new THREE.Group();
  root.name = `${id} terrain detail`;
  const colors = palettes[id];
  const stone = new THREE.MeshStandardMaterial({
    color: colors[0],
    roughness: 0.94,
  });
  stone.name = id === "four" ? "frost" : "stone";
  const edge = new THREE.MeshStandardMaterial({
    color: colors[1],
    roughness: 0.89,
  });
  edge.name = id === "four" ? "frost" : "stone";
  const mark = new THREE.MeshStandardMaterial({
    color: colors[2],
    roughness: 0.98,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const batch = detailBatch(THREE, root);
  const anchors = [];
  const pebbles = [];
  let seed = 811 + Object.keys(palettes).indexOf(id) * 137 + variant * 47;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const floor = (x, z, reference = 20) => {
    if (id === "five") reference = instance.forest.surfaceAt(x, z) + 0.1;
    const y = instance.world.ground(x, z, 0.015, reference, 0.2);
    if (!Number.isFinite(y) || y < -3 || y > reference + 0.1) return null;
    return y + (id === "court" ? instance.level.driftAt(x, z, y) : 0);
  };
  const scatter = (x, z, radius, count, reference) => {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      const px = x + Math.cos(angle) * distance,
        pz = z + Math.sin(angle) * distance;
      const y = floor(px, pz, reference);
      if (y === null) continue;
      const scale = 0.025 + random() * (variant === 0 ? 0.025 : 0.045);
      pebbles.push([
        px,
        y + scale * 0.24,
        pz,
        scale * (1.1 + random()),
        scale * 0.48,
        scale,
        random() * Math.PI,
      ]);
    }
    anchors.push({ kind: "gravel", x, z, count });
  };
  const tile = (x, z, width, depth, reference) => {
    const y = floor(x, z, reference);
    if (y === null) return;
    batch.box(
      edge,
      [width, 0.014, depth],
      [x, y + 0.007, z],
      [0, (random() - 0.5) * 0.24, 0],
    );
    scatter(x, z, width * 0.75, 5, reference);
    anchors.push({ kind: "tile", x, y, z });
  };
  const stain = (x, z, width, depth, reference, turn = 0) => {
    const y = floor(x, z, reference);
    if (y === null) return;
    const geometry = new THREE.CircleGeometry(1, 16).scale(width, depth, 1);
    batch.add(
      mark,
      geometry,
      [x, y + (id === "four" ? 0.1 : 0.038), z],
      [-Math.PI / 2, 0, turn],
    );
  };
  if (id === "court") {
    for (const [x, z, y] of [
      [3.3, 13, 0],
      [26.6, 15, 0],
      [26.2, 28.5, 0],
      [3.5, 29.5, 0],
      [25.8, 34.2, 0],
      [12, 40.5, 8],
      [26.5, 40.8, 8],
      [9.2, 37.15, 8],
      [13.3, 37.1, 8],
    ]) {
      scatter(x, z, 0.95, variant === 2 ? 32 : 18, y);
      tile(x + 0.25, z - 0.1, 0.48, 0.29, y);
      tile(x - 0.25, z + 0.2, 0.31, 0.2, y);
    }
    for (const [x, z] of [
      [6.2, 13.5],
      [23.9, 13.3],
      [6.8, 26.8],
      [23.6, 29.2],
    ]) {
      const y = floor(x, z, 0);
      if (y === null) continue;
      batch.line(
        stone,
        [
          [x - 0.5, y + 0.012, z - 0.35],
          [x - 0.12, y + 0.013, z - 0.05],
          [x + 0.35, y + 0.013, z + 0.18],
        ],
        0.005,
      );
      batch.line(
        stone,
        [
          [x - 0.12, y + 0.013, z - 0.05],
          [x + 0.08, y + 0.013, z - 0.38],
        ],
        0.004,
      );
    }
    for (const [x, z] of COURT.BRAZIERS) stain(x, z, 0.68, 0.52, 0);
    for (let i = 0; i < 8; i++)
      stain(21.8 + i * 0.1, 39.2 + i * 0.16, 0.055, 0.13, 8, -0.35);
  } else if (id === "two") {
    for (const side of [-1, 1]) {
      for (let z = 2; z > -45; z -= 1.8) {
        const x = side * 2.04;
        const y = floor(x, z, 0);
        if (y !== null)
          batch.box(edge, [0.055, 0.012, 0.48], [x, y + 0.045, z]);
      }
      for (const z of [-6, -18, -30, -43])
        scatter(side * (3.4 + random()), z, 0.7, 20, 0);
    }
    for (let i = 0; i < 12; i++)
      stain(
        (i % 2 ? 1 : -1) * 0.11,
        -3 - i * 1.45,
        0.055,
        0.13,
        0,
        (random() - 0.5) * 0.2,
      );
    const plaza = instance.checkpoint.windowPos;
    if (plaza)
      for (const sign of [-1, 1])
        stain(plaza.x + sign * 1.6, plaza.z + 1.1, 0.7, 0.3, 0);
  } else if (id === "three") {
    for (const isle of instance.isles.isles) {
      if (isle.drift || isle.crumble || isle.unsafe || isle.s < 0.5) continue;
      const c = isle.collider;
      for (const angle of [0.25, 0.85, 2.3, 2.85, 3.5, 5.65]) {
        const rim = isleAt(c, c.x + Math.cos(angle), c.z + Math.sin(angle)).rim;
        const x = c.x + Math.cos(angle) * rim * 0.76,
          z = c.z + Math.sin(angle) * rim * 0.76;
        if (Math.abs(x - c.x) < 1.5) continue;
        scatter(x, z, 0.55, 14, c.maxY + 0.2);
        if (random() > 0.45) tile(x, z, 0.25, 0.17, c.maxY + 0.2);
      }
    }
  } else if (id === "four") {
    const banks = instance.world.boxes.filter(
      (box) =>
        box.shape === "box" &&
        box.kind === "rock" &&
        box.stand &&
        !box.slick &&
        box.maxY < 5 &&
        box.maxY - box.minY > 1 &&
        box.maxX - box.minX > 4,
    );
    for (const box of banks) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? box.minX + 0.6 : box.maxX - 0.6;
        for (let z = box.minZ + 0.7; z < box.maxZ - 0.4; z += 2.8) {
          scatter(x, z, 0.36, 9, box.maxY + 0.1);
          stain(
            x + side * 0.16,
            z,
            0.42,
            0.18,
            box.maxY + 0.1,
            (random() - 0.5) * 0.4,
          );
        }
      }
    }
  } else if (id === "five") {
    const leaf = new THREE.MeshStandardMaterial({
      color: 0x736741,
      roughness: 0.98,
      side: THREE.DoubleSide,
    });
    leaf.name = "foliage";
    for (let z = -8; z > -270; z -= 12) {
      const route = forestRoute(z);
      for (const side of [-1, 1]) {
        const x = route.x + side * (route.width * 0.62 + random());
        scatter(x, z, 0.8, 12, 30);
        for (let i = 0; i < 7; i++) {
          const px = x + (random() - 0.5) * 1.6,
            pz = z + (random() - 0.5) * 1.8,
            y = floor(px, pz, 30);
          if (y === null) continue;
          const yaw = random() * Math.PI * 2;
          const geometry = new THREE.PlaneGeometry(
            0.12 + random() * 0.08,
            0.035 + random() * 0.025,
            3,
            1,
          )
            .rotateX(-Math.PI / 2)
            .rotateY(yaw);
          const positions = geometry.attributes.position;
          for (let k = 0; k < positions.count; k++) {
            const h = instance.forest.surfaceAt(
              px + positions.getX(k),
              pz + positions.getZ(k),
            );
            positions.setY(k, h - y + 0.006 + 0.002 * Math.sin(k));
          }
          geometry.computeVertexNormals();
          batch.add(leaf, geometry, [px, y, pz]);
        }
      }
    }
    const banks = instance.scene.getObjectByName("forest-rocky-banks");
    if (banks) banks.material = finishMaterial(THREE, banks.material, "stone");
  } else if (id === "six") {
    const banks = instance.world.boxes.filter(
      (box) =>
        box.kind === "rock" &&
        box.stand &&
        !box.unsafe &&
        box.maxY > 15 &&
        box.maxX - box.minX > 5 &&
        box.maxZ - box.minZ > 5,
    );
    for (const box of banks)
      for (const side of [-1, 1]) {
        const x = side < 0 ? box.minX + 0.4 : box.maxX - 0.4;
        for (let z = box.minZ + 0.8; z < box.maxZ - 0.6; z += 3.1) {
          scatter(x, z, 0.3, 11, box.maxY + 0.1);
          if (random() > 0.5) tile(x, z, 0.24, 0.16, box.maxY + 0.1);
          stain(x, z, 0.3, 0.19, box.maxY + 0.1, random());
        }
      }
  }
  batch.finish();
  if (pebbles.length) {
    const gravel = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      stone,
      pebbles.length,
    );
    gravel.name = "Embedded terrain gravel";
    const dummy = new THREE.Object3D();
    pebbles.forEach(([x, y, z, sx, sy, sz, yaw], index) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, yaw, 0.15);
      dummy.updateMatrix();
      gravel.setMatrixAt(index, dummy.matrix);
    });
    gravel.instanceMatrix.needsUpdate = true;
    gravel.computeBoundingBox();
    gravel.computeBoundingSphere();
    root.add(gravel);
  }
  finishAsset(
    THREE,
    root,
    id === "four" ? "frozen_terrain_detail" : "terrain_detail",
  );
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = true;
    }
  });
  instance.scene.add(root);
  root.userData.terrainDetail = {
    revision: 2,
    id,
    variant,
    anchors,
    pebbles: pebbles.length,
  };
  instance.detail = root;
  if (id === "court") instance.services.rig.refresh(root);
  return root;
}

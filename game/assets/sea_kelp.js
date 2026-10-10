import { refineNature } from "../nature-detail.js";

export default function (THREE) {
  const root = new THREE.Group();
  root.name = "Ribbon kelp";
  const glow = new THREE.Group();
  root.add(glow);
  root.userData.parts = { glow };
  const kelp = new THREE.MeshStandardMaterial({
    color: 0x718146,
    roughness: 0.73,
    side: THREE.DoubleSide,
    emissive: 0x0e2110,
    emissiveIntensity: 0.32,
  });
  kelp.name = "foliage";
  bladeSurface(THREE, kelp);
  for (let blade = 0; blade < 3; blade++) {
    const geometry = new THREE.PlaneGeometry(1, 1, 8, 64).translate(0, 0.5, 0);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i),
        across = p.getX(i) * 2;
      const width =
        (0.11 + 0.89 * Math.sin(Math.PI * t) ** 0.7) *
        (0.86 + 0.14 * Math.cos(t * 8 * Math.PI + blade));
      const lean = Math.sin(t * Math.PI) * (0.07 + blade * 0.015);
      const fold = (1 - across * across) * 0.048 * Math.sin(Math.PI * t);
      const wave =
        Math.sin(t * 7 * Math.PI + blade * 1.3 + across) *
        0.022 *
        across *
        across *
        Math.sin(Math.PI * t);
      p.setXYZ(
        i,
        across * width * 0.46 + lean,
        t,
        fold +
          wave +
          Math.sin(t * Math.PI * 2 + blade) *
            across *
            0.035 *
            Math.sin(Math.PI * t),
      );
    }
    geometry.rotateY((blade * Math.PI) / 3);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, kelp);
    mesh.name = `Kelp frond ${blade + 1}`;
    root.add(mesh);
    const stem = new THREE.CylinderGeometry(0.006, 0.014, 0.96, 10, 10);
    stem.translate(0, 0.48, 0);
    const s = stem.attributes.position;
    for (let i = 0; i < s.count; i++)
      s.setX(
        i,
        s.getX(i) + Math.sin(s.getY(i) * Math.PI) * (0.07 + blade * 0.015),
      );
    stem.rotateY((blade * Math.PI) / 3);
    stem.computeVertexNormals();
    root.add(new THREE.Mesh(stem, kelp));
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root),
    size = bounds.getSize(new THREE.Vector3());
  const fit = new THREE.Matrix4()
    .makeTranslation(-0.4552288055419922, 0, -0.3921215534210205)
    .multiply(
      new THREE.Matrix4().makeScale(
        0.9104576110839844 / size.x,
        1,
        0.784243106842041 / size.z,
      ),
    )
    .multiply(
      new THREE.Matrix4().makeTranslation(-bounds.min.x, 0, -bounds.min.z),
    );
  root.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.geometry.applyMatrix4(fit);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  });
  return refineNature(THREE, root, "sea_kelp");
}

const kelpTextures = new WeakMap();

function bladeSurface(THREE, material) {
  if (!kelpTextures.has(THREE)) {
    const width = 128,
      height = 512;
    const albedo = new Uint8Array(width * height * 4);
    const normals = new Uint8Array(width * height * 4);
    const roughness = new Uint8Array(width * height * 4);
    const relief = new Float32Array(width * height);
    let mean = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width,
          v = (y + 0.5) / height;
        const keel = Math.exp(-(((u - 0.5) / 0.028) ** 2));
        const ribs = Math.cos((u + Math.sin(v * 17) * 0.003) * Math.PI * 36);
        const grain =
          Math.sin(x * 17.31 + y * 7.91) * Math.sin(x * 3.07 - y * 11.13);
        const shade = 0.966 + ribs * 0.012 + keel * 0.013 + grain * 0.005;
        const value = Math.round(Math.min(1, Math.max(0, shade)) * 255),
          i = (y * width + x) * 4;
        albedo.set([value, value, value, 255], i);
        roughness.set([250, 250, 250, 255], i);
        relief[y * width + x] = keel * 0.055 + ribs * 0.006 + grain * 0.001;
        const s = value / 255;
        mean += s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }
    const at = (x, y) =>
      relief[((y + height) % height) * width + ((x + width) % width)];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const nx = (at(x - 1, y) - at(x + 1, y)) * 2.5,
          ny = (at(x, y - 1) - at(x, y + 1)) * 2.5,
          length = Math.hypot(nx, ny, 1);
        normals.set(
          [
            ((nx / length) * 0.5 + 0.5) * 255,
            ((ny / length) * 0.5 + 0.5) * 255,
            ((1 / length) * 0.5 + 0.5) * 255,
            255,
          ],
          (y * width + x) * 4,
        );
      }
    const texture = (data, color = false) => {
      const map = new THREE.DataTexture(data, width, height);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true;
      map.anisotropy = 8;
      map.userData.sharedAssetFinish = true;
      if (color) map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      return map;
    };
    kelpTextures.set(THREE, {
      map: texture(albedo, true),
      normalMap: texture(normals),
      roughnessMap: texture(roughness),
      gain: (width * height) / mean,
    });
  }
  const { gain, ...maps } = kelpTextures.get(THREE);
  Object.assign(material, maps);
  material.normalScale.set(0.35, 0.35);
  material.color.multiplyScalar(gain);
  material.userData.kelpBladeGain = gain;
  return material;
}

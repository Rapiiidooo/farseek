const GAP = 0.006;
const TRAVEL = 0.12;

export function attachHairContact(THREE, model) {
  const hair = model.getObjectByName("explorerHair");
  const pack = model.getObjectByName("warriorHydrationPack");
  if (!hair || !pack || model.getObjectByName("explorerHairContact"))
    return model;
  const geometry = hair.geometry.clone();
  const position = geometry.attributes.position;
  const lift =
    geometry.morphAttributes.position[hair.morphTargetDictionary.lift];
  const weights = new Float32Array(position.count);
  const tail = [];
  const parents = Array.from({ length: position.count }, (_, i) => i);
  const find = (i) => (parents[i] === i ? i : (parents[i] = find(parents[i])));
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3)
    for (let corner = 1; corner < 3; corner++)
      parents[find(indices[i + corner])] = find(indices[i]);
  const strands = new Map();
  for (let i = 0; i < position.count; i++) {
    const id = find(i);
    if (!strands.has(id)) strands.set(id, { top: -Infinity, moving: false });
    const strand = strands.get(id);
    strand.top = Math.max(strand.top, position.getY(i));
    strand.moving ||= lift.getZ(i) < 0;
  }
  for (let i = 0; i < weights.length; i++) {
    const strand = strands.get(find(i));
    if (!strand.moving) continue;
    const t = Math.max(0, (strand.top - position.getY(i)) / 0.27);
    weights[i] = Math.pow(t, 1.15);
    if (weights[i] > 0) tail.push(i);
  }
  geometry.computeBoundingBox();
  const originalBounds = geometry.boundingBox.clone();
  const start = geometry.morphAttributes.position.length;
  for (let axis = 0; axis < 3; axis++) {
    const offset = new Float32Array(position.count * 3);
    for (const index of tail)
      offset[index * 3 + axis] = weights[index] * TRAVEL;
    const attribute = new THREE.BufferAttribute(offset, 3);
    attribute.name = ["packClearanceX", "packClearanceY", "packClearanceZ"][
      axis
    ];
    geometry.morphAttributes.position.push(attribute);
  }
  const cullingBounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const radius = weights[i] * TRAVEL + 0.025;
    cullingBounds.expandByPoint(point.clone().addScalar(radius));
    cullingBounds.expandByPoint(point.clone().addScalar(-radius));
  }
  geometry.boundingSphere = cullingBounds.getBoundingSphere(new THREE.Sphere());
  hair.geometry = geometry;
  hair.updateMorphTargets();

  class HairContact extends THREE.Group {
    constructor() {
      super();
      this.owner = null;
      this.toSpine = new THREE.Matrix4();
      this.fromHair = new THREE.Matrix4();
      this.toHair = new THREE.Matrix4();
      this.point = new THREE.Vector3();
      this.direction = new THREE.Vector3();
      this.bounds = new THREE.Box3();
      this.correction = 0;
      this.pose = null;
      this.sway = NaN;
      this.lift = NaN;
      this.planes = Array.from({ length: 17 }, (_, i) => {
        const angle = ((i - 8) / 8) * Math.PI * 0.47;
        return { y: Math.sin(angle), z: -Math.cos(angle), distance: 0 };
      });
    }
    updateMatrixWorld(force) {
      super.updateMatrixWorld(force);
      if (!this.parent) return;
      if (this.owner !== this.parent) {
        this.owner = this.parent;
        this.pose = null;
        this.hair = this.owner.getObjectByName("explorerHair");
        this.spine = this.owner.getObjectByName("spine");
        this.parts = ["warriorHydrationPack", "warriorPackPanel"].map(
          (name) => {
            const mesh = this.owner.getObjectByName(name);
            return {
              mesh,
              bones: mesh.rigNames.map((name) =>
                this.owner.getObjectByName(name),
              ),
              matrices: mesh.rigNames.map(() => new THREE.Matrix4()),
            };
          },
        );
      }
      const hair = this.hair;
      if (!hair || !this.spine || this.parts.some((part) => !part.mesh)) return;
      this.toSpine.copy(this.spine.matrixWorld).invert();
      this.fromHair.multiplyMatrices(this.toSpine, hair.matrixWorld);
      const influence = hair.morphTargetInfluences;
      let dirty =
        !this.pose || this.sway !== influence[0] || this.lift !== influence[1];
      this.sway = influence[0];
      this.lift = influence[1];
      this.pose ??= new Float64Array(
        16 * (1 + this.parts.reduce((n, part) => n + part.matrices.length, 0)),
      );
      let cursor = 0;
      for (const value of this.fromHair.elements) {
        dirty ||= Math.abs(this.pose[cursor] - value) > 1e-10;
        this.pose[cursor++] = value;
      }
      for (const part of this.parts)
        for (let i = 0; i < part.matrices.length; i++) {
          const matrix = part.matrices[i];
          matrix
            .multiplyMatrices(this.toSpine, part.bones[i].matrixWorld)
            .multiply(part.mesh.rigInverses[i])
            .multiply(part.mesh.bindMatrix);
          for (const value of matrix.elements) {
            dirty ||= Math.abs(this.pose[cursor] - value) > 1e-10;
            this.pose[cursor++] = value;
          }
        }
      if (!dirty) {
        influence[start] = this.direction.x;
        influence[start + 1] = this.direction.y;
        influence[start + 2] = this.direction.z;
        return;
      }
      this.toHair.copy(this.fromHair).invert();
      this.bounds.makeEmpty();
      for (const plane of this.planes) plane.distance = -Infinity;
      for (const part of this.parts) {
        const mesh = part.mesh;
        const p = mesh.geometry.attributes.position;
        const indices = mesh.geometry.attributes.skinIndex;
        const skinWeights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            y = p.getY(i),
            z = p.getZ(i);
          let px = 0,
            py = 0,
            pz = 0;
          for (let component = 0; component < 4; component++) {
            const w = skinWeights.array[i * 4 + component];
            if (!w) continue;
            const e = part.matrices[indices.array[i * 4 + component]].elements;
            px += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
            py += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
            pz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
          }
          this.bounds.expandByPoint(this.point.set(px, py, pz));
          for (const plane of this.planes)
            plane.distance = Math.max(
              plane.distance,
              plane.y * py + plane.z * pz,
            );
        }
      }
      for (let axis = 0; axis < 3; axis++) influence[start + axis] = 0;
      const min = this.bounds.min,
        max = this.bounds.max;
      let push = 0;
      for (const index of tail) {
        hair.getVertexPosition(index, this.point).applyMatrix4(this.fromHair);
        if (
          this.point.x < min.x - GAP ||
          this.point.x > max.x + GAP ||
          this.point.y < min.y - GAP ||
          this.point.y > max.y + GAP
        )
          continue;
        let back = -Infinity;
        for (const plane of this.planes)
          back = Math.max(
            back,
            (plane.distance + GAP - plane.y * this.point.y) / plane.z,
          );
        push = Math.max(push, (this.point.z - back) / weights[index]);
      }
      this.correction = Math.max(0, push);
      this.direction.set(0, 0, -this.correction).applyMatrix4(this.toHair);
      this.point.set(0, 0, 0).applyMatrix4(this.toHair);
      this.direction.sub(this.point).divideScalar(TRAVEL);
      influence[start] = this.direction.x;
      influence[start + 1] = this.direction.y;
      influence[start + 2] = this.direction.z;
    }
  }
  const contact = new HairContact();
  contact.name = "explorerHairContact";
  model.add(contact);
  model.userData.appearance.hairContact = "fitted-pack";
  model.updateMatrixWorld(true);
  geometry.boundingBox = new THREE.Box3();
  for (let i = 0; i < position.count; i++)
    geometry.boundingBox.expandByPoint(hair.getVertexPosition(i, point));
  geometry.boundingBox.union(originalBounds);
  return model;
}

import * as THREE from "three";

export class CourtMirrors {
  constructor(scene, renderer, level) {
    this.scene = scene;
    this.renderer = renderer;
    this.world = level.world;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.fallback.needsUpdate = true;
    this.camera = new THREE.PerspectiveCamera();
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.plane = new THREE.Plane();
    this.clip = new THREE.Vector4();
    this.q = new THREE.Vector4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.mirrorMatrix = new THREE.Matrix4();
    this.entries = [];
    for (const root of [
      ...level.mirrors.map((mirror) => mirror.mesh),
      level.catcher,
    ]) {
      root?.traverse((mesh) => {
        const material = mesh.material;
        if (
          !mesh.isMesh ||
          !material ||
          material.metalness < 0.95 ||
          material.roughness > 0.3
        )
          return;
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
        const faceNormal = new THREE.Vector3();
        const normals = mesh.geometry.attributes.normal;
        for (let i = 0; i < normals.count; i++)
          faceNormal.add(this.normal.fromBufferAttribute(normals, i));
        if (faceNormal.lengthSq() < 0.001) faceNormal.set(0, 1, 0);
        faceNormal.normalize();
        const uniforms = {
          uMirrorMap: { value: this.fallback },
          uMirrorMatrix: { value: new THREE.Matrix4() },
          uMirrorReady: { value: 0 },
        };
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        material.uniforms = uniforms;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform mat4 uMirrorMatrix; varying vec4 vMirrorPosition;",
            )
            .replace(
              "#include <project_vertex>",
              "#include <project_vertex>\nvMirrorPosition = uMirrorMatrix * modelMatrix * vec4(transformed, 1.0);",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform sampler2D uMirrorMap; uniform float uMirrorReady; varying vec4 vMirrorPosition;",
            )
            .replace(
              "#include <opaque_fragment>",
              `
              if (uMirrorReady > 0.5 && vMirrorPosition.w > 0.0) {
                vec2 mirrorUV = clamp(vMirrorPosition.xy / vMirrorPosition.w, 0.002, 0.998);
                vec3 reflection = texture2D(uMirrorMap, mirrorUV).rgb;
                float grazing = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
                outgoingLight = mix(outgoingLight, reflection * vec3(0.96, 0.88, 0.72), 0.9 + grazing * 0.07);
              }
              #include <opaque_fragment>
            `,
            );
        };
        material.customProgramCacheKey = () =>
          key.call(material) + "|fd-court-mirror-1";
        this.entries.push({
          mesh,
          uniforms,
          center: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()),
          sphere: mesh.geometry.boundingSphere.clone(),
          normal: faceNormal,
        });
      });
    }
  }

  select(camera) {
    this.frustum.setFromProjectionMatrix(
      this.matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    let selected = null,
      best = 0;
    for (const entry of this.entries) {
      const sphere = entry.sphere.clone().applyMatrix4(entry.mesh.matrixWorld);
      const distance = camera.position.distanceToSquared(sphere.center);
      if (distance > 144 || !this.frustum.intersectsSphere(sphere)) continue;
      this.normal.copy(entry.normal).transformDirection(entry.mesh.matrixWorld);
      this.view.subVectors(camera.position, sphere.center);
      if (this.view.dot(this.normal) < 0.05) continue;
      if (this.occluded(camera.position, sphere.center)) continue;
      const score = (sphere.radius * sphere.radius) / Math.max(0.1, distance);
      if (score > best) {
        best = score;
        selected = entry;
      }
    }
    return best > 0.0025 ? selected : null;
  }

  occluded(from, to) {
    this.look.subVectors(to, from);
    const range = this.look.length();
    this.look.divideScalar(range || 1);
    return !!this.world.ray(
      from.x,
      from.y,
      from.z,
      this.look.x,
      this.look.y,
      this.look.z,
      range - 0.05,
      (box) => box.cam && box.kind !== "mirror",
    );
  }

  render(camera, scale) {
    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const entry = this.select(camera);
    if (!entry) {
      this.reset();
      return null;
    }
    const now = performance.now();
    if (
      entry === this.active &&
      now - this.lastAt < 100 &&
      camera.position.distanceToSquared(this.position) < 0.00001 &&
      Math.abs(camera.quaternion.dot(this.quaternion)) > 0.999999 &&
      this.mirrorMatrix.equals(entry.mesh.matrixWorld)
    )
      return null;
    const size = scale <= 0.5 ? 256 : scale < 1 ? 384 : 512;
    if (this.target.width !== size) this.target.setSize(size, size);
    this.point.copy(entry.center).applyMatrix4(entry.mesh.matrixWorld);
    this.normal.copy(entry.normal).transformDirection(entry.mesh.matrixWorld);
    this.view
      .subVectors(camera.position, this.point)
      .reflect(this.normal)
      .add(this.point);
    this.look
      .set(0, 0, -1)
      .transformDirection(camera.matrixWorld)
      .add(camera.position)
      .sub(this.point)
      .reflect(this.normal)
      .add(this.point);
    this.up
      .set(0, 1, 0)
      .transformDirection(camera.matrixWorld)
      .reflect(this.normal);
    const eye = this.camera;
    eye.copy(camera);
    if (eye.view?.enabled) eye.clearViewOffset();
    eye.position.copy(this.view);
    eye.up.copy(this.up);
    eye.lookAt(this.look);
    eye.updateMatrixWorld(true);
    const box = entry.mesh.geometry.boundingBox;
    let minX = 1,
      minY = 1,
      maxX = -1,
      maxY = -1;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          this.projected
            .set(x, y, z)
            .applyMatrix4(entry.mesh.matrixWorld)
            .project(eye);
          minX = Math.min(minX, this.projected.x);
          minY = Math.min(minY, this.projected.y);
          maxX = Math.max(maxX, this.projected.x);
          maxY = Math.max(maxY, this.projected.y);
        }
    const width = 1024,
      height = Math.round(width / camera.aspect);
    const left = Math.max(0, Math.floor((minX + 1) * width * 0.5) - 4);
    const top = Math.max(0, Math.floor((1 - maxY) * height * 0.5) - 4);
    const right = Math.min(width, Math.ceil((maxX + 1) * width * 0.5) + 4);
    const bottom = Math.min(height, Math.ceil((1 - minY) * height * 0.5) + 4);
    if (right <= left || bottom <= top) {
      this.reset();
      return null;
    }
    eye.setViewOffset(width, height, left, top, right - left, bottom - top);
    entry.uniforms.uMirrorMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(eye.projectionMatrix)
      .multiply(eye.matrixWorldInverse);
    this.plane
      .setFromNormalAndCoplanarPoint(this.normal, this.point)
      .applyMatrix4(eye.matrixWorldInverse);
    this.clip.set(
      this.plane.normal.x,
      this.plane.normal.y,
      this.plane.normal.z,
      this.plane.constant,
    );
    const projection = eye.projectionMatrix.elements;
    this.q.set(
      (Math.sign(this.clip.x) + projection[8]) / projection[0],
      (Math.sign(this.clip.y) + projection[9]) / projection[5],
      -1,
      (1 + projection[10]) / projection[14],
    );
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    projection[2] = this.clip.x;
    projection[6] = this.clip.y;
    projection[10] = this.clip.z + 1 - 0.003;
    projection[14] = this.clip.w;
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    const renderer = this.renderer;
    const target = renderer.getRenderTarget(),
      planes = renderer.clippingPlanes;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const autoShadow = renderer.shadowMap.autoUpdate,
      xr = renderer.xr.enabled;
    const visible = entry.mesh.visible;
    this.reset();
    entry.mesh.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = false;
    try {
      renderer.setRenderTarget(this.target);
      renderer.clippingPlanes = [];
      renderer.state.buffers.depth.setMask(true);
      if (!renderer.autoClear) renderer.clear();
      renderer.render(this.scene, eye);
      this.lastAt = now;
      this.position.copy(camera.position);
      this.quaternion.copy(camera.quaternion);
      this.mirrorMatrix.copy(entry.mesh.matrixWorld);
      this.active = entry;
      entry.uniforms.uMirrorMap.value = this.target.texture;
      entry.uniforms.uMirrorReady.value = 1;
      return { ...renderer.info.render };
    } finally {
      entry.mesh.visible = visible;
      renderer.shadowMap.autoUpdate = autoShadow;
      renderer.xr.enabled = xr;
      renderer.clippingPlanes = planes;
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport);
    }
  }

  reset() {
    this.active = null;
    this.lastAt = -Infinity;
    for (const entry of this.entries) {
      entry.uniforms.uMirrorReady.value = 0;
      entry.uniforms.uMirrorMap.value = this.fallback;
    }
  }

  release() {
    this.reset();
    this.target.setSize(1, 1);
  }
}

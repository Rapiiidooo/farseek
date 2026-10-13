import * as THREE from "three";

const RANGE = 12;
const STILL = 100;
const FADE = 0.25;

// Every polished mirror face reflects a still capture of the court taken from its centre during
// preparation; the nearest ones in view also reflect live, each through its own target.
export class CourtMirrors {
  constructor(scene, renderer, level) {
    this.scene = scene;
    this.renderer = renderer;
    this.world = level.world;
    this.hero = null;
    this.count = 1;
    this.size = 512;
    this.probeSize = 256;
    this.renders = 0;
    this.time = performance.now();
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.fallback.needsUpdate = true;
    this.camera = new THREE.PerspectiveCamera();
    this.probe = new THREE.CubeCamera(0.1, 1200);
    this.probe.coordinateSystem = renderer.coordinateSystem;
    this.probe.updateCoordinateSystem();
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.projection = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.plane = new THREE.Plane();
    this.clip = new THREE.Vector4();
    this.q = new THREE.Vector4();
    this.viewport = new THREE.Vector4();
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
          uMirrorLive: { value: 0 },
          uMirrorCube: { value: null },
          uMirrorStill: { value: 0 },
          uMirrorProbe: { value: new THREE.Vector4() },
          uMirrorNormal: { value: new THREE.Vector3(0, 0, 1) },
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
              `#include <common>
              uniform sampler2D uMirrorMap; uniform samplerCube uMirrorCube;
              uniform float uMirrorLive; uniform float uMirrorStill;
              uniform vec4 uMirrorProbe; uniform vec3 uMirrorNormal; varying vec4 vMirrorPosition;`,
            )
            .replace(
              "#include <opaque_fragment>",
              `
              {
                float mirrorGrazing = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
                float mirrorAmount = 0.9 + mirrorGrazing * 0.07;
                vec3 mirrorTint = vec3(0.96, 0.88, 0.72);
                vec3 mirrorLit = outgoingLight;
                // The capture is read where the reflected ray meets the floor or an 8 m sphere
                // around its centre, so it shifts across the face as the live view does.
                vec3 mirrorEye = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
                vec3 mirrorRay = reflect(normalize(mirrorEye), uMirrorNormal);
                vec3 mirrorFrom = cameraPosition + mirrorEye - uMirrorProbe.xyz;
                float mirrorAlong = dot(mirrorFrom, mirrorRay);
                float mirrorReach = sqrt(max(mirrorAlong * mirrorAlong - dot(mirrorFrom, mirrorFrom) + 64.0, 0.0)) - mirrorAlong;
                if (mirrorRay.y < -0.001) mirrorReach = min(mirrorReach, (uMirrorProbe.w - mirrorFrom.y) / mirrorRay.y);
                vec3 mirrorStill = textureCube(uMirrorCube, mirrorFrom + mirrorRay * max(mirrorReach, 0.0)).rgb;
                outgoingLight = mix(mirrorLit, mirrorStill * mirrorTint, mirrorAmount * uMirrorStill);
                if (uMirrorLive > 0.0 && vMirrorPosition.w > 0.0) {
                  vec2 mirrorUV = clamp(vMirrorPosition.xy / vMirrorPosition.w, 0.002, 0.998);
                  vec3 mirrorLive = mix(mirrorLit, texture2D(uMirrorMap, mirrorUV).rgb * mirrorTint, mirrorAmount);
                  outgoingLight = mix(outgoingLight, mirrorLive, uMirrorLive);
                }
              }
              #include <opaque_fragment>
            `,
            );
        };
        material.customProgramCacheKey = () =>
          key.call(material) + "|fd-court-mirror-2";
        this.entries.push({
          mesh,
          root,
          uniforms,
          center: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()),
          sphere: mesh.geometry.boundingSphere.clone(),
          normal: faceNormal,
          target: null,
          cube: null,
          live: false,
          ready: false,
          mix: 0,
          at: -Infinity,
          best: -Infinity,
          eye: new THREE.Vector3(),
          turn: new THREE.Quaternion(),
          pose: new THREE.Matrix4(),
        });
      });
    }
  }

  // How many mirrors reflect live, the best one's target size and the capture's face size, which
  // applies from the court's next preparation.
  setQuality(count, size, probeSize = this.probeSize) {
    this.count = count;
    this.size = size;
    this.probeSize = probeSize;
  }

  // Live candidates, largest on screen first: within reach, in view, facing and unobstructed.
  rank(camera) {
    this.frustum.setFromProjectionMatrix(
      this.matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const ranked = [];
    for (const entry of this.entries) {
      const sphere = this.sphere
        .copy(entry.sphere)
        .applyMatrix4(entry.mesh.matrixWorld);
      const distance = camera.position.distanceToSquared(sphere.center);
      if (distance > RANGE * RANGE || !this.frustum.intersectsSphere(sphere))
        continue;
      this.normal.copy(entry.normal).transformDirection(entry.mesh.matrixWorld);
      this.view.subVectors(camera.position, sphere.center);
      if (this.view.dot(this.normal) < 0.05) continue;
      const score = (sphere.radius * sphere.radius) / Math.max(0.1, distance);
      if (score <= 0.0025 || this.occluded(camera.position, sphere.center))
        continue;
      ranked.push({ entry, score });
    }
    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, this.count)
      .map(({ entry }) => entry);
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

  due(entry, camera, now) {
    return (
      !entry.ready ||
      now - entry.at >= STILL ||
      camera.position.distanceToSquared(entry.eye) >= 0.00001 ||
      Math.abs(camera.quaternion.dot(entry.turn)) <= 0.999999 ||
      !entry.pose.equals(entry.mesh.matrixWorld)
    );
  }

  // The best mirror is redrawn every frame it changes, and one other in turn, the oldest first.
  render(camera, live = true) {
    const now = performance.now();
    const step = Math.min(0.1, Math.max(0, now - this.time) / 1000);
    this.time = now;
    this.renders = 0;
    for (const entry of this.entries) {
      entry.mesh.updateWorldMatrix(true, false);
      entry.uniforms.uMirrorNormal.value
        .copy(entry.normal)
        .transformDirection(entry.mesh.matrixWorld);
    }
    let info = null;
    if (live) camera.updateMatrixWorld(true);
    const ranked = live ? this.rank(camera) : [];
    for (const entry of this.entries) entry.live = ranked.includes(entry);
    if (ranked[0]) ranked[0].best = now;
    const waiting = ranked
      .slice(1)
      .filter((entry) => this.due(entry, camera, now))
      .sort((a, b) => a.at - b.at);
    for (const entry of [ranked[0], waiting[0]]) {
      if (!entry || (entry === ranked[0] && !this.due(entry, camera, now)))
        continue;
      // A mirror keeps the full size for a second after it was the best, so two close rivals
      // do not reallocate their targets every frame.
      const size = now - entry.best < 1000 ? this.size : this.size / 2;
      const pass = this.draw(entry, camera, size, now);
      if (pass) {
        info = pass;
        this.renders++;
      }
    }
    for (const entry of this.entries) {
      const goal = entry.live && entry.ready ? 1 : 0;
      entry.mix =
        goal > entry.mix
          ? Math.min(goal, entry.mix + step / FADE)
          : Math.max(goal, entry.mix - step / FADE);
      entry.uniforms.uMirrorLive.value =
        entry.mix * entry.mix * (3 - 2 * entry.mix);
      if (!entry.live && entry.mix === 0 && entry.ready) this.rest(entry);
    }
    return info;
  }

  draw(entry, camera, size, now) {
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
    if (right <= left || bottom <= top) return null;
    eye.setViewOffset(width, height, left, top, right - left, bottom - top);
    this.projection
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
    // The explorer's meshes are never frustum culled; outside the reflected view she is left out.
    const hero = this.hero?.visible && this.hero.parent ? this.hero : null;
    if (hero) {
      this.frustum.setFromProjectionMatrix(
        this.matrix.multiplyMatrices(
          eye.projectionMatrix,
          eye.matrixWorldInverse,
        ),
      );
      hero.updateWorldMatrix(true, false);
      this.sphere.center.setFromMatrixPosition(hero.matrixWorld);
      this.sphere.center.y += 0.9;
      this.sphere.radius = 1.5;
    }
    const unseen = !!hero && !this.frustum.intersectsSphere(this.sphere);
    const target = (entry.target ??= new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 0,
    }));
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget(),
      planes = renderer.clippingPlanes;
    const viewport = renderer.getViewport(this.viewport);
    const autoShadow = renderer.shadowMap.autoUpdate,
      xr = renderer.xr.enabled;
    const visible = entry.mesh.visible;
    entry.mesh.visible = false;
    if (unseen) hero.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = false;
    try {
      entry.ready = false;
      if (target.width !== size) target.setSize(size, size);
      renderer.setRenderTarget(target);
      renderer.clippingPlanes = [];
      renderer.state.buffers.depth.setMask(true);
      if (!renderer.autoClear) renderer.clear();
      this.withoutLive(() => renderer.render(this.scene, eye));
      entry.uniforms.uMirrorMatrix.value.copy(this.projection);
      entry.uniforms.uMirrorMap.value = target.texture;
      entry.at = now;
      entry.eye.copy(camera.position);
      entry.turn.copy(camera.quaternion);
      entry.pose.copy(entry.mesh.matrixWorld);
      entry.ready = true;
      return { ...renderer.info.render };
    } finally {
      entry.mesh.visible = visible;
      if (unseen) hero.visible = true;
      renderer.shadowMap.autoUpdate = autoShadow;
      renderer.xr.enabled = xr;
      renderer.clippingPlanes = planes;
      renderer.setRenderTarget(previous);
      renderer.setViewport(viewport);
    }
  }

  // A live reflection is drawn for one viewpoint; any other view of the mirrors shows the capture.
  withoutLive(run) {
    const live = this.entries.map((entry) => entry.uniforms.uMirrorLive.value);
    for (const entry of this.entries) entry.uniforms.uMirrorLive.value = 0;
    try {
      return run();
    } finally {
      this.entries.forEach(
        (entry, i) => (entry.uniforms.uMirrorLive.value = live[i]),
      );
    }
  }

  // Draws each mirror's surroundings into a cube from its centre, the mirror itself and `hide`
  // left out. With `csm`, each face fits the cascades to itself and redraws their shadows.
  async capture({
    csm = null,
    hide = [],
    frame = async () => {},
    around = () => {},
  } = {}) {
    const { renderer, scene, probe } = this;
    for (const entry of this.entries) {
      await frame();
      entry.mesh.updateWorldMatrix(true, false);
      this.normal.copy(entry.normal).transformDirection(entry.mesh.matrixWorld);
      probe.position
        .copy(entry.center)
        .applyMatrix4(entry.mesh.matrixWorld)
        .addScaledVector(this.normal, 0.06);
      probe.updateMatrixWorld(true);
      around(probe);
      if (entry.cube?.width !== this.probeSize) {
        entry.cube?.dispose();
        entry.cube = new THREE.WebGLCubeRenderTarget(this.probeSize, {
          type: THREE.HalfFloatType,
        });
      }
      const hidden = [entry.root, ...hide].filter((node) => node?.visible);
      const previous = renderer.getRenderTarget(),
        face = renderer.getActiveCubeFace(),
        level = renderer.getActiveMipmapLevel(),
        planes = renderer.clippingPlanes,
        info = { ...renderer.info.render };
      const autoShadow = renderer.shadowMap.autoUpdate,
        xr = renderer.xr.enabled,
        view = csm?.camera;
      for (const node of hidden) node.visible = false;
      renderer.shadowMap.autoUpdate = !!csm;
      renderer.xr.enabled = false;
      try {
        this.withoutLive(() => {
          renderer.clippingPlanes = [];
          probe.children.forEach((eye, side) => {
            if (csm) {
              csm.camera = eye;
              csm.updateFrustums();
              csm.update();
            }
            renderer.setRenderTarget(entry.cube, side);
            if (!renderer.autoClear) renderer.clear();
            renderer.render(scene, eye);
          });
        });
      } finally {
        if (csm) {
          csm.camera = view;
          csm.updateFrustums();
          csm.update();
        }
        for (const node of hidden) node.visible = true;
        renderer.shadowMap.autoUpdate = autoShadow;
        renderer.xr.enabled = xr;
        renderer.clippingPlanes = planes;
        renderer.setRenderTarget(previous, face, level);
        Object.assign(renderer.info.render, info);
      }
      const floor = entry.root.getWorldPosition(this.point).y;
      entry.uniforms.uMirrorProbe.value.set(
        probe.position.x,
        probe.position.y,
        probe.position.z,
        floor - probe.position.y,
      );
      entry.uniforms.uMirrorCube.value = entry.cube.texture;
      entry.uniforms.uMirrorStill.value = 1;
    }
  }

  rest(entry) {
    entry.ready = false;
    entry.mix = 0;
    entry.uniforms.uMirrorLive.value = 0;
    entry.uniforms.uMirrorMap.value = this.fallback;
  }

  reset() {
    for (const entry of this.entries) {
      entry.live = false;
      entry.at = -Infinity;
      this.rest(entry);
    }
  }

  // Leaving the court frees the live targets; releasing its GPU resources frees the captures too.
  release({ captures = false } = {}) {
    this.reset();
    for (const entry of this.entries) entry.target?.dispose();
    if (!captures) return;
    for (const entry of this.entries) {
      entry.uniforms.uMirrorStill.value = 0;
      entry.uniforms.uMirrorCube.value = null;
      entry.cube?.dispose();
    }
  }

  telemetry() {
    return {
      count: this.count,
      renders: this.renders,
      live: this.entries.filter((entry) => entry.live).length,
      mirrors: this.entries.map((entry) => ({
        live: +entry.uniforms.uMirrorLive.value.toFixed(3),
        still: entry.uniforms.uMirrorStill.value,
        size: entry.ready ? entry.target.width : 0,
      })),
    };
  }
}

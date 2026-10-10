import * as THREE from "three";

// A box of flowing water with soft edges and still pockets in the lee of its ruins; its streaks
// and bubbles move on the GPU from one clock, so they cost a uniform per frame.
const LEES = 4;

export class CurrentField {
  constructor({ box, flow, speed, edge = 1.4, lees = [], streaks = 300 }) {
    this.box = box;
    this.flow = new THREE.Vector2(flow.x, flow.z).normalize();
    this.speed = speed;
    this.edge = edge;
    this.lees = lees;
    this.streaks = streaks;
    this.scale = 1;
    this.velocity = { x: 0, z: 0 };
  }

  share(x, y, z) {
    const b = this.box,
      e = this.edge;
    if (
      x < b.minX ||
      x > b.maxX ||
      z < b.minZ ||
      z > b.maxZ ||
      y < b.minY ||
      y > b.maxY
    )
      return 0;
    const ramp = (d) => Math.min(1, d / e);
    let k =
      ramp(x - b.minX) *
      ramp(b.maxX - x) *
      ramp(z - b.minZ) *
      ramp(b.maxZ - z) *
      ramp(y - b.minY) *
      ramp(b.maxY - y);
    for (const l of this.lees) {
      const inside = Math.min(
        x - l.minX,
        l.maxX - x,
        z - l.minZ,
        l.maxZ - z,
        y - l.minY,
        l.maxY - y,
      );
      if (inside > 0) k *= 1 - 0.9 * Math.min(1, inside / 0.6);
    }
    return k;
  }

  at(x, y, z) {
    const k = this.share(x, y, z) * this.speed * this.scale;
    this.velocity.x = this.flow.x * k;
    this.velocity.z = this.flow.y * k;
    return this.velocity;
  }

  build(scene) {
    const b = this.box,
      f = this.flow;
    let seed = 7 + this.streaks;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = this.streaks;
    const base = new Float32Array(n * 3),
      shape = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      base[i * 3] = b.minX + rand() * (b.maxX - b.minX);
      base[i * 3 + 1] = b.minY + 1 + rand() * (b.maxY - b.minY - 2);
      base[i * 3 + 2] = b.minZ + rand() * (b.maxZ - b.minZ);
      shape[i * 2] = rand();
      shape[i * 2 + 1] = rand();
    }
    const lees = Array.from({ length: LEES }, (_, i) => {
      const l = this.lees[i];
      return l
        ? [
            new THREE.Vector4(l.minX, l.maxX, l.minZ, l.maxZ),
            new THREE.Vector2(l.minY, l.maxY),
          ]
        : [new THREE.Vector4(1, -1, 1, -1), new THREE.Vector2(1, -1)];
    });
    const reach =
      Math.abs(f.x) * (b.maxX - b.minX) + Math.abs(f.y) * (b.maxZ - b.minZ);
    this.uniforms = {
      uTime: { value: 0 },
      uStrength: { value: 1 },
      uFlow: { value: new THREE.Vector3(f.x, 0, f.y) },
      uSpeed: { value: this.speed },
      uReach: { value: reach },
      uMin: { value: new THREE.Vector3(b.minX, b.minY, b.minZ) },
      uMax: { value: new THREE.Vector3(b.maxX, b.maxY, b.maxZ) },
      uLeeXZ: { value: lees.map((l) => l[0]) },
      uLeeY: { value: lees.map((l) => l[1]) },
    };
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-0.5, -1, 0, 0.5, -1, 0, 0.5, 1, 0, -0.5, 1, 0],
        3,
      ),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    quad.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
    quad.setAttribute("aShape", new THREE.InstancedBufferAttribute(shape, 2));
    quad.instanceCount = n;
    const shared = /* glsl */ `
      uniform float uTime; uniform float uStrength; uniform float uSpeed; uniform float uReach;
      uniform vec3 uFlow; uniform vec3 uMin; uniform vec3 uMax;
      uniform vec4 uLeeXZ[${LEES}]; uniform vec2 uLeeY[${LEES}];
      attribute vec3 aBase; attribute vec2 aShape;
      float calm(vec3 p) {
        float k = 1.0;
        for (int i = 0; i < ${LEES}; i++) {
          vec4 r = uLeeXZ[i]; vec2 h = uLeeY[i];
          float inside = min(min(min(p.x - r.x, r.y - p.x), min(p.z - r.z, r.w - p.z)), min(p.y - h.x, h.y - p.y));
          k *= 1.0 - 0.95 * clamp(inside / 0.5 + 0.5, 0.0, 1.0);
        }
        return k;
      }
      vec3 carried(float pace, out float fade) {
        float s = mod(aShape.x * uReach + uTime * uSpeed * pace, uReach);
        fade = smoothstep(0.0, 2.0, s) * (1.0 - smoothstep(uReach - 2.0, uReach, s));
        vec3 start = vec3(uFlow.x > 0.0 ? uMin.x : uFlow.x < 0.0 ? uMax.x : aBase.x, aBase.y,
          uFlow.z > 0.0 ? uMin.z : uFlow.z < 0.0 ? uMax.z : aBase.z);
        return start + uFlow * s;
      }`;
    const streakMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${shared}
        varying vec2 vQuad; varying float vAlpha;
        void main() {
          float fade;
          vec3 c = carried(0.85 + 0.3 * aShape.y, fade);
          c.y += sin(uTime * 0.9 + aShape.x * 40.0) * 0.25;
          float len = 1.2 + 2.0 * aShape.y;
          vec3 toEye = normalize(cameraPosition - c);
          vec3 side = normalize(cross(uFlow, toEye) + vec3(0.0, 1e-4, 0.0));
          vec3 p = c + uFlow * position.x * len + side * position.y * (0.07 + 0.08 * aShape.x);
          vQuad = position.xy;
          float dist = length(cameraPosition - p);
          vAlpha = fade * calm(c) * uStrength * smoothstep(0.6, 2.5, dist) * exp(-dist * 0.035);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQuad; varying float vAlpha;
        void main() {
          float across = 1.0 - smoothstep(0.0, 1.0, abs(vQuad.y));
          float along = smoothstep(-0.5, -0.1, vQuad.x) * (1.0 - smoothstep(0.1, 0.5, vQuad.x));
          gl_FragColor = vec4(vec3(0.62, 0.86, 0.92), across * along * vAlpha * 0.45);
        }`,
    });
    this.streakMesh = new THREE.Mesh(quad, streakMaterial);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.name = "currentStreaks";
    scene.add(this.streakMesh);

    const m = Math.round(n * 0.4);
    const dots = new THREE.BufferGeometry();
    const at = new Float32Array(m * 3),
      seeds = new Float32Array(m * 2);
    for (let i = 0; i < m; i++) {
      at[i * 3] = base[i * 3];
      at[i * 3 + 1] = base[i * 3 + 1];
      at[i * 3 + 2] = base[i * 3 + 2];
      seeds[i * 2] = rand();
      seeds[i * 2 + 1] = rand();
    }
    dots.setAttribute("position", new THREE.BufferAttribute(at, 3));
    dots.setAttribute("aBase", new THREE.BufferAttribute(at, 3));
    dots.setAttribute("aShape", new THREE.BufferAttribute(seeds, 2));
    const bubbleMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${shared}
        varying float vAlpha;
        void main() {
          float fade;
          vec3 c = carried(0.7 + 0.25 * aShape.y, fade);
          c.y += mod(uTime * 0.35 + aShape.y * 3.0, 3.0) - 1.5;
          c.x += sin(uTime * 2.3 + aShape.x * 31.0) * 0.08;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float dist = -mv.z;
          vAlpha = fade * calm(c) * uStrength * smoothstep(0.6, 2.0, dist) * exp(-dist * 0.03);
          gl_PointSize = min(14.0, (55.0 + 40.0 * aShape.x) / max(0.5, dist));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float ring = (1.0 - smoothstep(0.38, 0.5, d)) * (0.3 + 0.7 * smoothstep(0.18, 0.4, d));
          gl_FragColor = vec4(0.8, 0.95, 1.0, ring * vAlpha * 0.7);
        }`,
    });
    this.bubbles = new THREE.Points(dots, bubbleMaterial);
    this.bubbles.frustumCulled = false;
    this.bubbles.name = "currentBubbles";
    scene.add(this.bubbles);
    return this;
  }

  update(dt, show = 1) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uStrength.value = show * this.scale;
    this.streakMesh.visible = this.bubbles.visible = show > 0;
  }

  // Visible for shader preparation even where it is switched off in play.
  visuals() {
    return [
      [this.streakMesh, "visible", true],
      [this.bubbles, "visible", true],
    ];
  }
}

import * as THREE from "three";

// Sunlight as a 2D ray at a fixed height, bounced by mirror faces and caught by stelae.
// A mirror reflects only from its polished front; a stela accepts light within 30 degrees
// of head-on and holds it after a short charge. Mirrors turn freely all the way round and
// snap onto a target the reflected ray nearly meets, so aiming is forgiving without being
// automatic.

const MIRROR_HALF = 0.6,
  LENS_HALF = 0.34,
  ACCEPT = -0.866,
  CHARGE = 0.45,
  HOLD = 0.6,
  SNAP = THREE.MathUtils.degToRad(4.5),
  MAX_BOUNCES = 8,
  RANGE = 70;

export class Beams {
  constructor(scene, world, level, source, height) {
    this.world = world;
    this.level = level;
    this.source = source;
    this.height = height;
    this.segments = [];
    this.group = new THREE.Group();
    this.group.name = "beams";
    scene.add(this.group);
    this.pool = [];
    this.hitMirrors = new Map();
    this.onLit = null;
    this.time = 0;
    this.makeMaterials();
    this.makeShaft();
    this.makeMotes();
  }

  // Sunlight falls through a slot in the west cliff onto the catcher mirror. The cliff's
  // shadow covers the catcher, so the slot's light is a spot of its own: it lights the
  // catcher, the floor around it and the block, and casts no shadow.
  makeShaft() {
    const len = 10;
    const geo = new THREE.CylinderGeometry(
      0.55,
      1.5,
      len,
      24,
      1,
      true,
    ).translate(0, len / 2, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vView;
        void main() {
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vView; uniform float uTime;
        void main() {
          float facing = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
          float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          float drift = 0.8 + 0.2 * sin(vUv.y * 24.0 - uTime * 0.7 + vUv.x * 12.0);
          vec3 c = vec3(1.0, 0.72, 0.38) * facing * along * drift * 0.32;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const shaft = new THREE.Mesh(geo, mat);
    const from = new THREE.Vector3(
      this.source.x - 0.2,
      this.height,
      this.source.z,
    );
    const slot = new THREE.Vector3(1.4, 5.2, this.source.z);
    const dir = slot.clone().sub(from).normalize();
    shaft.position.copy(from);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.renderOrder = 6;
    shaft.frustumCulled = false;
    this.group.add(shaft);
    this.shaft = shaft;
    // No decay: the sun's rays are parallel, so the patch is even, soft at its edges.
    const sun = new THREE.SpotLight(0xffe3c0, 35, 18, 0.48, 0.85, 0);
    sun.position.copy(slot);
    sun.target.position.set(this.source.x + 2, 0, this.source.z);
    this.group.add(sun, sun.target);
    const glow = new THREE.PointLight(0xffb060, 9, 7, 1.6);
    glow.position.set(this.source.x + 0.6, this.height + 0.4, this.source.z);
    this.group.add(glow);
  }

  // Dust turning in the light: motes drift along the lit segments and in the shaft.
  makeMotes() {
    const count = 420;
    const geo = new THREE.BufferGeometry();
    this.motePos = new Float32Array(count * 3);
    this.moteSeed = Float32Array.from({ length: count * 4 }, () =>
      Math.random(),
    );
    geo.setAttribute("position", new THREE.BufferAttribute(this.motePos, 3));
    geo.setAttribute(
      "seed",
      new THREE.BufferAttribute(this.moteSeed.slice(0, count), 1),
    );
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.5 + seed * 3.0) + seed * 40.0));
          gl_PointSize = (0.035 + seed * 0.03) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * 1.4, 1.0);
        }`,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 7;
    this.group.add(this.motes);
  }

  updateMotes(dt) {
    const segs = this.segments;
    const total =
      segs.reduce((a, s) => a + Math.hypot(s.x1 - s.x0, s.z1 - s.z0), 0) || 1;
    const count = this.motePos.length / 3;
    const shaftCount = Math.floor(count * 0.3);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.shaft.quaternion,
    );
    for (let i = 0; i < count; i++) {
      const a = this.moteSeed[i * 4],
        b = this.moteSeed[i * 4 + 1],
        c = this.moteSeed[i * 4 + 2],
        e = this.moteSeed[i * 4 + 3];
      const t = (a + this.time * (0.004 + b * 0.01)) % 1;
      const wob = Math.sin(this.time * (0.4 + c) + e * 20) * 0.08;
      let x, y, z;
      if (i < shaftCount) {
        const along = t * 8,
          r = (0.4 + along * 0.08) * Math.sqrt(c),
          ang = e * Math.PI * 2 + this.time * 0.1;
        x = this.shaft.position.x + dir.x * along + Math.cos(ang) * r;
        y =
          this.shaft.position.y + dir.y * along + Math.sin(ang) * r * 0.6 + wob;
        z = this.shaft.position.z + dir.z * along + Math.sin(ang) * r;
      } else {
        let d = t * total;
        let s = segs[0];
        for (const seg of segs) {
          const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
          s = seg;
          if (d <= len) break;
          d -= len;
        }
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) || 1;
        const k = Math.min(1, d / len);
        const r = 0.22 * Math.sqrt(c),
          ang = e * Math.PI * 2;
        x =
          s.x0 + (s.x1 - s.x0) * k + (-(s.z1 - s.z0) / len) * Math.cos(ang) * r;
        y = this.height + Math.sin(ang) * r + wob;
        z =
          s.z0 + (s.z1 - s.z0) * k + ((s.x1 - s.x0) / len) * Math.cos(ang) * r;
      }
      this.motePos[i * 3] = x;
      this.motePos[i * 3 + 1] = y;
      this.motePos[i * 3 + 2] = z;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.material.uniforms.uTime.value = this.time;
    this.shaft.material.uniforms.uTime.value = this.time;
    void dt;
  }

  makeMaterials() {
    const fade = (inner, outer) => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 4;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, `rgba(255,255,255,${outer})`);
      g.addColorStop(0.5, `rgba(255,255,255,${inner})`);
      g.addColorStop(1, `rgba(255,255,255,${outer})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 4);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const additive = (color, map, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        map,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
    this.coreMat = additive(new THREE.Color(2.1, 1.5, 0.75), null, 1);
    this.glowMat = additive(
      new THREE.Color(1.0, 0.6, 0.26),
      fade(0.45, 0),
      0.38,
    );
    this.coreGeo = new THREE.CylinderGeometry(
      0.018,
      0.018,
      1,
      8,
      1,
      true,
    ).translate(0, 0.5, 0);
    this.glowGeo = new THREE.CylinderGeometry(
      0.12,
      0.12,
      1,
      12,
      1,
      true,
    ).translate(0, 0.5, 0);
    const flare = document.createElement("canvas");
    flare.width = flare.height = 64;
    const ctx = flare.getContext("2d");
    const rg = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.25, "rgba(255,230,180,0.6)");
    rg.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 64, 64);
    const ft = new THREE.CanvasTexture(flare);
    ft.colorSpace = THREE.SRGBColorSpace;
    this.flareMat = new THREE.SpriteMaterial({
      map: ft,
      color: new THREE.Color(2.4, 2.0, 1.4),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  }

  piece(i) {
    while (this.pool.length <= i) {
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      const flare = new THREE.Sprite(this.flareMat);
      flare.scale.setScalar(0.9);
      for (const o of [core, glow, flare]) {
        o.frustumCulled = false;
        o.renderOrder = 5;
        this.group.add(o);
      }
      this.pool.push({ core, glow, flare });
    }
    return this.pool[i];
  }

  // --- tracing --------------------------------------------------------------
  trace() {
    const H = this.height;
    let px = this.source.x + this.source.dir[0] * 0.7,
      pz = this.source.z + this.source.dir[1] * 0.7;
    let dx = this.source.dir[0],
      dz = this.source.dir[1];
    const segs = [];
    const lit = new Map();
    let receiving = null,
      last = null;
    for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
      let best = RANGE,
        kind = null,
        target = null;
      const wall = this.world.ray(
        px,
        H,
        pz,
        dx,
        0,
        dz,
        RANGE,
        (b) => b.kind !== "mirror" && b.kind !== "stela",
      );
      if (wall) best = wall.t;
      for (const m of this.level.mirrors) {
        if (m === last) continue;
        const t = hitMirror(px, pz, dx, dz, m);
        if (t !== null && t < best) {
          best = t;
          kind = "mirror";
          target = m;
        }
      }
      for (const s of this.level.receivers) {
        const t = rayBox2(px, pz, dx, dz, s.box);
        if (t !== null && t < best) {
          best = t;
          kind = "stela";
          target = s;
        }
      }
      const ex = px + dx * best,
        ez = pz + dz * best;
      segs.push({
        x0: px,
        z0: pz,
        x1: ex,
        z1: ez,
        end: kind || (wall ? "wall" : "none"),
      });
      if (kind === "mirror") {
        const n = { x: Math.sin(target.yaw), z: Math.cos(target.yaw) };
        const dn = dx * n.x + dz * n.z;
        lit.set(target, { dx, dz });
        if (dn >= 0) break;
        dx -= 2 * dn * n.x;
        dz -= 2 * dn * n.z;
        px = ex;
        pz = ez;
        last = target;
        continue;
      }
      if (kind === "stela") {
        const f = target.facing;
        const lensX = target.x + f.x * 0.3,
          lensZ = target.z + f.z * 0.3;
        const lateral = Math.abs((ex - lensX) * -f.z + (ez - lensZ) * f.x);
        if (dx * f.x + dz * f.z < ACCEPT && lateral < LENS_HALF + 0.12) {
          receiving = target;
          segs[segs.length - 1].x1 = lensX;
          segs[segs.length - 1].z1 = lensZ;
        }
      }
      break;
    }
    this.segments = segs;
    this.hitMirrors = lit;
    this.receiving = receiving;
    return segs;
  }

  // The direction light leaves a mirror at a given yaw, or null if it is not lit or faces away.
  outgoing(mirror, yaw) {
    const hit = this.hitMirrors.get(mirror);
    if (!hit) return null;
    const n = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const dn = hit.dx * n.x + hit.dz * n.z;
    if (dn >= 0) return null;
    return { x: hit.dx - 2 * dn * n.x, z: hit.dz - 2 * dn * n.z };
  }

  // Turning a mirror: free rotation, with a gentle catch when the ray lines up on a target.
  // Right on the stick turns the mirror clockwise seen from above, left the other way:
  // the same on screen from wherever the camera looks down on it.
  turn(mirror, delta) {
    // A catch holds for a moment even under steady input, long enough to light a stela.
    if (mirror.locked && this.time - mirror.lockedAt < HOLD) {
      mirror.pending = 0;
      return false;
    }
    mirror.pending = (mirror.pending || 0) + delta;
    if (mirror.locked) {
      if (Math.abs(mirror.pending) < SNAP * 1.6) return false;
      mirror.locked = null;
    }
    // Mirrors turn all the way round. Turned away from the light, the beam simply stops on
    // the unpolished back, and comes back as the face swings round again.
    mirror.yaw = Math.atan2(
      Math.sin(mirror.yaw + mirror.pending),
      Math.cos(mirror.yaw + mirror.pending),
    );
    mirror.pending = 0;
    const out = this.outgoing(mirror, mirror.yaw);
    if (!out) return false;
    const hit = this.hitMirrors.get(mirror);
    for (const t of this.targets(mirror)) {
      const ang =
        Math.atan2(t.z - mirror.z, t.x - mirror.x) - Math.atan2(out.z, out.x);
      const d = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(d) > SNAP) continue;
      const len = Math.hypot(t.x - mirror.x, t.z - mirror.z);
      const want = { x: (t.x - mirror.x) / len, z: (t.z - mirror.z) / len };
      const nx = want.x - hit.dx,
        nz = want.z - hit.dz;
      if (t.ref === mirror.lastCatch && this.time - mirror.lockedAt < HOLD * 2)
        continue;
      mirror.yaw = Math.atan2(nx, nz);
      mirror.locked = t;
      mirror.lastCatch = t.ref;
      mirror.lockedAt = this.time;
      return true;
    }
    return false;
  }

  targets(mirror) {
    const list = [];
    for (const m of this.level.mirrors)
      if (m !== mirror) list.push({ x: m.x, z: m.z, ref: m });
    for (const s of this.level.receivers)
      list.push({
        x: s.x + s.facing.x * 0.3,
        z: s.z + s.facing.z * 0.3,
        ref: s,
      });
    return list;
  }

  update(dt) {
    this.time += dt;
    const segs = this.trace();
    const H = this.height;
    const up = new THREE.Vector3(0, 1, 0);
    const shimmer =
      0.85 +
      Math.sin(this.time * 7.3) * 0.08 +
      Math.sin(this.time * 13.1) * 0.05;
    segs.forEach((s, i) => {
      const p = this.piece(i);
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const dir = new THREE.Vector3(
        (s.x1 - s.x0) / len,
        0,
        (s.z1 - s.z0) / len,
      );
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      for (const m of [p.core, p.glow]) {
        m.visible = true;
        m.position.set(s.x0, H, s.z0);
        m.quaternion.copy(q);
        m.scale.set(1, len, 1);
      }
      p.glow.scale.x = p.glow.scale.z = shimmer;
      p.flare.visible = s.end !== "none";
      p.flare.position.set(s.x1 - dir.x * 0.05, H, s.z1 - dir.z * 0.05);
      p.flare.scale.setScalar((s.end === "stela" ? 1.6 : 1.0) * shimmer);
    });
    for (let i = segs.length; i < this.pool.length; i++) {
      const p = this.pool[i];
      p.core.visible = p.glow.visible = p.flare.visible = false;
    }
    this.updateMotes(dt);
    for (const s of this.level.receivers) {
      if (s.lit) continue;
      s.charge =
        s === this.receiving ? s.charge + dt : Math.max(0, s.charge - dt * 2);
      if (s.charge >= CHARGE) {
        s.lit = true;
        this.onLit?.(s);
      }
    }
  }
}

function hitMirror(px, pz, dx, dz, m) {
  const n = { x: Math.sin(m.yaw), z: Math.cos(m.yaw) };
  const denom = dx * n.x + dz * n.z;
  if (Math.abs(denom) < 1e-4) return null;
  const t = ((m.x - px) * n.x + (m.z - pz) * n.z) / denom;
  if (t <= 1e-3) return null;
  const hx = px + dx * t - m.x,
    hz = pz + dz * t - m.z;
  return Math.abs(hx * -n.z + hz * n.x) <= MIRROR_HALF ? t : null;
}

function rayBox2(px, pz, dx, dz, b) {
  let t0 = 0,
    t1 = RANGE;
  for (const [o, d, lo, hi] of [
    [px, dx, b.minX, b.maxX],
    [pz, dz, b.minZ, b.maxZ],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d,
      c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0 > 1e-3 ? t0 : null;
}

import * as THREE from "three";

// Sand kicked up by landings and scraping blocks: soft sprites that billow out and fade.
export class Dust {
  constructor(scene, count = 90) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map,
          color: 0xd9b88a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      sprite.visible = false;
      scene.add(sprite);
      this.items.push({
        sprite,
        life: 0,
        max: 1,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
      });
    }
    this.next = 0;
  }

  // Moves every puff into another scene, tinted for its ground.
  moveTo(scene, color) {
    for (const p of this.items) {
      scene.add(p.sprite);
      p.sprite.material.color.setHex(color);
    }
  }

  // A ring of puffs at a point; strength scales count, spread and size.
  burst(x, y, z, strength = 1, count = 10) {
    for (let i = 0; i < count; i++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const v = (0.8 + Math.random() * 1.4) * strength;
      Object.assign(p, {
        life: 0,
        max: 0.6 + Math.random() * 0.5,
        vx: Math.cos(a) * v,
        vy: 0.3 + Math.random() * 0.6 * strength,
        vz: Math.sin(a) * v,
        size: (0.35 + Math.random() * 0.3) * (0.7 + strength * 0.5),
      });
      p.sprite.position.set(
        x + Math.cos(a) * 0.2,
        y + 0.08,
        z + Math.sin(a) * 0.2,
      );
      p.sprite.visible = true;
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.sprite.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      const drag = Math.exp(-dt * 3.5);
      p.vx *= drag;
      p.vz *= drag;
      p.vy *= drag;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.size * (1 + k * 1.6));
      p.sprite.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 8);
    }
  }
}

// Ink left where a Warden's stamp came down: its glyph in a ring, ochre on the ground, red and
// struck through on the wrong plate, turquoise on the right one. Marks are pooled, one
// material each, so stamping never creates anything new during play.
const INKS = {
  ground: "rgba(196,138,40,0.92)",
  void: "rgba(178,44,34,0.95)",
  plate: "rgba(90,240,222,0.95)",
};

export class Stamps {
  constructor(scene, glyphs, draw) {
    this.scene = scene;
    this.textures = new Map();
    for (const glyph of glyphs)
      for (const [kind, ink] of Object.entries(INKS)) {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d");
        ctx.strokeStyle = ink;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(128, 128, 106, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(128, 128, 84, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2.6;
        draw(ctx, glyph, 128, 128, 130);
        if (kind === "void") {
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.moveTo(52, 52);
          ctx.lineTo(204, 204);
          ctx.moveTo(204, 52);
          ctx.lineTo(52, 204);
          ctx.stroke();
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(`${glyph}:${kind}`, t);
      }
    const geo = new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2);
    this.items = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: this.textures.values().next().value,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          opacity: 0,
        }),
      );
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.items.push({ m, life: 0 });
    }
    this.next = 0;
  }

  mark(x, y, z, glyph, kind = "ground") {
    const s = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    s.m.material.map =
      this.textures.get(`${glyph}:${kind}`) || s.m.material.map;
    s.m.position.set(x, y + 0.03 + this.next * 0.001, z);
    s.m.rotation.y = Math.random() * Math.PI * 2;
    s.m.visible = true;
    s.life = kind === "plate" ? 6 : 3.5;
  }

  update(dt) {
    for (const s of this.items) {
      if (!s.m.visible) continue;
      s.life -= dt;
      s.m.material.opacity = Math.min(1, s.life);
      if (s.life <= 0) s.m.visible = false;
    }
  }

  clear() {
    for (const s of this.items) s.m.visible = false;
  }
}

const DROPS = 72;
const MARKS = 40;
const PUFFS = 4;
const UP = new THREE.Vector3(0, 1, 0);

function bloodTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  const noise = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / (size / 2) - 1,
        dy = (y + 0.5) / (size / 2) - 1;
      const angle = Math.atan2(dy, dx);
      const edge =
        0.78 +
        0.09 * Math.sin(angle * 3 + 0.6) +
        0.06 * Math.sin(angle * 7 + 2.1) +
        0.04 * noise(Math.floor(angle * 9), 3);
      const r = Math.hypot(dx, dy) / edge;
      const offset = (y * size + x) * 4;
      const shade = 0.7 + 0.3 * Math.min(1, r) + 0.06 * noise(x, y);
      pixels[offset] = 96 * shade;
      pixels[offset + 1] = 6 * shade;
      pixels[offset + 2] = 7 * shade;
      pixels[offset + 3] = r < 1 ? 255 : 0;
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function dropTexture() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(
        (x + 0.5) / (size / 2) - 1,
        (y + 0.5) / (size / 2) - 1,
      );
      const offset = (y * size + x) * 4;
      pixels.fill(255, offset, offset + 3);
      pixels[offset + 3] = Math.max(0, 1 - r ** 3) * 255;
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Pistol hits on living creatures: a brief red mist, droplets that fall and spot the ground,
// and a dark pool that spreads under a fallen animal. Every buffer and material exists from
// construction, so a hit only rewrites pooled slots.
export class Blood {
  constructor(scene, groundAt) {
    this.groundAt = groundAt;
    this.drops = Array.from({ length: DROPS }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      size: 0,
      marks: false,
    }));
    this.nextDrop = 0;
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["dropSize", 1],
      ["dropAlpha", 1],
    ])
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(DROPS * size), size),
      );
    const dropMaterial = new THREE.PointsMaterial({
      color: 0x6d0909,
      map: dropTexture(),
      size: 1,
      transparent: true,
      depthWrite: false,
    });
    dropMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "attribute float dropSize;\nattribute float dropAlpha;\nvarying float vDropAlpha;\n" +
        shader.vertexShader.replace(
          "gl_PointSize = size;",
          "gl_PointSize = size * dropSize;\nvDropAlpha = dropAlpha;",
        );
      shader.fragmentShader =
        "varying float vDropAlpha;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.a *= vDropAlpha;",
        );
    };
    dropMaterial.customProgramCacheKey = () => "fd-blood-drops-v1";
    this.cloud = new THREE.Points(geometry, dropMaterial);
    this.cloud.name = "Blood droplets";
    this.cloud.frustumCulled = false;
    this.cloud.visible = false;
    scene.add(this.cloud);

    const puffMap = dropTexture();
    this.puffs = Array.from({ length: PUFFS }, () => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puffMap,
          color: 0x7a0b0b,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      sprite.name = "Blood mist";
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, life: 0, max: 0.3, size: 0.2 };
    });
    this.nextPuff = 0;

    this.marks = Array.from({ length: MARKS }, () => ({
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      radius: 0,
      age: 0,
      grow: 0,
      fade: Infinity,
      active: false,
    }));
    this.nextMark = 0;
    this.markMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        map: bloodTexture(),
        alphaTest: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      MARKS,
    );
    this.markMesh.name = "Blood on the ground";
    this.markMesh.count = 0;
    this.markMesh.frustumCulled = false;
    this.markMesh.castShadow = false;
    this.markMesh.receiveShadow = true;
    this.markMesh.visible = false;
    scene.add(this.markMesh);
    this.pending = [];
    this.matrix = new THREE.Matrix4();
    this.scale = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.spin = new THREE.Quaternion();
  }

  // A spray at the impact, carried along the shot and thrown slightly upward.
  spray(point, direction, scale = 1) {
    if (!point || !direction) return;
    const puff = this.puffs[this.nextPuff];
    this.nextPuff = (this.nextPuff + 1) % PUFFS;
    puff.life = 0;
    puff.max = 0.26 + 0.08 * scale;
    puff.size = 0.16 + 0.12 * scale;
    puff.sprite.position.copy(point);
    puff.sprite.visible = true;
    const count = Math.round(8 + 6 * scale);
    for (let i = 0; i < count; i++) {
      const drop = this.drops[this.nextDrop];
      this.nextDrop = (this.nextDrop + 1) % DROPS;
      drop.position.copy(point);
      drop.velocity
        .set(
          direction.x + (Math.random() - 0.5) * 1.3,
          Math.max(0, direction.y) * 0.5 + 0.25 + Math.random() * 0.9,
          direction.z + (Math.random() - 0.5) * 1.3,
        )
        .normalize()
        .multiplyScalar((0.8 + Math.random() * 2) * (0.7 + 0.3 * scale));
      drop.life = 1.8;
      drop.size = (0.018 + Math.random() * 0.03) * (0.75 + 0.35 * scale);
      drop.marks = i % 3 === 0;
    }
    this.flying = true;
  }

  // A pool that spreads under whatever `at` returns once `ready` reports the body at rest.
  pool(at, radius, ready = () => true) {
    this.pending.push({ at, radius, ready, wait: 0.35 });
  }

  mark(x, y, z, radius, grow, fade) {
    const mark = this.marks[this.nextMark];
    this.nextMark = (this.nextMark + 1) % MARKS;
    mark.position.set(x, y + 0.012, z);
    mark.radius = radius;
    mark.age = 0;
    mark.grow = grow;
    mark.fade = fade;
    mark.active = true;
    this.marksDirty = true;
    this.normal.set(0, 1, 0);
    if (radius > 0.15) {
      const span = Math.min(0.5, radius);
      const east = this.groundAt(x + span, z),
        north = this.groundAt(x, z + span);
      if (Number.isFinite(east) && Number.isFinite(north))
        this.normal.set((y - east) / span, 1, (y - north) / span).normalize();
    }
    mark.rotation
      .setFromUnitVectors(UP, this.normal)
      .multiply(this.spin.setFromAxisAngle(UP, Math.random() * Math.PI * 2));
  }

  fly(dt) {
    const { position, dropSize, dropAlpha } = this.cloud.geometry.attributes;
    let flying = 0;
    for (let i = 0; i < DROPS; i++) {
      const drop = this.drops[i];
      if (drop.life > 0) {
        drop.life -= dt;
        drop.velocity.y -= 9.8 * dt;
        drop.position.addScaledVector(drop.velocity, dt);
        const ground = this.groundAt(drop.position.x, drop.position.z);
        if (Number.isFinite(ground) && drop.position.y <= ground) {
          if (drop.marks)
            this.mark(
              drop.position.x,
              ground,
              drop.position.z,
              drop.size * (1.6 + Math.random()),
              0.12,
              9 + Math.random() * 3,
            );
          drop.life = 0;
        }
      }
      if (drop.life <= 0) {
        dropAlpha.setX(i, 0);
        continue;
      }
      position.setXYZ(i, drop.position.x, drop.position.y, drop.position.z);
      dropSize.setX(i, drop.size);
      dropAlpha.setX(i, Math.min(1, drop.life * 4));
      flying++;
    }
    position.needsUpdate = dropSize.needsUpdate = dropAlpha.needsUpdate = true;
    this.cloud.visible = this.flying = flying > 0;
  }

  update(dt) {
    if (dt <= 0) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const request = this.pending[i];
      if (!request.ready()) continue;
      request.wait -= dt;
      if (request.wait > 0) continue;
      const at = request.at();
      const ground = this.groundAt(at.x, at.z);
      if (Number.isFinite(ground))
        this.mark(at.x, ground, at.z, request.radius, 3.4, Infinity);
      this.pending.splice(i, 1);
    }
    for (const puff of this.puffs) {
      if (!puff.sprite.visible) continue;
      puff.life += dt;
      const k = puff.life / puff.max;
      if (k >= 1) {
        puff.sprite.visible = false;
        continue;
      }
      puff.sprite.scale.setScalar(puff.size * (0.6 + k * 1.1));
      puff.sprite.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 10);
    }
    if (this.flying) this.fly(dt);
    let changing = this.marksDirty;
    for (const mark of this.marks) {
      if (!mark.active) continue;
      mark.age += dt;
      if (mark.age < mark.grow + dt || mark.age > mark.fade) changing = true;
      if (mark.age > mark.fade + 1) mark.active = false;
    }
    if (!changing) return;
    this.marksDirty = false;
    let count = 0;
    for (const mark of this.marks) {
      if (!mark.active) continue;
      const spread = mark.grow > 0 ? Math.min(1, mark.age / mark.grow) : 1;
      const size =
        mark.radius *
        (1 - (1 - spread) ** 3) *
        (mark.age > mark.fade ? 1 - (mark.age - mark.fade) : 1);
      this.matrix.compose(
        mark.position,
        mark.rotation,
        this.scale.set(size, 1, size),
      );
      this.markMesh.setMatrixAt(count++, this.matrix);
    }
    this.markMesh.count = count;
    this.markMesh.instanceMatrix.needsUpdate = true;
    this.markMesh.visible = count > 0;
  }

  clear() {
    this.pending.length = 0;
    for (const drop of this.drops) drop.life = 0;
    for (const puff of this.puffs) puff.sprite.visible = false;
    for (const mark of this.marks) mark.active = false;
    this.cloud.geometry.attributes.dropAlpha.array.fill(0);
    this.cloud.geometry.attributes.dropAlpha.needsUpdate = true;
    this.cloud.visible = this.flying = false;
    this.markMesh.count = 0;
    this.markMesh.visible = false;
  }
}

// The ring a winding-up Warden paints on the ground where its stamp will land. It fills as
// the stamp rises: ochre on the ground, turquoise over the matching plate, red over the wrong one.
export class Telegraphs {
  constructor(scene, count = 3) {
    this.items = [];
    // The stamp's reach (wardens.js STAMP_RADIUS): inside the ring is hit, outside is not.
    const geo = new THREE.CircleGeometry(0.9, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const uniforms = {
        uFill: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.6, 1.0, 0.25) },
      };
      const m = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz / 0.9; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            uniform float uFill; uniform float uTime; uniform vec3 uColor; varying vec2 vP;
            void main() {
              float r = length(vP);
              float rim = smoothstep(0.84, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
              float fill = (1.0 - smoothstep(uFill - 0.03, uFill, r)) * 0.32;
              float pulse = 0.75 + 0.25 * sin(uTime * 18.0);
              float a = max(rim * pulse, fill);
              gl_FragColor = vec4(uColor * (0.6 + a), a);
            }`,
        }),
      );
      m.visible = false;
      m.renderOrder = 3;
      m.frustumCulled = false;
      scene.add(m);
      this.items.push({ m, uniforms, owner: null, t: 0, duration: 0.85 });
    }
  }

  show(owner, x, y, z, tone = "ground", duration = 0.85) {
    let slot =
      this.items.find((s) => s.owner === owner) ||
      this.items.find((s) => !s.owner);
    if (!slot) slot = this.items[0];
    slot.owner = owner;
    slot.t = 0;
    slot.duration = duration;
    slot.m.position.set(x, y + 0.04, z);
    slot.m.visible = true;
    const c = {
      ground: [1.6, 1.0, 0.25],
      plate: [0.3, 2.2, 2.0],
      void: [2.2, 0.35, 0.25],
    }[tone];
    slot.uniforms.uColor.value.setRGB(...c);
  }

  hide(owner) {
    for (const s of this.items)
      if (s.owner === owner) {
        s.owner = null;
        s.m.visible = false;
      }
  }

  update(dt) {
    for (const s of this.items) {
      if (!s.owner) continue;
      s.t += dt;
      s.uniforms.uFill.value = Math.min(1, s.t / s.duration);
      s.uniforms.uTime.value += dt;
    }
  }

  clear() {
    for (const s of this.items) {
      s.owner = null;
      s.m.visible = false;
    }
  }
}

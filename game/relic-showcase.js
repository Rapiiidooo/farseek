import * as THREE from "three";
import { recordFigure } from "./relic-figures.js";

// The Relics screens' stage, drawn in place of the world while they are open: every relic on a
// gentle arc in a dark room, the chosen one turning in a pool of the builders' light at the
// front, and the ones not found yet as dark shapes. Inspecting brings the relic beside its text,
// where a drag turns it over.

const ARC = 0.36;
const RADIUS = 3.6;
const SIZE = 0.6;
const HEIGHT = 0.9;
const SPIN = 0.35;

// How a relic faces the eye: a turn about its own x and y, and a size relative to the others.
const POSE = {
  papyrus: { x: 0.95, y: 0.5 },
  page: { x: 0.95, y: 0.5 },
  "grove-map": { x: 0.95, y: 0.5 },
  "pressure-log": { x: 0.95, y: 0.5 },
  radio: { y: 0.5, size: 1.15 },
  scarf: { y: 0.4 },
  lantern: { size: 0.85 },
  "sun-memory": { size: 0.85 },
};

const wrap = (value, n) => ((((value + n / 2) % n) + n) % n) - n / 2;

export class RelicShowcase {
  constructor({ renderer, assets, reduced }) {
    this.renderer = renderer;
    this.assets = assets;
    this.reduced = reduced;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
    this.items = [];
    this.index = 0;
    this.position = 0;
    this.focus = 0;
    this.inspecting = false;
    this.drag = null;
    this.time = 0;
    this.area = null;
    this.onSelect = null;
    this.onPick = null;
    this.ready = null;
    this.built = false;
  }

  // Builds the room and every relic's figure once, then shows which are found.
  prepare(list) {
    this.ready ??= this.build(list);
    return this.ready.then(() => this.refresh(list));
  }

  async build(list) {
    const scene = (this.scene = new THREE.Scene());
    scene.background = backdrop();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = studio();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.traverse((m) => {
      m.geometry?.dispose();
      m.material?.dispose();
    });
    scene.add(new THREE.HemisphereLight(0xffe8cc, 0x20150e, 0.55));
    const key = new THREE.SpotLight(0xfff0dc, 26, 0, 0.36, 0.7, 2);
    key.position.set(-1.1, 4.1, 2.4);
    key.target.position.set(0, HEIGHT, 0);
    const rim = new THREE.DirectionalLight(0x8ff5ea, 1.5);
    rim.position.set(2.6, 2.4, -3.2);
    scene.add(key, key.target, rim, floor());
    this.arc = new THREE.Group();
    scene.add(this.arc);
    this.shadow = new THREE.MeshStandardMaterial({
      color: 0x2e241c,
      roughness: 0.9,
    });
    for (const def of list) {
      const model = def.asset
        ? await this.assets.make(def.asset, {
            keepHierarchy: !!def.light?.flame,
          })
        : null;
      const shown = model ? dress(model, def) : recordFigure(def.id);
      const pose = POSE[def.id] || {};
      const lit = fit(shown, SIZE * (pose.size ?? 1), pose);
      const dark = lit.clone(true);
      dark.traverse((m) => m.isMesh && (m.material = this.shadow));
      const holder = new THREE.Group();
      holder.add(lit, dark);
      this.arc.add(holder);
      this.items.push({
        def,
        holder,
        lit,
        dark,
        spin: 0,
        found: false,
        seed: this.items.length * 1.7,
      });
    }
    this.frame(1 / 60);
    await this.renderer.compileAsync(scene, this.camera);
    this.built = true;
  }

  refresh(list) {
    for (const item of this.items) {
      item.found = !!list.find((r) => r.id === item.def.id)?.found;
      item.lit.visible = item.found;
      item.dark.visible = !item.found;
    }
  }

  // The relic at the front; the screen chooses it, and hears of drags and taps through
  // `onSelect(index)` and `onPick(index)`.
  show(index, { instant = false } = {}) {
    this.index = index;
    if (instant) this.position = index;
  }

  inspect(on) {
    this.inspecting = on;
    this.drag = null;
  }

  // Keys turn the inspected relic a quarter of a turn at a time.
  nudge(direction) {
    const item = this.items[this.index];
    if (item) item.spin += (direction * Math.PI) / 4;
  }

  wrapped(index) {
    const n = this.items.length;
    return ((Math.round(index) % n) + n) % n;
  }

  // A pointer on a stage element: a drag turns the arc (or the relic while inspecting), a tap
  // picks the relic under it. `area` is the element whose box the chosen relic is centred in.
  bind(element) {
    element.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      element.setPointerCapture?.(e.pointerId);
      this.drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        position: this.position,
        moved: 0,
        speed: 0,
        last: e.clientX,
        time: performance.now(),
      };
    });
    element.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      d.moved = Math.max(d.moved, Math.hypot(dx, e.clientY - d.y));
      const now = performance.now();
      const step = e.clientX - d.last;
      d.speed = step / Math.max(1, now - d.time);
      d.last = e.clientX;
      d.time = now;
      if (this.inspecting) {
        const item = this.items[this.index];
        if (item) item.spin += step * 0.012;
      } else if (d.moved > 6) {
        this.position = d.position - dx / this.spacing();
        const nearest = this.wrapped(this.position);
        if (nearest !== this.index) this.onSelect?.(nearest);
      }
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (this.inspecting) return;
      if (d.moved <= 6) return this.tap(e.clientX, e.clientY);
      const fling = -d.speed * 220;
      this.onSelect?.(this.wrapped(this.position + fling / this.spacing()));
    };
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      if (!this.inspecting) this.onSelect?.(this.wrapped(this.position));
    });
  }

  // Pixels between two neighbours on the arc at the front.
  spacing() {
    const front = this.project(new THREE.Vector3(0, HEIGHT, 0));
    const next = this.project(
      new THREE.Vector3(
        Math.sin(ARC) * RADIUS,
        HEIGHT,
        (Math.cos(ARC) - 1) * RADIUS,
      ),
    );
    return Math.max(60, Math.abs(next.x - front.x));
  }

  project(point) {
    const v = point.clone().project(this.camera);
    return {
      x: ((v.x + 1) / 2) * innerWidth,
      y: ((1 - v.y) / 2) * innerHeight,
    };
  }

  tap(x, y) {
    let best = null;
    for (const [i, item] of this.items.entries()) {
      if (!item.holder.visible) continue;
      const at = this.project(
        item.holder.getWorldPosition(new THREE.Vector3()),
      );
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < this.spacing() * 0.45 && (!best || d < best.d)) best = { i, d };
    }
    if (!best) return;
    if (best.i === this.index) this.onPick?.(this.index);
    else this.onSelect?.(best.i);
  }

  // Where the chosen relic and its dais sit: centred in the area element, far enough that they
  // fill most of the area's narrower side.
  frame(dt) {
    const w = innerWidth,
      h = innerHeight;
    const box = this.area?.getBoundingClientRect();
    const sw = box?.width || w,
      sh = box?.height || h;
    const cx = box ? box.left + sw / 2 : w / 2,
      cy = box ? box.top + sh / 2 : h / 2;
    const cam = this.camera;
    cam.aspect = w / h;
    const fill = Math.min(sw, sh) * 0.8;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const distance = (SIZE * 1.3 * h) / (2 * Math.max(80, fill) * tan);
    const k = 1 - Math.exp(-dt * 8);
    this.distance =
      this.distance === undefined
        ? distance
        : this.distance + (distance - this.distance) * k;
    this.centre ??= { x: cx, y: cy };
    this.centre.x += (cx - this.centre.x) * k;
    this.centre.y += (cy - this.centre.y) * k;
    const middle = HEIGHT - SIZE * 0.12;
    cam.position.set(0, middle + this.distance * 0.14, this.distance);
    cam.lookAt(0, middle, 0);
    cam.setViewOffset(w, h, w / 2 - this.centre.x, h / 2 - this.centre.y, w, h);
    cam.updateProjectionMatrix();
  }

  update(dt) {
    const n = this.items.length;
    const still = this.reduced?.();
    this.time += dt;
    if (!this.drag || this.inspecting) {
      const k = 1 - Math.exp(-dt * (still ? 40 : 9));
      this.position += wrap(this.index - this.position, n) * k;
    }
    this.focus +=
      ((this.inspecting ? 1 : 0) - this.focus) * (1 - Math.exp(-dt * 7));
    for (const [i, item] of this.items.entries()) {
      const offset = wrap(i - this.position, n);
      const near = Math.max(0, 1 - Math.abs(offset));
      const angle = offset * ARC;
      const away = Math.min(1, Math.abs(offset) / 0.6) * this.focus;
      item.holder.visible = Math.abs(offset) < 3.3 && away < 0.98;
      if (!item.holder.visible) continue;
      if (i === this.index && !(this.drag && this.inspecting) && !still)
        item.spin += dt * SPIN;
      const bob = still ? 0 : Math.sin(this.time * 1.3 + item.seed) * 0.018;
      item.holder.position.set(
        Math.sin(angle) * RADIUS,
        HEIGHT + bob,
        (Math.cos(angle) - 1) * RADIUS,
      );
      item.holder.rotation.y = item.spin * near - angle * 0.8;
      item.holder.scale.setScalar(
        (0.7 + 0.3 * near) * (1 + 0.2 * this.focus * near) * (1 - away),
      );
    }
    this.frame(dt);
  }

  render(dt) {
    const r = this.renderer;
    this.update(dt);
    const target = r.getRenderTarget(),
      planes = r.clippingPlanes,
      exposure = r.toneMappingExposure;
    r.setRenderTarget(null);
    r.clippingPlanes = [];
    r.toneMappingExposure = 1.05;
    try {
      r.render(this.scene, this.camera);
    } finally {
      r.toneMappingExposure = exposure;
      r.clippingPlanes = planes;
      r.setRenderTarget(target);
    }
  }
}

// An asset as it lies in its world: aged paper tinted, the lantern's flame alight.
function dress(model, def) {
  if (def.tint)
    model.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.color.multiply(new THREE.Color(...def.tint));
    });
  if (def.light?.flame)
    model.userData.parts?.flame?.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(0xffb24a);
      m.material.emissiveIntensity = 2.2;
    });
  model.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = false;
  });
  return model;
}

// Centred on its box, turned to face the eye and scaled so its longest side is `size`.
function fit(object, size, pose) {
  const turn = new THREE.Group();
  turn.add(object);
  turn.rotation.set(pose.x ?? 0, pose.y ?? 0, 0);
  turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn);
  const centre = box.getCenter(new THREE.Vector3());
  const dims = box.getSize(new THREE.Vector3());
  const outer = new THREE.Group();
  outer.add(turn);
  turn.position.sub(centre);
  outer.scale.setScalar(size / Math.max(dims.x, dims.y, dims.z, 1e-3));
  return outer;
}

// A dark warm room, lighter where the relics float.
function backdrop() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const glow = g.createRadialGradient(256, 236, 10, 256, 256, 330);
  glow.addColorStop(0, "#3a2a1d");
  glow.addColorStop(0.45, "#1e150f");
  glow.addColorStop(1, "#080605");
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The reflections' room: a dim box with a warm softbox in front and a cold one behind.
function studio() {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(12, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x24190f, side: THREE.BackSide }),
    ),
  );
  for (const [color, power, at] of [
    [0xffe0bc, 5, [-3, 3.5, 4]],
    [0x8ff5ea, 2.5, [4, 2, -3.5]],
    [0xfff4e6, 1.5, [0, 5.5, 0]],
  ]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(power),
      }),
    );
    panel.position.set(...at);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  return scene;
}

// The dais under the front of the arc: a small pool of light ringed with the builders' light.
function floor() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const pool = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  pool.addColorStop(0, "rgba(110, 84, 56, 0.7)");
  pool.addColorStop(0.55, "rgba(60, 44, 30, 0.35)");
  pool.addColorStop(1, "rgba(10, 7, 5, 0)");
  g.fillStyle = pool;
  g.fillRect(0, 0, S, S);
  for (const [radius, width, alpha] of [
    [0.36, 4, 0.8],
    [0.42, 1.5, 0.35],
  ]) {
    g.lineWidth = width;
    g.strokeStyle = `rgba(87, 236, 220, ${alpha})`;
    g.beginPath();
    g.arc(S / 2, S / 2, S * radius, 0, Math.PI * 2);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = HEIGHT - SIZE * 0.72;
  return disc;
}

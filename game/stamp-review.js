import * as THREE from "three";
import { makeGlyph } from "./glyphs.js";

export const TRANSIT_FILE = "transit-file";
const GLYPHS = ["crescent", "waves", "disc"];

export class StampReview {
  constructor(checkpoint, services, layout) {
    this.checkpoint = checkpoint;
    this.services = services;
    this.layout = layout;
    this.marks = [];
    this.inlay = [];
    this.reset();
  }

  async build() {
    const { assets, world, scene } = this.checkpoint;
    const model = await assets.make("stamp_plate", { keepHierarchy: true });
    if (!model) return false;
    const { x, z, scale } = this.layout;
    model.position.set(x, 0, z);
    model.scale.setScalar(scale);
    const field = model.userData.field || { center: [0, 0.12, 0], size: 1.3 };
    this.top = field.center[1] * scale;
    this.radius = (field.size / 2) * scale;
    for (const [i, kind] of GLYPHS.entries()) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd9a441,
        emissive: 0xd9a441,
        emissiveIntensity: 0.16,
        roughness: 0.72,
      });
      const glyph = makeGlyph(kind, field.size * 0.22, material);
      glyph.rotation.x = -Math.PI / 2;
      glyph.position.set(
        field.center[0] + (i - 1) * 0.37,
        field.center[1] + 0.006,
        field.center[2],
      );
      model.add(glyph);
      this.marks.push({ kind, material });
    }
    model.userData.parts?.inlay?.traverse((node) => {
      if (!node.isMesh) return;
      node.material = node.material.clone();
      this.inlay.push(node.material);
    });
    scene.add(model);
    this.mesh = model;
    this.box = world.addRound(
      x,
      z,
      0.9 * scale,
      -10,
      0.1 * scale,
      "prop",
      null,
      {
        stand: true,
        cam: false,
        thin: true,
      },
    );
    this.useBox = { ...this.box, maxY: this.top + 1.4 };
    this.refreshVisuals();
    return true;
  }

  get available() {
    return !!this.mesh && this.checkpoint.phase === "open" && !this.claimed;
  }

  get ready() {
    return this.stamped.size === GLYPHS.length && !this.claimed;
  }

  get guard() {
    if (!this.active || this.delay > 0) return null;
    const kind = GLYPHS.find((glyph) => !this.stamped.has(glyph));
    return this.checkpoint.guards.find((guard) => guard.glyph === kind) || null;
  }

  contains(x, z) {
    return Math.hypot(x - this.layout.x, z - this.layout.z) < this.radius;
  }

  interactables() {
    if (!this.available || this.ready) return [];
    return [
      {
        kind: "use",
        box: this.useBox,
        ref: { use: () => this.use() },
        prompt: `relic:${this.active ? "Pause stamp review" : this.stamped.size ? "Resume stamp review" : "Begin stamp review"}`,
      },
    ];
  }

  use() {
    if (!this.available || this.ready) return false;
    if (this.active)
      return this.cancel("The review is paused. Accepted stamps are kept.");
    const kind = GLYPHS.find((glyph) => !this.stamped.has(glyph));
    const guard = this.checkpoint.guards.find(
      (warden) => warden.glyph === kind,
    );
    if (!guard || guard.state === "break") {
      this.services.hud?.subtitle("Wait for the Warden to return to duty.", 3);
      return false;
    }
    this.active = true;
    this.responding = guard;
    this.delay = 0;
    this.guideKey = null;
    this.checkpoint.guideKey = null;
    this.services.hud?.clearSubtitle?.();
    this.checkpoint.say(
      "A copy requires three clean stamps. Regulations.",
      "clerk",
      3,
      true,
    );
    this.services.hud?.hint(
      "Stamp review",
      "Stand on the small register, wait for the warning, then dodge before the stamp lands.",
      8,
    );
    return true;
  }

  cancel(text = null) {
    if (!this.active) return false;
    const guard = this.responding || this.guard;
    this.active = false;
    this.responding = null;
    this.delay = 0;
    guard?.calm(null);
    this.checkpoint.guideKey = null;
    this.services.hud?.clearHint?.();
    if (text) this.services.hud?.subtitle(text, 3);
    return true;
  }

  tone(warden, at) {
    return this.active && warden === this.guard && this.contains(at.x, at.z)
      ? "plate"
      : null;
  }

  slam(warden, x, z, hit) {
    if (
      !this.active ||
      warden !== this.guard ||
      !this.contains(x, z) ||
      this.stamped.has(warden.glyph)
    )
      return null;
    const { stamps, sound } = this.checkpoint;
    this.delay = 1.6;
    this.guideKey = null;
    this.checkpoint.guideKey = null;
    if (hit) {
      stamps.mark(x, this.top, z, warden.glyph, "void");
      sound?.play("void");
      this.services.hud?.subtitle(
        "The register needs a clean stamp. Step clear of the warning.",
        3,
      );
      return "void";
    }
    this.stamped.add(warden.glyph);
    stamps.mark(x, this.top, z, warden.glyph, "plate");
    sound?.play("plate");
    this.refreshVisuals();
    if (this.ready) {
      this.active = false;
      this.delay = 0;
      this.services.hud?.clearHint?.();
      this.checkpoint.say(
        "The copy is approved. Collect it at the window.",
        "clerk",
        3.4,
        true,
      );
    } else {
      this.checkpoint.say("Accepted. Next Warden, please.", "clerk", 2.4, true);
    }
    return "plate";
  }

  claim() {
    if (!this.ready || this.checkpoint.phase !== "open") return false;
    const fresh = this.services.discoverRelic?.(TRANSIT_FILE);
    if (!fresh && !this.services.relicFound?.(TRANSIT_FILE)) return false;
    this.claimed = true;
    this.checkpoint.guideKey = null;
    this.checkpoint.say(
      "A duplicate. Don't make me stamp another.",
      "clerk",
      3,
      true,
    );
    return true;
  }

  update(dt, hero) {
    if (this.available && !this.notified) {
      this.notified = true;
      this.checkpoint.say(
        "Mira left a transit file. Clean stamps at the small register authorise a copy.",
        "clerk",
        4,
      );
    }
    if (!this.active) return;
    if (
      this.checkpoint.phase !== "open" ||
      hero.feet < -1 ||
      Math.hypot(hero.pos.x - this.layout.x, hero.pos.z - this.layout.z) > 22
    ) {
      this.cancel();
      return;
    }
    this.delay = Math.max(0, this.delay - dt);
    const guard = this.guard;
    if (!guard) return;
    if (guard.state === "break") {
      this.cancel("The review is paused. Let that Warden recover.");
      return;
    }
    this.responding = guard;
    if (guard.state === "patrol")
      guard.provoke("Stamp review. Hold still, please.");
  }

  guide(hud) {
    if (!this.available || (!this.active && !this.ready)) return false;
    const guard = this.guard;
    const key = `${this.stamped.size}:${this.ready}:${guard?.glyph ?? "wait"}`;
    hud.objective(
      this.ready
        ? "Collect Mira's transit file"
        : "Complete the optional stamp review",
      this.ready
        ? "The clerk has approved a copy; collect it at the window"
        : `Clean stamps: ${this.stamped.size} of ${GLYPHS.length} · ${guard?.glyph ?? "next Warden arriving"}`,
    );
    if (key !== this.guideKey) {
      hud.setMarkers(
        this.ready
          ? [
              this.checkpoint.windowPos
                .clone()
                .add(new THREE.Vector3(0, 0.5, 0)),
            ]
          : [new THREE.Vector3(this.layout.x, 1.2, this.layout.z)],
      );
      this.guideKey = key;
    }
    return true;
  }

  refreshVisuals() {
    for (const { kind, material } of this.marks)
      material.emissiveIntensity = this.stamped.has(kind) ? 1.8 : 0.16;
    for (const material of this.inlay)
      material.emissiveIntensity = this.stamped.size ? 1.2 : 0.15;
  }

  reset() {
    this.active = false;
    this.responding = null;
    this.claimed = !!this.services.relicFound?.(TRANSIT_FILE);
    this.stamped = new Set(this.claimed ? GLYPHS : []);
    this.delay = 0;
    this.notified = this.claimed;
    this.guideKey = null;
    this.refreshVisuals();
  }

  telemetry() {
    return {
      active: this.active,
      ready: this.ready,
      claimed: this.claimed,
      stamped: [...this.stamped],
      guard: this.guard?.glyph ?? null,
      at: [this.layout.x, this.layout.z],
      radius: this.radius,
    };
  }
}

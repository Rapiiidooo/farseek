import * as THREE from "three";
import { markerSpots } from "./hud.js";

// Speech bubbles pinned to points in the world: small DOM cards projected every frame, so
// the Wardens can be officious in readable type instead of in textures. A bubble that would
// cover an earlier one, or an objective mark, climbs above it.
export class Bubbles {
  constructor() {
    this.layer = document.createElement("div");
    this.layer.id = "bubbles";
    document.body.appendChild(this.layer);
    this.items = [];
    this.v = new THREE.Vector3();
  }

  say(anchor, text, { duration = 2.4, kind = "warden", key = null } = {}) {
    const previous = key
      ? this.items.find((bubble) => bubble.key === key)
      : null;
    const el = previous?.el ?? document.createElement("p");
    el.className = `bubble ${kind}`;
    el.textContent = text;
    el.style.opacity = 0;
    if (previous) {
      Object.assign(previous, {
        anchor,
        life: duration,
        total: duration,
        w: 0,
      });
      return;
    }
    this.layer.appendChild(el);
    this.items.push({
      el,
      anchor,
      life: duration,
      total: duration,
      key,
      w: 0,
      h: 0,
      x: 0,
      y: 0,
      seen: false,
    });
  }

  clear() {
    for (const b of this.items) b.el.remove();
    this.items = [];
  }

  update(dt, camera) {
    const w = innerWidth,
      h = innerHeight;
    for (const b of this.items) {
      b.life -= dt;
      const p = this.v.copy(b.anchor());
      p.project(camera);
      b.seen = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      b.x = (p.x * 0.5 + 0.5) * w;
      b.y = (-p.y * 0.5 + 0.5) * h;
      if (!b.w) {
        b.w = b.el.offsetWidth;
        b.h = b.el.offsetHeight;
      }
    }
    this.separate();
    for (const b of this.items) {
      b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) translate(-50%, -100%)`;
      const age = b.total - b.life;
      b.el.style.opacity = b.seen ? Math.min(1, age * 8, b.life * 4) : 0;
    }
    for (let i = this.items.length - 1; i >= 0; i--)
      if (this.items[i].life <= 0) {
        this.items[i].el.remove();
        this.items.splice(i, 1);
      }
  }

  // A bubble's box runs from its top to the tip of its tail, 7 px under the anchor.
  separate() {
    const list = this.items;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.seen) continue;
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const b = list[j];
          if (
            b.seen &&
            Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 &&
            a.y - a.h < b.y + 11 &&
            a.y + 11 > b.y - b.h
          ) {
            a.y = b.y - b.h - 11;
            moved = true;
          }
        }
        for (let k = 0; k < markerSpots.length; k++) {
          const m = markerSpots[k];
          if (
            m.on &&
            !m.near &&
            Math.abs(a.x - m.x) < a.w / 2 + 18 &&
            a.y - a.h < m.y + 26 &&
            a.y + 11 > m.y - 26
          ) {
            a.y = m.y - 37;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
  }
}

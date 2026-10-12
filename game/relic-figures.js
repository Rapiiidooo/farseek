import * as THREE from "three";
import { draw as glyph } from "./glyph-icons.js";

// Relics that are records rather than things get a figure for the Relics screen: a page in
// Mira's hand around the sketch it describes, or the builders' stone with its carving lit.

const INK = "rgba(58, 40, 26, 0.86)";
const RED = "#a8382a";
const AMBER = "#c98a2b";
const CYAN = "#1f8f8a";
const ICE = "#4f7690";

export function recordFigure(id) {
  return id === "sun-memory" ? stone() : page(id);
}

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h;
}

// A sheet of field paper: aged, darker at the edges, written over in lines of a quick hand that
// leave room for the sketch.
function page(id) {
  const W = 512,
    H = 688;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const r = random(seedOf(id));
  g.fillStyle = "#e6d8bb";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "120, 90, 50" : "255, 248, 230"}, ${0.04 + r() * 0.06})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
  }
  const edge = g.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.3,
    W / 2,
    H / 2,
    H * 0.72,
  );
  edge.addColorStop(0, "rgba(120, 80, 40, 0)");
  edge.addColorStop(1, "rgba(110, 70, 35, 0.42)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  const sketch = SKETCHES[id];
  const [top, bottom] = sketch.area;
  g.lineCap = g.lineJoin = "round";
  g.strokeStyle = INK;
  g.lineWidth = 2;
  for (let y = 58; y < H - 40; y += 29) {
    if (y > top - 18 && y < bottom + 14) continue;
    let x = 44 + r() * 10;
    const end = W - 40 - r() * (y > H - 90 ? 220 : 40);
    while (x < end) {
      const word = 18 + r() * 52;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = x; k < Math.min(end, x + word); k += 5)
        g.lineTo(k, y - 3 + Math.sin(k * 0.9 + r() * 2) * 3 - r() * 3);
      g.stroke();
      x += word + 9 + r() * 6;
    }
  }
  g.save();
  sketch.draw(g, W, top, bottom, r);
  g.restore();
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // A slight curl, as a page kept rolled in a pocket.
  const geometry = new THREE.PlaneGeometry(0.42, 0.56, 14, 14);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.21,
      y = p.getY(i) / 0.28;
    p.setZ(i, 0.035 * x * x - 0.012 * y * y + 0.006 * Math.sin(y * 4 + x));
  }
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ map, roughness: 0.93 }),
    ),
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xcdbd9c,
        roughness: 0.95,
        side: THREE.BackSide,
      }),
    ),
  );
  return group;
}

const SKETCHES = {
  // The clerk's copy: a ledger, the request stamped VOID, and Mira's ring with three routes.
  "transit-file": {
    area: [300, 610],
    draw(g, W, top) {
      g.strokeStyle = "rgba(58, 40, 26, 0.5)";
      g.lineWidth = 1.5;
      for (let y = 70; y < top - 20; y += 29) {
        g.beginPath();
        g.moveTo(36, y + 8);
        g.lineTo(W - 36, y + 8);
        g.stroke();
      }
      g.translate(W * 0.68, 150);
      g.rotate(-0.21);
      g.strokeStyle = RED;
      g.fillStyle = RED;
      g.lineWidth = 6;
      g.strokeRect(-92, -38, 184, 76);
      g.font = "bold 58px Georgia, serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.globalAlpha = 0.85;
      g.fillText("VOID", 0, 4);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      const cx = W / 2,
        cy = top + 150;
      g.beginPath();
      g.arc(cx, cy, 52, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 40, 0, Math.PI * 2);
      g.stroke();
      for (const [kind, x, y] of [
        ["star", cx - 150, cy - 90],
        ["spiral", cx + 150, cy - 90],
        ["waves", cx, cy + 135],
      ]) {
        g.setLineDash([6, 8]);
        g.beginPath();
        g.moveTo(cx + (x - cx) * 0.3, cy + (y - cy) * 0.3);
        g.lineTo(x + (cx - x) * 0.25, y + (cy - y) * 0.25);
        g.stroke();
        g.setLineDash([]);
        g.lineWidth = 1.6;
        glyph(g, kind, x, y, 58);
        g.lineWidth = 3;
      }
    },
  },
  // The wandering isle's route between the two amber stations.
  "dawn-survey": {
    area: [210, 560],
    draw(g, W, top, bottom) {
      const y = (top + bottom) / 2;
      for (const x of [86, W - 86]) {
        g.fillStyle = "rgba(201, 138, 43, 0.35)";
        g.beginPath();
        g.arc(x, y, 30, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = AMBER;
        g.lineWidth = 4;
        g.stroke();
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 12, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.setLineDash([4, 10]);
      g.beginPath();
      g.moveTo(120, y);
      g.bezierCurveTo(200, top + 10, W - 200, bottom - 10, W - 120, y);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2.5;
      for (const [x, yy, s] of [
        [180, top + 70, 1],
        [W / 2, y + 6, 1.3],
        [W - 170, bottom - 60, 0.9],
      ]) {
        g.beginPath();
        g.ellipse(x, yy, 34 * s, 16 * s, 0.1, 0, Math.PI * 2);
        g.stroke();
      }
    },
  },
  // Floes between two shores, a red cairn at each end and the route across them.
  "winter-crossing": {
    area: [230, 590],
    draw(g, W, top, bottom, r) {
      g.strokeStyle = ICE;
      g.lineWidth = 2.5;
      for (const [x, y, s] of [
        [150, top + 90, 1],
        [W / 2 + 20, (top + bottom) / 2, 1.2],
        [W - 150, bottom - 90, 1],
      ]) {
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const d = (46 + r() * 22) * s;
          g[k ? "lineTo" : "moveTo"](
            x + Math.cos(a) * d,
            y + Math.sin(a) * d * 0.6,
          );
        }
        g.closePath();
        g.stroke();
      }
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.setLineDash([3, 9]);
      g.beginPath();
      g.moveTo(56, top + 30);
      g.lineTo(150, top + 90);
      g.lineTo(W / 2 + 20, (top + bottom) / 2);
      g.lineTo(W - 150, bottom - 90);
      g.lineTo(W - 56, bottom - 30);
      g.stroke();
      g.setLineDash([]);
      for (const [x, y] of [
        [56, top + 30],
        [W - 56, bottom - 30],
      ]) {
        g.fillStyle = RED;
        for (const [dy, w] of [
          [0, 22],
          [-14, 16],
          [-25, 10],
        ]) {
          g.beginPath();
          g.ellipse(x, y + dy, w, 8, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
  },
  // The three pressure lines, their valves marked in cyan, over the tide.
  "tide-proof": {
    area: [250, 600],
    draw(g, W, top, bottom) {
      g.strokeStyle = INK;
      g.lineWidth = 2;
      glyph(g, "waves", W / 2, bottom - 70, 150);
      const y = top + 120;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(80, y);
      g.lineTo(W - 80, y);
      g.stroke();
      for (const x of [140, W / 2, W - 140]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 90);
        g.stroke();
        g.strokeStyle = CYAN;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(x, y + 110, 22, 0, Math.PI * 2);
        g.moveTo(x - 15, y + 95);
        g.lineTo(x + 15, y + 125);
        g.moveTo(x + 15, y + 95);
        g.lineTo(x - 15, y + 125);
        g.stroke();
        g.strokeStyle = INK;
        g.lineWidth = 3;
      }
    },
  },
  // Three practice plates and the marks of a steady hand, tallied.
  "camp-drill": {
    area: [220, 520],
    draw(g, W, top, bottom, r) {
      const y = (top + bottom) / 2 - 20;
      for (const x of [110, W / 2, W - 110]) {
        g.strokeStyle = INK;
        for (const [rad, width] of [
          [52, 3],
          [34, 2],
          [14, 2],
        ]) {
          g.lineWidth = width;
          g.beginPath();
          g.arc(x, y, rad, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = RED;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = INK;
      g.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(W / 2 - 40 + k * 16, bottom - 40);
        g.lineTo(W / 2 - 44 + k * 16, bottom + 6);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(W / 2 - 52, bottom - 4);
      g.lineTo(W / 2 + 22, bottom - 34);
      g.stroke();
    },
  },
};

// The builders' stone memory: a slab of worn stone whose carving still holds their light, the
// sun over a road that runs through a line of vessels.
function stone() {
  const S = 512;
  const r = random(seedOf("sun-memory"));
  const surface = document.createElement("canvas");
  surface.width = surface.height = S;
  const g = surface.getContext("2d");
  g.fillStyle = "#8a7d6c";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    const v = 90 + r() * 90;
    g.fillStyle = `rgba(${v}, ${v * 0.92}, ${v * 0.82}, ${0.08 + r() * 0.12})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 5, 1 + r() * 5);
  }
  const carving = document.createElement("canvas");
  carving.width = carving.height = S;
  const e = carving.getContext("2d");
  e.fillStyle = "#000";
  e.fillRect(0, 0, S, S);
  e.strokeStyle = "#fff";
  e.lineCap = e.lineJoin = "round";
  e.lineWidth = 7;
  e.beginPath();
  e.arc(S / 2, 150, 46, 0, Math.PI * 2);
  e.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    e.beginPath();
    e.moveTo(S / 2 + Math.cos(a) * 64, 150 + Math.sin(a) * 64);
    e.lineTo(S / 2 + Math.cos(a) * 88, 150 + Math.sin(a) * 88);
    e.stroke();
  }
  e.lineWidth = 6;
  e.beginPath();
  e.moveTo(60, 330);
  e.lineTo(S - 60, 330);
  e.stroke();
  for (const x of [130, 210, 302, 382]) {
    e.beginPath();
    e.moveTo(x - 24, 350);
    e.quadraticCurveTo(x, 420, x + 24, 350);
    e.stroke();
  }
  e.beginPath();
  e.arc(S - 60, 330, 20, 0, Math.PI * 2);
  e.stroke();
  const map = new THREE.CanvasTexture(surface);
  map.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(carving);
  glow.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({
    map,
    color: 0x9a8d7b,
    roughness: 0.96,
  });
  const face = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.94,
    emissive: 0x39e3d0,
    emissiveMap: glow,
    emissiveIntensity: 1.6,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.08), [
    side,
    side,
    side,
    side,
    face,
    side,
  ]);
  const group = new THREE.Group();
  group.add(slab);
  return group;
}

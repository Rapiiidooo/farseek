import * as THREE from "three";
import { progress, findRelic } from "./store.js";
import { clearGrass } from "./grass.js";

// Things the expeditions left behind, hidden along the way for the curious. Each is
// found once and for good, like an achievement: taken, it leaves its world and is listed on
// the Relics screen. `at` is [x, z] on the ground of its world, or offsets from an isle's
// centre on the isles. `leave` names the materials that stay behind when it is taken.
export const RELICS = [
  {
    id: "papyrus",
    where: "court",
    world: "The Sunken Court",
    hint: "Somewhere in the Sunken Court.",
    name: "The first papyrus",
    line: "The first expedition's survey of the court, rolled and tied, the mirrors drawn in.",
    entry: [
      "The survey follows a single sunbeam from the western cliff. Three crystal heads are circled, each beside a different glyph. The mirrors form a route between them, rather than three separate puzzles.",
      "Mira has written in the margin: A door needs an address, not a key. If this ring answers, the ruins belong to a much larger map.",
      "The last corner is folded around their departure bearing. They left believing they could find the way back.",
    ],
    verb: "Pick up the papyrus",
    asset: "field_scroll",
    at: [26.25, 16.35],
    yaw: 2.4,
    tint: [0.9, 0.84, 0.72],
  },
  {
    id: "radio",
    where: "two",
    world: "The Checkpoint",
    hint: "By a spire of the Checkpoint.",
    name: "The field radio",
    line: "Confiscated at the window and dropped by the spire. It still hisses, tuned to home.",
    entry: [
      "The home channel is still marked on the dial. Static answers every call. Someone scratched a second instruction into the case: No passage without three stamps.",
      "A strip of expedition tape carries Mira's handwriting: Their rules are literal. A stamp on the right stone counts, whoever was meant to receive it.",
      "I can almost hear her laughing at the window. She would have found a way through.",
    ],
    verb: "Take the radio",
    asset: "field_radio",
    at: [-10.3, -36.4],
    yaw: 1.2,
    // Its dial still glows faintly, enough to find it in the checkpoint's dusk.
    light: { intensity: 0.45, at: 0.35, reach: 3.5 },
  },
  {
    id: "page",
    where: "three",
    world: "The Dawn Isles",
    hint: "On a ledge of the Dawn Isles.",
    name: "Mira's lost page",
    line: "Torn from her journal: the isles drawn at first light, drifting together.",
    entry: [
      "Day 15. The isles move together at dawn, then drift apart again. We crossed with ropes while the gaps were narrow. Anyone following later will need the builders' light bridges.",
      "One isle keeps wandering between the two banks. Wait for it to come close, jump aboard and let it carry you. The stones beyond it cannot bear a standing foot.",
      "There is a little arrow beside the drawing: Camp ahead. Keep going. M.",
    ],
    verb: "Pick up the page",
    asset: "field_scroll",
    tint: [0.95, 0.9, 0.8],
    isle: "ledge",
    at: [3.1, 0.6],
    yaw: 0.9,
    scale: 0.9,
  },
  {
    id: "scarf",
    where: "four",
    world: "The Frozen Reach",
    hint: "On a stone above the frozen pond.",
    name: "Mira's scarf",
    line: "Left on a stone above the pond. The frost has not yet taken the red.",
    entry: [
      "The scarf is tied around the stone with Mira's familiar double knot. She used it to mark the safe side of a crossing when the wind covered our tracks.",
      "The pond lies below. A block can slide beneath the notch in its far wall, making a step where there was none.",
      "She left the red where someone coming after her would see it. I refuse to read it as a farewell.",
    ],
    verb: "Take Mira's scarf",
    asset: "mira_scarf",
    at: [-6.4, -78.6],
    yaw: 0.8,
    leave: ["stone"],
  },
  {
    id: "lantern",
    where: "four",
    world: "The Frozen Reach",
    hint: "In the lee of the frozen island.",
    name: "Mira's lantern",
    line: "Still burning low in the lee of the island. She meant to come back for it.",
    entry: [
      "There is almost no oil left, but the glass has been cleaned. Mira used to leave a lamp at the beginning of a return trail and tell me to keep it in sight.",
      "The island's last glyph is sealed under layers of ice. A nearby prism still catches the builders' light. The light must be carried faster than the ice can heal.",
      "A wick folded into a spare loop. She expected someone else to use this lantern.",
    ],
    verb: "Take Mira's lantern",
    asset: "mira_lantern",
    at: [-10.4, -160.6],
    yaw: 0.6,
    light: { intensity: 1.1, flame: true, reach: 7 },
  },
  {
    id: "grove-map",
    where: "five",
    world: "The Wildwood",
    hint: "A trace of the expedition beside the grove path.",
    name: "Mira's grove sketch",
    line: "A pressed leaf and a castle address, drawn beside a path through the roots.",
    entry: [
      "Day 23. The forest grew over the builders' road, but its crystals still answer. The spore pods grow quiet when a charged pulse reaches them. The boars paw the dirt before a straight charge. Step aside, then move while they catch their breath.",
      "The castle's three stones form an address. Read the water first, then the spiral of roots, then the crescent above the canopy: waves, spiral, crescent.",
      "There is an archive beneath the next sea. If it holds the old maps, it may tell us where all these doors lead. Nyra, I am leaving the path as clearly as I can. M.",
    ],
    verb: "Take Mira's grove sketch",
    asset: "field_scroll",
    at: [9, -117],
    yaw: 1.7,
    tint: [0.92, 0.88, 0.74],
    scale: 0.95,
  },
  {
    id: "pressure-log",
    where: "six",
    world: "The Drowned Archive",
    hint: "A field note on the far pressure landing.",
    name: "The archive field note",
    line: "Mira's last dry page explains why the guardian keeps its vigil.",
    entry: [
      "Day 25. The sea covered the archive, but the control desk can still make an island of air. The first seal holds the causeway together long enough to cross. Once crossed, it remembers the route.",
      "I thought the guardian was keeping us here. It has been keeping the last address alive. Its armour closes under pressure; wait for the surge to pass, gather light from a crystal, pulse the open core, then shoot it while it is cracked.",
      "Nyra, if you find this, keep the door awake. I left my lantern behind because I knew you would bring the light the rest of the way. I will leave another on the far side. M.",
    ],
    verb: "Take the archive field note",
    asset: "field_scroll",
    at: [-4.7, -41.2],
    yaw: 2.2,
    tint: [0.86, 0.82, 0.73],
    scale: 0.95,
  },
  {
    id: "sun-memory",
    where: "court",
    world: "The Sunken Court",
    hint: "A star outside the gate's address remembers the builders.",
    name: "The builders' stone memory",
    line: "Sunlight wakes an old record, with Mira's notes scratched along its edge.",
    entry: [
      "The star marks a record, rather than a destination. Its carvings show a road ending at one ring and continuing beneath another sky. The builders gave distant settlements a common route home.",
      "A line of empty vessels follows the road. A flood swallowed one settlement, and those beyond its door kept sending light until the last travellers crossed. The archive was built to remember the addresses they lost.",
      "Mira traced the final vessel with a pencil: They kept the way open for each other. If I can learn the last address, Nyra will have a way to follow. M.",
    ],
  },
  {
    id: "transit-file",
    where: "two",
    world: "The Checkpoint",
    hint: "An optional clean stamp review can release Mira's transit file.",
    name: "Mira's transit file",
    line: "A copy from the clerk's ledger, with Mira's request kept in its margin.",
    entry: [
      "The ledger records Mira's passage towards the dawn isles. Her request for a return address is stamped VOID. The clerk kept a duplicate of the page she left behind.",
      "Mira drew a ring beneath the refusal and traced three routes to it: a glyph buried in ice, a forest castle and the maps in a drowned archive. She was already searching for the way home when her radio fell silent.",
      "A note in the margin is addressed to me: Nyra, I know you will follow. Find the way back, then find me. M.",
    ],
  },
  {
    id: "dawn-survey",
    where: "three",
    world: "The Dawn Isles",
    hint: "Complete the optional light survey beside the drifting isle.",
    name: "Mira's route survey",
    line: "Two measuring stations preserve the route of the wandering isle.",
    entry: [
      "Day 15. The amber lenses are measuring stations. They answer only to light sent from the wandering isle, marking where its path touches the two banks. The builders wanted someone to keep this crossing usable.",
      "I left a copy at the far station. Our ropes will not last, but the isle keeps returning. Whoever follows can take their time, bring light aboard and measure the route again.",
      "Nyra, you used to draw the way home before we left camp. I have started doing the same. One crossing at a time, I am leaving a map you can follow. M.",
    ],
  },
  {
    id: "winter-crossing",
    where: "four",
    world: "The Frozen Reach",
    hint: "Follow the optional cairn trail across every ice sheet and both floes.",
    name: "Mira's winter crossing",
    line: "A record kept between the two red cairns, for whoever follows her over the ice.",
    entry: [
      "Day 19. I waited on the anchored ice while the floes passed each other. Every crossing has somewhere to stop and watch. I tied red strips to the cairns on both shores so the next traveller would know where the route begins and ends.",
      "The builders recorded safe landings and places to wait for the drifting ice. Their road was meant to bring people through, even when the world around it changed. The smallest marks survived longer than the stone bridges.",
      "Nyra, I almost turned back here. Then I remembered how you check the far bank before we jump. I will find the last address. You will recognise the way I have left behind. M.",
    ],
  },
  {
    id: "tide-proof",
    where: "six",
    world: "The Drowned Archive",
    hint: "Read the tide sketch, then vent a mark in every guardian phase.",
    name: "Mira's tide proof",
    line: "Three pressure marks release the page she sealed beside the last address.",
    entry: [
      "Day 27. Three lines feed the guardian. As the pressure rises, it closes one line and opens the next. I marked their valves in cyan. Vent each line before a strike and the dry pocket beneath the relief will open.",
      "The guardian was keeping the last crossing alive. Its blows are the same pressure that holds back the sea. The builders left a way to relieve it, for someone patient enough to read the ground before answering with light.",
      "Nyra, I have copied the address and left this page where the tide cannot take it. The door points home, but another road continues beyond it. Bring the map we drew together. I will be looking for your light. M.",
    ],
  },
  {
    id: "camp-drill",
    where: "three",
    world: "The Dawn Isles",
    hint: "Recover the pistols at camp, then complete the optional amber plate drill.",
    name: "Mira's camp record",
    line: "Three practice plates guard a page she left beneath the spare ammunition.",
    entry: [
      "Day 16. Our last rope broke before camp. I set three old plates beside the crates and checked the pistols once more. The first shot starts the drill. Three clear marks, then breathe. Nyra always insisted that a steady hand mattered more than a quick one.",
      "A scarred old boar holds the castle path. The locals call it Oldtusk. It charges again before it tires; watch the lowered head and keep room to step aside. I need both hands free to carry the lantern and read the last glyph, so I am leaving the pistols here with the spare magazines.",
      "Nyra, I know what you will say about leaving camp alone. You were right. I should have waited. I have drawn the route on every page I can spare, and I am keeping a light for you at the next shelter. M.",
    ],
  },
];

const TAKE = 0.7;

export class Relics {
  constructor({ assets, hud, sound }) {
    this.assets = assets;
    this.hud = hud;
    this.sound = sound;
    this.items = [];
    this.time = 0;
    this.onFound = null;
  }

  // `worlds` maps each place to its scene, its collision world and what lies on its ground
  // (the court's sand); `isles` finds an isle's centre.
  async build(worlds, isles) {
    const glint = (this.glint ??= new THREE.SpriteMaterial({
      map: glintTexture(),
      color: 0xfff1cf,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    for (const def of RELICS) {
      const w = worlds[def.where];
      if (!def.asset || !w || this.items.some((item) => item.def.id === def.id))
        continue;
      let [x, z] = def.at;
      if (def.isle) {
        const c = isles.isle(def.isle).collider;
        x += c.x;
        z += c.z;
      }
      const ground = w.world.ground(x, z, 0.05, 1e4, 0);
      const y = ground + (w.lift?.(x, z, ground) ?? 0);
      // No tuft grows over it: small things lie low.
      clearGrass(w.scene, x, z, 0.9);
      const model =
        (await this.assets.make(def.asset, {
          keepHierarchy: !!def.light?.flame,
        })) || fallback(def);
      // Aged: the court's sun would bleach new parchment white.
      if (def.tint)
        model.traverse((m) => {
          if (!m.isMesh) return;
          m.material = m.material.clone();
          m.material.color.multiply(new THREE.Color(...def.tint));
        });
      // Small things cast no shadow: the lantern's see-through panes would want a shadow
      // shader of their own, compiled in the middle of play.
      model.traverse((m) => m.isMesh && (m.castShadow = false));
      model.position.set(x, y, z);
      model.rotation.y = def.yaw;
      model.scale.multiplyScalar(def.scale ?? 1);
      // Its own material: a glint fades and turns on its own.
      const sprite = new THREE.Sprite(glint.clone());
      sprite.position.set(x, y + 0.9, z);
      sprite.scale.setScalar(0.55);
      sprite.renderOrder = 8;
      const item = {
        def,
        scene: w.scene,
        model,
        sprite,
        home: model.position.clone(),
        state: "gone",
        taking: 0,
        seed: RELICS.indexOf(def) * 1.7,
        box: {
          minX: x - 0.45,
          maxX: x + 0.45,
          minZ: z - 0.45,
          maxZ: z + 0.45,
          minY: y - 0.3,
          maxY: y + 1.2,
        },
      };
      // A relic's light stays in the scene once it is taken, dimmed to nothing: a light that
      // came and went would change every shader of its world in the middle of play.
      if (def.light) {
        if (def.light.flame)
          model.userData.parts?.flame?.traverse((m) => {
            if (!m.isMesh) return;
            m.material = m.material.clone();
            m.material.emissive = new THREE.Color(0xffb24a);
            m.material.emissiveIntensity = 2.2;
            item.flameMat = m.material;
          });
        const at = model.userData.light?.[1] ?? def.light.at ?? 0.2;
        item.light = new THREE.PointLight(0xffb24a, 0, def.light.reach, 1.6);
        item.light.position.set(x, y + at * (def.scale ?? 1), z);
        w.scene.add(item.light);
      }
      this.items.push(item);
      this.place(item);
    }
  }

  // Waiting where it was left, or taken: gone, apart from anything it was set down on.
  place(item) {
    const found = progress.relics.has(item.def.id);
    item.state = found ? "gone" : "waiting";
    item.taking = 0;
    item.model.position.copy(item.home);
    item.model.rotation.y = item.def.yaw;
    item.model.scale.setScalar(item.def.scale ?? 1);
    item.model.traverse((m) => {
      if (m.isMesh) m.visible = !found || this.stays(item, m);
    });
    if (!found || item.def.leave) item.scene.add(item.model);
    else item.scene.remove(item.model);
    if (found) item.scene.remove(item.sprite);
    else item.scene.add(item.sprite);
    item.sprite.material.opacity = 1;
    if (item.light) item.light.intensity = found ? 0 : item.def.light.intensity;
  }

  stays(item, mesh) {
    return !!item.def.leave?.includes(mesh.material?.name);
  }

  // After the progress is forgotten, every relic is back where it was left.
  restore() {
    for (const item of this.items) this.place(item);
  }

  interactables(where) {
    const list = [];
    for (const item of this.items) {
      if (item.def.where !== where || item.state !== "waiting") continue;
      list.push({
        kind: "use",
        box: item.box,
        ref: { use: () => this.take(item) },
        prompt: `relic:${item.def.verb}`,
      });
    }
    return list;
  }

  take(item) {
    if (item.state !== "waiting") return false;
    item.state = "taking";
    item.taking = 0;
    this.discover(item.def.id);
    // What it was set down on stays; only the thing itself is lifted away.
    if (item.def.leave)
      item.model.traverse((m) => {
        if (m.isMesh && !this.stays(item, m)) m.visible = false;
      });
    return true;
  }

  discover(id) {
    const def = RELICS.find((relic) => relic.id === id);
    if (!def || !findRelic(id)) return false;
    const count = progress.relics.size;
    this.sound.play("relic");
    this.hud.relic(def.name, def.line, count, RELICS.length);
    this.onFound?.(def, count);
    return true;
  }

  update(dt, where) {
    this.time += dt;
    for (const item of this.items) {
      if (item.def.where !== where || item.state === "gone") continue;
      const s = item.sprite;
      if (item.state === "taking") {
        item.taking += dt;
        const k = Math.min(1, item.taking / TAKE);
        if (!item.def.leave) {
          item.model.position.y = item.home.y + k * 0.6;
          item.model.rotation.y = item.def.yaw + k * 3;
          item.model.scale.setScalar((item.def.scale ?? 1) * (1 - k * k));
        }
        s.scale.setScalar(0.55 + k * 1.6);
        s.material.opacity = 1 - k;
        if (item.light)
          item.light.intensity = item.def.light.intensity * (1 - k);
        if (k >= 1) this.place(item);
        continue;
      }
      // A glint that catches the eye now and then, never a beacon.
      const t = (this.time + item.seed) % 2.8;
      const flash = Math.max(0, 1 - Math.abs(t - 0.25) / 0.25);
      s.scale.setScalar(0.3 + flash * 0.45);
      s.material.rotation = this.time * 0.6;
      if (item.flameMat) {
        const f = 2 + Math.sin(this.time * 9 + item.seed) * 0.25;
        item.flameMat.emissiveIntensity = f;
        item.light.intensity =
          item.def.light.intensity * (0.95 + Math.sin(this.time * 7.3) * 0.09);
      }
    }
  }

  // For the Relics screen.
  list() {
    return RELICS.map((def) => ({
      ...def,
      found: progress.relics.has(def.id),
    }));
  }

  // For the telemetry: where each relic still waiting lies.
  spots() {
    return this.items
      .filter((i) => i.state === "waiting")
      .map((i) => ({
        id: i.def.id,
        where: i.def.where,
        at: [i.home.x, i.home.y, i.home.z].map((v) => +v.toFixed(2)),
      }));
  }
}

// A four-pointed star with a soft core, drawn once.
function glintTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const core = g.createRadialGradient(32, 32, 0, 32, 32, 16);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (const [w, h] of [
    [3, 30],
    [30, 3],
  ]) {
    g.beginPath();
    g.ellipse(32, 32, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fallback(def) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.45, 10).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }),
  );
  m.position.y = 0.06;
  g.add(m);
  if (def.light?.flame) g.userData.parts = { flame: m };
  return g;
}

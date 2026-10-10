import * as THREE from "three";
import "./object-copy.js";
import { ASSET } from "./assetlib.js";
import { finishAsset } from "./asset-finish.js";
import { HeroAnimator, LIP } from "./hero-anim.js";
import { HeroAnimator as PreviousAnimator } from "./hero-anim-previous.js";
import { Hero, climbProgress, RUN_SPEED } from "./hero.js";
import { World } from "./world.js";
import {
  ASSET_CATALOG,
  ASSET_GROUPS,
  LAB_LEVELS,
  findAssets,
} from "./asset-catalog.js";
import { AssetPreviewStore, describeAsset } from "./asset-lab.js";
import { LabEquipment } from "./lab-equipment.js";
import { PISTOL_CAPACITY } from "./weapon-reload.js";
import { LOCAL_PREVIEW, levelPreviewURL } from "./local-preview.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#character-view");
const stage = $(".stage");
const manual = new URLSearchParams(location.search).has("manual");
document.body.classList.toggle("capture-mode", manual);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = {
  model: "refined",
  motion: "idle",
  framing: "full",
  lighting: "studio",
  paused: manual || reduced,
  yaw: 0.4,
  pitch: 0.065,
  zoom: 1,
  time: 0,
  asset: "hero_realistic",
  surfaces: true,
  wireframe: false,
  turntable: false,
  equipment: "off",
  carry: "held",
};
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b21);
scene.fog = new THREE.Fog(0x151b21, 5, 18);
const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 80);
const characterRoot = new THREE.Group();
scene.add(characterRoot);
const assetRoot = new THREE.Group();
scene.add(assetRoot);
const previewStore = new AssetPreviewStore();
const assetById = new Map(ASSET_CATALOG.map((entry) => [entry.id, entry]));
let activePreview = null,
  selectionRequest = 0;
const boundsHelper = new THREE.Box3Helper(new THREE.Box3(), 0xd6b887);
boundsHelper.visible = false;
scene.add(boundsHelper);

const environment = new THREE.Scene();
const room = new THREE.Mesh(
  new THREE.BoxGeometry(12, 9, 12),
  new THREE.MeshBasicMaterial({ color: 0x363e49, side: THREE.BackSide }),
);
room.position.y = 2;
environment.add(room);
for (const [position, size, color] of [
  [[-3, 3, 4], [2.5, 4, 0.08], 0xffe2b8],
  [[3, 2.8, 1], [2, 3, 0.08], 0xd4e9f7],
  [[0, 4.5, -3], [3, 2, 0.08], 0xfff2df],
]) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshBasicMaterial({ color }),
  );
  panel.position.set(...position);
  panel.lookAt(0, 1, 0);
  environment.add(panel);
}
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentTarget = pmrem.fromScene(environment, 0.04, 0.1, 30);
scene.environment = environmentTarget.texture;
scene.environmentIntensity = 0.48;
pmrem.dispose();
environment.traverse((node) => {
  node.geometry?.dispose();
  node.material?.dispose();
});

const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x413329, 1.3);
const key = new THREE.DirectionalLight(0xffdfb0, 3.2);
const fill = new THREE.DirectionalLight(0xc0d8ef, 1.15);
const rim = new THREE.DirectionalLight(0xffe4c1, 2.3);
key.position.set(-3, 5, 4);
key.target.position.set(0, 0.9, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {
  left: -2.7,
  right: 2.7,
  top: 2.7,
  bottom: -2.7,
  near: 0.1,
  far: 14,
});
key.shadow.normalBias = 0.012;
key.shadow.bias = -0.00015;
fill.position.set(3, 2, 3);
rim.position.set(1, 3, -3);
scene.add(hemi, key, key.target, fill, rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({
    color: 0x20282d,
    roughness: 0.96,
    metalness: 0.04,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.004;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(60, 120, 0x829293, 0x829293);
grid.material.transparent = true;
grid.material.opacity = 0.08;
grid.material.depthWrite = false;
grid.position.y = -0.001;
scene.add(grid);

let texturesStarted = false;
let texturesDone;
const textureReady = new Promise((resolve) => {
  texturesDone = resolve;
});
const errors = [];
THREE.DefaultLoadingManager.onStart = () => {
  texturesStarted = true;
};
THREE.DefaultLoadingManager.onLoad = () => {
  texturesDone();
};
THREE.DefaultLoadingManager.onError = (url) => {
  errors.push(`Texture failed: ${url}`);
};

const entries = await Promise.all(
  ["original", "refined"].map(async (name) => {
    const file = name === "original" ? "hero_previous" : "hero_realistic";
    const model = await ASSET(
      new URL(`./assets/${file}.js`, import.meta.url).href,
      {
        keepHierarchy: true,
        surfaces: false,
      },
    );
    if (!model.userData.joints?.head)
      throw new Error(`Missing explorer hierarchy: ${name}`);
    finishAsset(THREE, model, file);
    characterRoot.add(model);
    const info = describeAsset(model);
    const Animator = name === "original" ? PreviousAnimator : HeroAnimator;
    const animator = new Animator(model);
    return [
      name,
      { model, animator, info, hangHeight: animator.hangReach(0.3) - LIP },
    ];
  }),
);
if (texturesStarted) await textureReady;
if (errors.length) throw new Error(errors.join("\n"));
const models = Object.fromEntries(entries);
const labEquipment = new LabEquipment(
  models.refined.model,
  models.refined.animator,
);
const hero = {
  state: "ground",
  pos: new THREE.Vector3(),
  snap: { x: 0, z: 0 },
  yaw: 0,
  speed: 0,
  vel: new THREE.Vector3(),
  feet: 0,
  stepLift: 0,
  landing: 0,
  throwT: 99,
  catchT: 99,
  stun: 0,
  t: 0,
  swimming: false,
  swimSpeed: 0,
  swimVertical: 0,
};
const swimMotions = {
  swim: new THREE.Vector3(0, 0, 1),
  rise: new THREE.Vector3(0, 0.94, 0.342).normalize(),
  dive: new THREE.Vector3(0, -0.94, 0.342).normalize(),
  rest: new THREE.Vector3(0, 0, 1),
};
const swimmer = new Hero(new World(), { interactables: () => [] });
swimmer.swimVolume = {
  active: () => true,
  current: () => ({ x: 0, z: 0 }),
  minX: -1000,
  maxX: 1000,
  minZ: -1000,
  maxZ: 1000,
  bottom: 1,
  top: 1000,
};
for (const { animator } of Object.values(models))
  animator.groundAt = () => ({
    height: hero.feet,
    normal: new THREE.Vector3(0, 1, 0),
  });

const lightPresets = {
  studio: {
    background: 0x151b21,
    floor: 0x20282d,
    sky: 0xdbe8ff,
    ground: 0x413329,
    key: 0xffdfb0,
    fill: 0xc0d8ef,
    rim: 0xffe4c1,
    intensity: [1.3, 3.2, 1.15, 2.3],
    exposure: 1.08,
  },
  dawn: {
    background: 0x38322e,
    floor: 0x665443,
    sky: 0xe1e9ee,
    ground: 0x9f7145,
    key: 0xffcf93,
    fill: 0xc5d9f1,
    rim: 0xffdcac,
    intensity: [1.6, 3.4, 0.7, 1.7],
    exposure: 1.04,
  },
  forest: {
    background: 0x182521,
    floor: 0x27372c,
    sky: 0xc0dacb,
    ground: 0x354132,
    key: 0xe9e1bd,
    fill: 0x9bc1c7,
    rim: 0xdbeabd,
    intensity: [1.5, 2.2, 1, 2.4],
    exposure: 1.13,
  },
};

function announce() {
  if (!assetById.get(state.asset)?.character) {
    $("#selection-status").textContent =
      `${assetById.get(state.asset)?.name}, native scale.`;
    return;
  }
  const framing = {
    full: "full body",
    portrait: "portrait",
    upper: "upper body",
    boots: "boots",
  }[state.framing];
  $("#selection-status").textContent =
    `${state.model === "refined" ? "Nyra Varen" : "Previous explorer"}, ${framing}, ${state.motion}.`;
}

function pressed(attribute, value) {
  for (const button of document.querySelectorAll(`[data-${attribute}]`))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset[attribute] === value),
    );
}

function updateAssetURL(id) {
  const url = new URL(location.href);
  url.pathname = `/labs/${encodeURIComponent(id)}`;
  url.searchParams.delete("asset");
  history.replaceState(null, "", url);
}

function setModel(value, { updateURL = true } = {}) {
  if (!models[value]) throw new Error("Unknown explorer");
  selectionRequest++;
  state.model = value;
  state.asset = value === "refined" ? "hero_realistic" : "hero_previous";
  labEquipment.setActive(value === "refined");
  labEquipment.prepare(0, hero);
  previewStore.active = null;
  assetRoot.clear();
  characterRoot.visible = true;
  for (const [name, entry] of Object.entries(models))
    entry.model.visible = name === value;
  $("#version-label").textContent =
    value === "refined" ? "Nyra Varen" : "Previous explorer";
  pressed("model", value);
  const model = models[value].model;
  activePreview = {
    entry: assetById.get(state.asset),
    model,
    info: models[value].info,
  };
  updateInspector();
  updateStageScale();
  $("#loading").hidden = true;
  if (updateURL) updateAssetURL(state.asset);
  announce();
}

const formatLength = (value) =>
  value < 0.1 ? `${(value * 100).toFixed(1)} cm` : `${value.toFixed(2)} m`;
function updateInspector() {
  if (!activePreview) return;
  const { entry, model } = activePreview;
  if (entry.id === "hero_realistic") {
    activePreview.info = describeAsset(model);
    activePreview.info.parts.push(...labEquipment.parts());
  }
  const { info } = activePreview;
  const character = Boolean(entry.character);
  $("#asset-name").textContent = entry.name;
  $("#asset-category-label").textContent = entry.category;
  $("#asset-description").textContent =
    entry.description || "Inspect the original asset at its native scale.";
  $("#asset-size").textContent = info.size
    .toArray()
    .map(formatLength)
    .join(" × ");
  $("#asset-facts").textContent =
    `${Math.round(info.triangles).toLocaleString("en")} triangles · ${info.meshes} meshes · ${info.materials} materials`;
  $("#asset-source").href = entry.path;
  $("#asset-source").textContent = `${entry.id}.js →`;
  $("#version-label").textContent = entry.name;
  canvas.setAttribute(
    "aria-label",
    `${entry.name} in 3D. Arrow keys rotate. Plus and minus zoom.`,
  );
  for (const node of document.querySelectorAll("[data-character-only]"))
    node.hidden = !character;
  $("#equipment-controls").hidden = entry.id !== "hero_realistic";
  syncEquipmentControls();
  $("#surface-option").hidden = character;
  $("#picked-part").textContent = "Click the model to inspect a mesh.";
  $("#parts-count").textContent = info.parts.length;
  $("#asset-parts").replaceChildren(
    ...info.parts.map((part) => {
      const item = document.createElement("li"),
        type = document.createElement("small");
      item.append(document.createTextNode(part.name));
      type.textContent = part.section;
      item.append(type);
      return item;
    }),
  );
  if (!info.parts.length) {
    const item = document.createElement("li");
    item.textContent = "No declared rig or moving parts.";
    $("#asset-parts").append(item);
  }
  for (const button of document.querySelectorAll("[data-asset]")) {
    const selected = button.dataset.asset === state.asset;
    button.setAttribute("aria-current", String(selected));
  }
  model.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      material.wireframe = state.wireframe;
  });
  boundsHelper.box.copy(info.bounds);
  setPaused(state.paused);
}

function updateStageScale() {
  if (!activePreview) return;
  const character = Boolean(activePreview.entry.character);
  const extent = character
    ? 1.8
    : Math.max(...activePreview.info.size.toArray());
  const spacing = character
    ? 0.5
    : 10 ** Math.floor(Math.log10(Math.max(0.03, extent) / 3));
  grid.scale.setScalar(spacing / 0.5);
  grid.position.z = 0;
  $("#grid-scale").textContent = `Grid spacing: ${formatLength(spacing)}`;
  const reach = Math.max(0.3, extent);
  const center = activePreview.info.bounds.getCenter(new THREE.Vector3());
  camera.near = Math.max(0.005, reach / 1000);
  camera.far = Math.max(80, reach * 30);
  camera.updateProjectionMatrix();
  scene.fog.near = Math.max(5, reach * 3);
  scene.fog.far = Math.max(18, reach * 12);
  floor.scale.setScalar(Math.max(1, reach / 10));
  if (character) {
    key.position.set(-3, 5, 4);
    key.target.position.set(0, 0.9, 0);
    fill.position.set(3, 2, 3);
    rim.position.set(1, 3, -3);
  } else {
    key.position
      .copy(center)
      .add(new THREE.Vector3(-1.7, 2.5, 2).multiplyScalar(reach));
    key.target.position.copy(center);
    fill.position
      .copy(center)
      .add(new THREE.Vector3(2, 1.5, 2).multiplyScalar(reach));
    rim.position
      .copy(center)
      .add(new THREE.Vector3(0.6, 2, -2).multiplyScalar(reach));
  }
  const shadowReach = character ? 2.7 : reach * 1.4;
  Object.assign(key.shadow.camera, {
    left: -shadowReach,
    right: shadowReach,
    top: shadowReach,
    bottom: -shadowReach,
    far: Math.max(14, reach * 12),
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = character ? 0.012 : Math.min(0.025, reach * 0.002);
}

async function setAsset(id, { updateURL = true } = {}) {
  const entry = assetById.get(id);
  if (!entry) throw new Error(`Unknown asset: ${id}`);
  if (entry.character) {
    setModel(entry.character, { updateURL });
    resetView();
    render();
    return true;
  }
  const request = ++selectionRequest;
  previewStore.active = `${entry.id}:${state.surfaces}`;
  $("#loading").hidden = false;
  $("#loading").classList.remove("failed");
  $("#retry-load").hidden = true;
  $("#loading-message").textContent = `Loading ${entry.name.toLowerCase()}…`;
  $("#retry-load").dataset.asset = id;
  try {
    const preview = await previewStore.load(entry, state.surfaces);
    if (request !== selectionRequest) return false;
    if (preview.disposed) throw new Error(`Preview expired: ${entry.id}`);
    labEquipment.setActive(false);
    labEquipment.prepare(0, hero);
    characterRoot.visible = false;
    assetRoot.clear();
    assetRoot.add(preview.model);
    state.asset = id;
    activePreview = preview;
    resetView();
    updateInspector();
    updateStageScale();
    await renderer.compileAsync(scene, camera);
    if (request !== selectionRequest) return false;
    render();
    $("#loading").hidden = true;
    if (updateURL) updateAssetURL(id);
    announce();
    return true;
  } catch (error) {
    if (request !== selectionRequest) return false;
    $("#loading").classList.add("failed");
    $("#loading-message").textContent =
      `Could not load ${entry.name.toLowerCase()}. Select another asset or try again.`;
    $("#retry-load").hidden = false;
    errors.push(error.message);
    return false;
  }
}

function populateCatalog() {
  const matches = findAssets(
    $("#asset-search").value,
    $("#asset-category").value,
  );
  $("#catalog-count").textContent =
    `${matches.length} / ${ASSET_CATALOG.length}`;
  $("#catalog-empty").hidden = matches.length !== 0;
  syncCategoryPicker();
  $("#asset-list").replaceChildren();
  for (const category of ASSET_GROUPS) {
    const entries = matches.filter((entry) => entry.category === category);
    if (!entries.length) continue;
    const section = document.createElement("section"),
      heading = document.createElement("h3");
    section.className = "asset-group";
    heading.textContent = category;
    section.append(heading);
    for (const entry of entries) {
      const button = document.createElement("button"),
        source = document.createElement("small");
      button.type = "button";
      button.className = "asset-item";
      button.dataset.asset = entry.id;
      button.setAttribute("aria-current", String(entry.id === state.asset));
      button.append(document.createTextNode(entry.name));
      source.textContent = entry.id;
      button.append(source);
      button.addEventListener("click", () => setAsset(entry.id));
      section.append(button);
    }
    $("#asset-list").append(section);
  }
}

function setMotion(value) {
  if (
    ![
      "idle",
      "walk",
      "run",
      ...Object.keys(swimMotions),
      "hang",
      "climb",
    ].includes(value)
  )
    throw new Error("Unknown movement");
  if (value === "climb") {
    setMotion("hang");
    for (let i = 0; i < 30; i++) advance(1 / 60);
  }
  state.motion = value;
  hero.t = 0;
  hero.feet = 0;
  hero.swimming = value in swimMotions;
  hero.state = hero.swimming
    ? "swim"
    : ["hang", "climb"].includes(value)
      ? value
      : "ground";
  hero.swimSpeed = hero.swimVertical = 0;
  if (hero.swimming) {
    swimmer.spawn(0, 0, 500, 0);
    swimmer.clock = 0;
    hero.feet = 1.8;
    hero.vel.set(0, 0, 0);
  }
  hero.ledge = ["hang", "climb"].includes(value)
    ? { n: { x: 0, z: -1 }, top: 2.3, hand: { x: 0, z: 0 } }
    : null;
  if (hero.ledge) {
    hero.speed = 0;
    hero.vel.set(0, 0, 0);
    hero.pos.set(0, 0, -0.27);
    hero.feet = 2.3 - models[state.model].hangHeight;
  }
  $("#motion-time").textContent = "0.00 s";
  pressed("motion", value);
  labEquipment.prepare(0, hero);
  syncEquipmentControls();
  announce();
}

function syncEquipmentControls() {
  pressed("equipment", state.equipment);
  pressed("carry", state.carry);
  const pistols = state.equipment === "pistols";
  $("#equipment-actions").hidden = !pistols;
  const traversal = !["ground", "air"].includes(hero.state) || hero.swimming;
  for (const button of document.querySelectorAll("[data-carry]"))
    button.disabled = traversal && button.dataset.carry !== "holstered";
  $("#equipment-fire").disabled = !pistols || !hero.weaponActive;
  $("#equipment-reload").disabled =
    !pistols ||
    !hero.weaponActive ||
    labEquipment.kit.ammo === PISTOL_CAPACITY ||
    labEquipment.kit.reloadLeft > 0;
  const status =
    state.equipment === "off"
      ? "Choose a tool to inspect it on Nyra."
      : !hero.weaponActive
        ? pistols
          ? traversal
            ? "Pistols holstered for traversal."
            : "Both pistols secured in their hip holsters."
          : "Relay orb stowed for traversal."
        : pistols
          ? labEquipment.kit.reloadLeft > 0
            ? "Reloading, step through the magazine swap."
            : `${labEquipment.kit.ammo} / ${PISTOL_CAPACITY} rounds. R reloads.`
          : "Relay orb held in her right hand.";
  if ($("#equipment-status").textContent !== status)
    $("#equipment-status").textContent = status;
}

function setEquipment(value) {
  labEquipment.select(value, state.asset === "hero_realistic");
  state.equipment = value;
  labEquipment.prepare(0, hero);
  if (state.asset === "hero_realistic") labEquipment.refreshPose(hero);
  updateInspector();
  render();
}

function resetView() {
  state.yaw = 0.4;
  state.pitch = { full: 0.065, portrait: 0.015, upper: 0.015, boots: 0.18 }[
    state.framing
  ];
  state.zoom = 1;
  if (activePreview && !activePreview.entry.character) state.pitch = 0.18;
}

function setFraming(value) {
  if (!["full", "portrait", "upper", "boots"].includes(value))
    throw new Error("Unknown framing");
  state.framing = value;
  resetView();
  pressed("framing", value);
  announce();
}

function setLight(value) {
  const preset = lightPresets[value];
  if (!preset) throw new Error("Unknown lighting");
  state.lighting = value;
  scene.background.set(preset.background);
  scene.fog.color.set(preset.background);
  floor.material.color.set(preset.floor);
  hemi.color.set(preset.sky);
  hemi.groundColor.set(preset.ground);
  key.color.set(preset.key);
  fill.color.set(preset.fill);
  rim.color.set(preset.rim);
  [hemi, key, fill, rim].forEach((light, index) => {
    light.intensity = preset.intensity[index];
  });
  renderer.toneMappingExposure = preset.exposure;
  $("#lighting").value = value;
}

function setPaused(value) {
  state.paused = Boolean(value);
  const character = Boolean(activePreview?.entry.character);
  $("#pause-motion").disabled = !character && !state.turntable;
  $("#pause-motion").setAttribute("aria-pressed", String(state.paused));
  $("#pause-motion").textContent =
    `${state.paused ? "Resume" : "Pause"} ${character ? "movement" : "turntable"}`;
}

function advance(dt) {
  state.time += dt;
  if (state.turntable) state.yaw += dt * 0.24;
  if (!activePreview?.entry.character) return;
  hero.t += dt / (state.motion === "climb" ? 0.95 : 1);
  const speed = {
    idle: 0,
    walk: 1.7,
    run: activePreview.entry.character === "refined" ? RUN_SPEED : 4.6,
    swim: 2.6,
    hang: 0,
    climb: 0,
  }[state.motion];
  if (hero.swimming) {
    const previous = swimmer.pos.z;
    swimmer.update(dt, {
      move: { x: 0, y: state.motion === "rest" ? 0 : 1 },
      camYaw: 0,
      swimDirection: swimMotions[state.motion],
    });
    hero.vel.set(swimmer.vel.x, swimmer.vel.y, swimmer.vel.z);
    hero.speed = swimmer.speed;
    hero.swimSpeed = swimmer.swimSpeed;
    hero.swimVertical = swimmer.swimVertical;
    hero.pos.z += swimmer.pos.z - previous;
  } else {
    hero.speed += (speed - hero.speed) * (1 - Math.exp(-dt * 7));
    hero.swimSpeed = hero.swimVertical = 0;
    hero.vel.set(0, 0, hero.speed);
    hero.pos.z += hero.speed * dt;
  }
  if (state.motion === "climb") {
    hero.t = Math.min(1, hero.t);
    const reach = models[state.model].hangHeight;
    const { up, over } = climbProgress(hero.t);
    hero.feet = 2.3 - reach + reach * up;
    hero.pos.z = -0.27 + 0.87 * over;
  }
  characterRoot.position.set(0, 0, 0);
  characterRoot.updateMatrixWorld(true);
  labEquipment.prepare(dt, hero);
  for (const [name, { animator }] of Object.entries(models))
    animator.update(
      dt,
      name === "refined"
        ? hero
        : {
            ...hero,
            equipment: undefined,
            holding: false,
            weaponActive: false,
          },
      reduced,
    );
  if (dt === 0) labEquipment.refreshPose(hero);
  labEquipment.update(dt, hero);
  syncEquipmentControls();
  characterRoot.position.z = -hero.pos.z;
  characterRoot.updateMatrixWorld(true);
  grid.position.z = -(hero.pos.z % 0.5);
  $("#motion-time").textContent =
    `${(hero.t * (state.motion === "climb" ? 0.95 : 1)).toFixed(2)} s`;
}

function render() {
  const traversal =
    ["hang", "climb"].includes(state.motion) && state.framing === "full";
  if (activePreview && !activePreview.entry.character) {
    const box = activePreview.info.bounds;
    const target = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      Math.cos(state.yaw) * Math.cos(state.pitch),
    );
    const right = new THREE.Vector3(
      Math.cos(state.yaw),
      0,
      -Math.sin(state.yaw),
    );
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let fit = 0.02;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(target);
          fit = Math.max(
            fit,
            point.dot(direction) +
              Math.max(
                Math.abs(point.dot(up)) / tan,
                Math.abs(point.dot(right)) / (tan * camera.aspect),
              ),
          );
        }
    camera.position
      .copy(target)
      .addScaledVector(direction, fit * 1.15 * state.zoom);
    camera.lookAt(target);
    renderer.render(scene, camera);
    return;
  }
  const portrait = state.framing === "portrait";
  const framing = {
    full: traversal
      ? { height: hero.feet + 1.12, distance: 4.5 }
      : hero.swimming
        ? { height: 2.35, distance: 7.2 }
        : { height: 0.92, distance: 3.85 },
    portrait: { height: 1.63, distance: 0.85 },
    upper: { height: 1.27, distance: 1.95 },
    boots: { height: 0.22, distance: 1.1 },
  }[state.framing];
  const target = portrait
    ? models[state.model].model.userData.joints.head.localToWorld(
        new THREE.Vector3(0, 0.115, 0.025),
      )
    : new THREE.Vector3(0, framing.height, 0.015);
  const distance = framing.distance * state.zoom;
  camera.position.set(
    target.x + Math.sin(state.yaw) * Math.cos(state.pitch) * distance,
    target.y + Math.sin(state.pitch) * distance,
    target.z + Math.cos(state.yaw) * Math.cos(state.pitch) * distance,
  );
  camera.lookAt(target);
  renderer.render(scene, camera);
}

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

function zoom(factor) {
  const character = Boolean(activePreview?.entry.character);
  state.zoom = THREE.MathUtils.clamp(
    state.zoom * factor,
    character ? 0.62 : 0.15,
    character ? 1.75 : 4,
  );
}
const pointers = new Map();
const pointerOrigins = new Map();
let pinchDistance = 0;
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  pointerOrigins.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener("pointermove", (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const next = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, next);
  if (pointers.size === 1) {
    state.yaw -= (next.x - previous.x) * 0.007;
    state.pitch = THREE.MathUtils.clamp(
      state.pitch + (next.y - previous.y) * 0.005,
      activePreview?.entry.character ? -0.3 : -0.7,
      activePreview?.entry.character ? 0.55 : 1.35,
    );
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance > 5 && pinchDistance > 5) zoom(pinchDistance / distance);
    pinchDistance = distance;
  }
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(event, (input) => {
    const origin = pointerOrigins.get(input.pointerId);
    if (
      event === "pointerup" &&
      pointers.size === 1 &&
      origin &&
      Math.hypot(input.clientX - origin.x, input.clientY - origin.y) < 5
    )
      inspectPart(input);
    pointers.delete(input.pointerId);
    pointerOrigins.delete(input.pointerId);
  });

function inspectPart(event) {
  if (!activePreview) return;
  const rect = canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const hit = ray.intersectObject(activePreview.model, true).find((hit) => {
    if (!hit.object.isMesh) return false;
    for (let node = hit.object; node; node = node.parent)
      if (!node.visible) return false;
    const materials = Array.isArray(hit.object.material)
      ? hit.object.material
      : [hit.object.material];
    return materials.some(
      (material) => material.visible && material.opacity > 0,
    );
  });
  if (!hit) return;
  const mesh = hit.object;
  const triangles = Math.round(
    (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3,
  );
  const materials = (
    Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  )
    .map((material) => material.name || material.type)
    .join(", ");
  $("#picked-part").textContent =
    `${mesh.name || "Unnamed " + mesh.geometry.type} · ${triangles.toLocaleString("en")} triangles · ${materials}`;
  if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
  boundsHelper.box.setFromObject(mesh);
  boundsHelper.visible = true;
  $("#show-bounds").checked = true;
}
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoom(Math.exp(THREE.MathUtils.clamp(event.deltaY, -100, 100) * 0.0015));
  },
  { passive: false },
);
canvas.addEventListener("keydown", (event) => {
  const actions = {
    ArrowLeft: () => {
      state.yaw -= 0.12;
    },
    ArrowRight: () => {
      state.yaw += 0.12;
    },
    ArrowUp: () => {
      state.pitch = Math.min(
        activePreview?.entry.character ? 0.55 : 1.35,
        state.pitch + 0.06,
      );
    },
    ArrowDown: () => {
      state.pitch = Math.max(
        activePreview?.entry.character ? -0.3 : -0.7,
        state.pitch - 0.06,
      );
    },
    "+": () => zoom(0.9),
    "=": () => zoom(0.9),
    "-": () => zoom(1.1),
    " ": () => setPaused(!state.paused),
    Home: resetView,
  };
  if (actions[event.key]) {
    event.preventDefault();
    actions[event.key]();
  }
});
for (const button of document.querySelectorAll("[data-model]"))
  button.addEventListener("click", () => setModel(button.dataset.model));
for (const button of document.querySelectorAll("[data-motion]"))
  button.addEventListener("click", () => setMotion(button.dataset.motion));
for (const button of document.querySelectorAll("[data-framing]"))
  button.addEventListener("click", () => setFraming(button.dataset.framing));
$("#lighting").addEventListener("change", (event) =>
  setLight(event.target.value),
);
$("#pause-motion").addEventListener("click", () => setPaused(!state.paused));
$("#stop-motion").addEventListener("click", () => setMotion("idle"));
$("#restart-motion").addEventListener("click", () => setMotion(state.motion));
$("#step-frame").addEventListener("click", () => {
  setPaused(true);
  advance(1 / 60);
  render();
});
$("#step-tenth").addEventListener("click", () => {
  setPaused(true);
  for (let i = 0; i < 6; i++) advance(1 / 60);
  render();
});
$("#reset-view").addEventListener("click", resetView);
$("#zoom-in").addEventListener("click", () => zoom(0.9));
$("#zoom-out").addEventListener("click", () => zoom(1.1));

for (const button of document.querySelectorAll("[data-equipment]"))
  button.addEventListener("click", () =>
    setEquipment(button.dataset.equipment),
  );
for (const button of document.querySelectorAll("[data-carry]"))
  button.addEventListener("click", () => {
    state.carry = button.dataset.carry;
    labEquipment.setCarry(state.carry);
    labEquipment.prepare(0, hero);
    if (state.paused) advance(0);
    render();
  });
$("#equipment-fire").addEventListener("click", () => {
  labEquipment.fire(hero);
  if (state.paused) advance(0);
  render();
});
function reloadEquipment() {
  labEquipment.reload(hero);
  if (state.paused) advance(0);
  syncEquipmentControls();
  render();
}
$("#equipment-reload").addEventListener("click", reloadEquipment);
addEventListener("keydown", (event) => {
  if (
    event.code !== "KeyR" ||
    event.repeat ||
    /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
    event.target.isContentEditable
  )
    return;
  event.preventDefault();
  reloadEquipment();
});

const categorySelect = $("#asset-category");
const categoryTrigger = $("#category-trigger");
const categoryOptions = $("#category-options");
for (const category of ASSET_GROUPS) {
  const option = document.createElement("option");
  option.value = option.textContent = category;
  categorySelect.append(option);
}
const categoryRows = [...categorySelect.options].map((option, index) => {
  const row = document.createElement("div"),
    name = document.createElement("span"),
    count = document.createElement("span");
  row.id = `category-option-${index}`;
  row.className = "category-option";
  row.dataset.value = option.value;
  row.setAttribute("role", "option");
  name.textContent = option.textContent;
  count.className = "category-count";
  count.setAttribute("aria-hidden", "true");
  row.append(name, count);
  categoryOptions.append(row);
  row.addEventListener("pointermove", () => highlightCategory(index, false));
  row.addEventListener("click", () => chooseCategory(index));
  return row;
});
let activeCategory = 0,
  categorySearch = "",
  categoryTypedAt = 0;

function syncCategoryPicker() {
  const matches = findAssets($("#asset-search").value, "all");
  for (const [index, row] of categoryRows.entries()) {
    const selected = row.dataset.value === categorySelect.value;
    const count = matches.filter(
      (entry) =>
        row.dataset.value === "all" || entry.category === row.dataset.value,
    ).length;
    row.setAttribute("aria-selected", String(selected));
    row.setAttribute(
      "aria-label",
      `${categorySelect.options[index].textContent}, ${count} assets`,
    );
    row.lastElementChild.textContent = count;
    if (selected) {
      $("#category-value").textContent =
        categorySelect.options[index].textContent;
      $("#category-count").textContent = count;
    }
  }
}

function highlightCategory(index, scroll = true) {
  activeCategory = Math.max(0, Math.min(categoryRows.length - 1, index));
  for (const [i, row] of categoryRows.entries())
    row.dataset.active = String(i === activeCategory);
  const row = categoryRows[activeCategory];
  categoryTrigger.setAttribute("aria-activedescendant", row.id);
  if (!scroll) return;
  const top = row.offsetTop,
    bottom = top + row.offsetHeight;
  if (top < categoryOptions.scrollTop) categoryOptions.scrollTop = top;
  else if (bottom > categoryOptions.scrollTop + categoryOptions.clientHeight)
    categoryOptions.scrollTop = bottom - categoryOptions.clientHeight;
}

function openCategories(index = categorySelect.selectedIndex) {
  const rect = categoryTrigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 226), innerWidth - 24);
  categoryOptions.style.width = `${width}px`;
  categoryOptions.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
  categoryOptions.style.maxHeight = "";
  categoryOptions.hidden = false;
  const below = innerHeight - rect.bottom - 18,
    above = rect.top - 18,
    height = Math.min(372, categoryOptions.scrollHeight + 2);
  const upward = below < height && above > below;
  const available = Math.max(80, upward ? above : below);
  categoryOptions.style.maxHeight = `${Math.min(height, available)}px`;
  categoryOptions.style.top = `${upward ? Math.max(12, rect.top - Math.min(height, available) - 6) : rect.bottom + 6}px`;
  categoryTrigger.setAttribute("aria-expanded", "true");
  highlightCategory(index);
}

function closeCategories() {
  categoryOptions.hidden = true;
  categoryTrigger.setAttribute("aria-expanded", "false");
  categoryTrigger.removeAttribute("aria-activedescendant");
  categorySearch = "";
}

function chooseCategory(index, focus = true) {
  categorySelect.value = categoryRows[index].dataset.value;
  categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
  if (focus) categoryTrigger.focus({ preventScroll: true });
}

categoryTrigger.addEventListener("click", () => {
  if (categoryOptions.hidden) openCategories();
  else closeCategories();
});
categoryTrigger.addEventListener("keydown", (event) => {
  const open = !categoryOptions.hidden;
  if (event.key === "Escape" && open) {
    event.preventDefault();
    closeCategories();
  } else if (event.key === "Tab" && open) {
    chooseCategory(activeCategory, false);
  } else if (["Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (open) chooseCategory(activeCategory);
    else openCategories();
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? categoryRows.length - 1
          : open
            ? activeCategory + (event.key === "ArrowDown" ? 1 : -1)
            : categorySelect.selectedIndex;
    if (!open) openCategories(index);
    else highlightCategory(index);
  } else if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    if (!open) openCategories();
    const now = performance.now();
    categorySearch =
      now - categoryTypedAt > 700 ? event.key : categorySearch + event.key;
    categoryTypedAt = now;
    const search = [...categorySearch].every(
      (letter) => letter.toLowerCase() === categorySearch[0].toLowerCase(),
    )
      ? categorySearch[0].toLowerCase()
      : categorySearch.toLowerCase();
    for (let offset = 1; offset <= categoryRows.length; offset++) {
      const index = (activeCategory + offset) % categoryRows.length;
      if (
        categorySelect.options[index].textContent
          .toLowerCase()
          .startsWith(search)
      ) {
        highlightCategory(index);
        break;
      }
    }
  }
});
categoryOptions.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") event.preventDefault();
});
for (const type of ["pointerdown", "focusin"])
  document.addEventListener(type, (event) => {
    if (
      !categoryOptions.hidden &&
      !$(".category-picker").contains(event.target)
    )
      closeCategories();
  });
document.addEventListener(
  "scroll",
  (event) => {
    if (!categoryOptions.hidden && !categoryOptions.contains(event.target))
      closeCategories();
  },
  true,
);
window.addEventListener("resize", closeCategories);
window.addEventListener("blur", closeCategories);
$("#asset-search").addEventListener("input", populateCatalog);
categorySelect.addEventListener("change", () => {
  closeCategories();
  populateCatalog();
});
$("#asset-list").addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = [...$("#asset-list").querySelectorAll("button")],
    index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : THREE.MathUtils.clamp(
            index + (event.key === "ArrowDown" ? 1 : -1),
            0,
            buttons.length - 1,
          );
  buttons[next]?.focus();
});
for (const button of document.querySelectorAll("[data-camera]"))
  button.addEventListener("click", () => {
    state.yaw = { front: 0, quarter: 0.65, side: Math.PI / 2, rear: Math.PI }[
      button.dataset.camera
    ];
    state.pitch = 0.035;
  });
$("#show-grid").addEventListener(
  "change",
  (event) => (grid.visible = event.target.checked),
);
$("#show-bounds").addEventListener("change", (event) => {
  boundsHelper.visible = event.target.checked;
  if (activePreview) boundsHelper.box.copy(activePreview.info.bounds);
});
$("#show-wireframe").addEventListener("change", (event) => {
  state.wireframe = event.target.checked;
  updateInspector();
});
$("#turntable").addEventListener("change", (event) => {
  state.turntable = event.target.checked;
  setPaused(state.turntable ? false : state.paused);
});
$("#game-surfaces").addEventListener("change", (event) => {
  state.surfaces = event.target.checked;
  if (!activePreview?.entry.character) setAsset(state.asset);
});
$("#retry-load").addEventListener("click", (event) =>
  setAsset(event.target.dataset.asset),
);
if (LOCAL_PREVIEW) {
  $("#level-launches").hidden = false;
  for (const level of LAB_LEVELS) {
    const link = document.createElement("a"),
      number = document.createElement("span");
    link.href = levelPreviewURL(level.id);
    link.target = "_blank";
    link.rel = "noopener";
    link.dataset.level = level.id;
    number.textContent = String(level.number).padStart(2, "0");
    link.append(
      number,
      document.createTextNode(level.name.replace(/^The /, "")),
    );
    $("#level-links").append(link);
  }
}
populateCatalog();

setModel(state.model, { updateURL: false });
setPaused(state.paused);
for (let i = 0; i < 60; i++) advance(1 / 60);
for (const { model } of Object.values(models)) {
  model.visible = true;
  await renderer.compileAsync(scene, camera);
  model.visible = false;
}
setModel(state.model, { updateURL: false });
render();
$("#loading").hidden = true;

window.__CHARACTER__ = {
  ready: true,
  state,
  models,
  hero,
  scene,
  renderer,
  camera,
  setModel,
  setMotion,
  setFraming,
  setLight,
  setPaused,
  setView({
    yaw = state.yaw,
    pitch = state.pitch,
    zoom: scale = state.zoom,
  } = {}) {
    state.yaw = yaw;
    state.pitch = THREE.MathUtils.clamp(pitch, -0.3, 0.55);
    state.zoom = THREE.MathUtils.clamp(scale, 0.62, 1.75);
    render();
  },
  step(seconds = 1 / 60) {
    const count = Math.max(
      1,
      Math.ceil(Math.min(30, Math.max(0, seconds)) * 60),
    );
    for (let i = 0; i < count; i++)
      advance(Math.min(30, Math.max(0, seconds)) / count);
    render();
    return this.snapshot();
  },
  snapshot() {
    const { model, animator } = models[state.model];
    const bounds = new THREE.Box3().setFromObject(model);
    return {
      ...state,
      displacement: hero.pos.z,
      phase: animator.phase,
      swimPhase: animator.swimPhase,
      velocity: hero.vel.toArray(),
      swimVertical: hero.swimVertical,
      bodyPitch: model.rotation.x,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      errors: [...errors],
    };
  },
};

window.__LAB__ = {
  ready: true,
  catalog: ASSET_CATALOG,
  state,
  setAsset,
  setEquipment,
  equipment: labEquipment,
  store: previewStore,
  get active() {
    return activePreview;
  },
  snapshot() {
    return {
      asset: state.asset,
      name: activePreview?.entry.name,
      nativeSize: activePreview?.info.size.toArray(),
      cache: [...previewStore.cache.keys()],
      pending: previewStore.pending.size,
      disposed: { ...previewStore.disposed },
      local: LOCAL_PREVIEW,
      errors: [...errors],
    };
  },
};
const requestedAsset =
  decodeURIComponent(
    /^\/labs\/([^/]+)\/?$/.exec(location.pathname)?.[1] || "",
  ) || new URLSearchParams(location.search).get("asset");
if (requestedAsset && assetById.has(requestedAsset))
  await setAsset(requestedAsset, { updateURL: false });
window.addEventListener("pagehide", () => {
  selectionRequest++;
  previewStore.clear();
  labEquipment.setActive(false);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && state.asset === "hero_realistic")
    setEquipment(state.equipment);
  if (event.persisted && activePreview && !activePreview.entry.character)
    setAsset(state.asset);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  if (!state.paused && !document.hidden && dt > 0) {
    const count = Math.max(1, Math.ceil(dt * 60));
    for (let i = 0; i < count; i++) advance(dt / count);
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

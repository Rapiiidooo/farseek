import * as THREE from "three";
import { Grade, gradeComposer } from "./grading.js";
import { HeatHazePass } from "./heat-haze.js";
import { CloseUp, heroUniforms } from "./close-up.js";
import { chainShader } from "./shader-chain.js";
import { settings } from "./store.js";

// Light and atmosphere per world, installed while each world prepares and updated just before
// it draws: the grade, the court's heat haze and lower sun, the isles' golden rim and cloud
// bounce, the aurora in the frozen reach's ice, the sea's caustics on the causeway and Nyra,
// and Nyra's close-up lighting everywhere. No scene gains a light, so every world keeps the
// light count its programs were prepared with.

// The court's sun: later and lower than the rig's 15.2, so the stone warms and shadows lengthen.
const COURT_HOUR = 15.85;

// Close-up key and rim per world: colour and intensity, on each world's own light scale.
const CLOSE_UP = {
  court: { key: [1, 0.9, 0.78, 2.4], rim: [1, 0.8, 0.56, 4.2] },
  two: { key: [0.84, 0.8, 1, 1.25], rim: [0.78, 0.62, 1, 2.6] },
  three: { key: [1, 0.86, 0.7, 1.35], rim: [1, 0.76, 0.42, 3.2] },
  four: { key: [0.9, 0.94, 1, 1.3], rim: [0.78, 0.9, 1, 2.4] },
  five: { key: [1, 0.92, 0.8, 1.2], rim: [1, 0.84, 0.56, 2.6] },
  six: { key: [0.82, 0.96, 1, 1], rim: [0.62, 0.95, 1, 2] },
};

function look(id) {
  const { key, rim } = CLOSE_UP[id] || CLOSE_UP.five;
  const color = ([r, g, b, k]) => new THREE.Color(r * k, g * k, b * k);
  return { key: color(key), rim: color(rim) };
}

const EFFECTS = {
  court(app) {
    const { rig } = app;
    rig.setTime({ hour: COURT_HOUR });
    const composer = rig.post?.composer;
    if (!composer) return {};
    HeatHazePass.attachDepth(composer);
    const haze = new HeatHazePass(rig.post.renderPass.camera);
    composer.insertPass(haze, composer.passes.indexOf(rig.post.renderPass) + 1);
    return {
      haze,
      update() {
        haze.camera = rig.post.renderPass.camera;
        haze.enabled = settings.quality !== "fast";
      },
    };
  },

  three(app, world) {
    const fill = world.scene.children.find((node) => node.isHemisphereLight);
    // Light thrown up by the golden cloud sea onto every underside.
    fill?.groundColor.set(0xf0b46c);
    if (fill) fill.intensity = 1.38;
    world.sun.color.set(0xffcb8a);
    world.sun.intensity = 3.75;
    // Nyra's silhouette catches a golden rim when she is seen against the low sun. It lives in
    // her materials: a scene light here would give the isles a light count of their own.
    const sun = new THREE.Vector3()
      .copy(world.sun.position)
      .sub(world.sun.target.position)
      .setY(0)
      .normalize();
    const forward = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color(0xffbf6e).multiplyScalar(4);
    return {
      update(camera) {
        camera.getWorldDirection(forward).setY(0);
        if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
        forward.normalize();
        side.crossVectors(up, forward);
        const lean = Math.sign(side.dot(sun)) || 1;
        heroUniforms.uFdWorldRimDir.value
          .copy(forward)
          .addScaledVector(side, 0.55 * lean)
          .addScaledVector(up, 0.3)
          .normalize();
        heroUniforms.uFdWorldRimColor.value.copy(color);
        heroUniforms.uFdWorldRim.value = THREE.MathUtils.smoothstep(
          forward.dot(sun),
          -0.2,
          0.8,
        );
      },
    };
  },

  four(app, world) {
    // Ice reflects the aurora through an environment redrawn each second on High, at its size:
    // another size, like an ice shader, makes programs that stall when first seen through a door.
    const { renderer } = app;
    const { scene: sky, uniforms } = world.envSky;
    const first = world.scene.environment;
    const cube = new THREE.WebGLCubeRenderTarget(first.image.height / 4, {
      type: THREE.HalfFloatType,
    });
    const eye = new THREE.CubeCamera(1, 1000, cube);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let target = null,
      drawn = -Infinity;
    const redraw = () => {
      uniforms.uTime.value = world.skyU.uTime.value;
      const previous = renderer.getRenderTarget();
      eye.update(renderer, sky);
      target = pmrem.fromCubemap(cube.texture, target);
      renderer.setRenderTarget(previous);
      world.scene.environment = target.texture;
    };
    redraw();
    first.dispose();
    return {
      update() {
        const now = world.skyU.uTime.value;
        if (settings.quality !== "high" || Math.abs(now - drawn) < 1) return;
        drawn = now;
        redraw();
      },
    };
  },

  five(app, world) {
    const light = world.forest.light;
    return {
      update() {
        light?.setQuality(settings.quality);
      },
    };
  },

  six(app, world) {
    const { drowned, atlantis } = world;
    const u = atlantis.u;
    for (const material of [drowned.stone, drowned.trim])
      chainShader(material, "fd-causeway-caustic", (shader) =>
        causeway(shader, u),
      );
    const chest = new THREE.Vector3();
    return {
      update() {
        heroUniforms.uFdTime.value = u.uTime.value;
        if (world.epilogue.active || !world.hero) return;
        const hero = world.hero;
        chest.set(hero.pos.x, hero.feet + 1.1, hero.pos.z);
        heroUniforms.uFdCaustic.value = drowned.sanctuary.waterAt(chest) * 0.85;
      },
    };
  },
};

// Caustic light from the rippling surface on the causeway, as on the city's ruins, and dry
// inside the air shield.
function causeway(shader, u) {
  Object.assign(shader.uniforms, {
    uTime: u.uTime,
    uAir: u.uAir,
    uAirCenter: u.uAirCenter,
    uAirRadii: u.uAirRadii,
  });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vFdSea;")
    .replace(
      "#include <fog_vertex>",
      "#include <fog_vertex>\nvFdSea = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uTime;
uniform float uAir;
uniform vec3 uAirCenter;
uniform vec3 uAirRadii;
varying vec3 vFdSea;
float fdSeaCaustic( vec2 p ) {
	p *= 0.34;
	float a = sin( p.x * 3.1 + sin( p.y * 2.3 + uTime * 0.9 ) ) + sin( p.y * 2.7 + sin( p.x * 1.9 - uTime * 0.7 ) );
	float b = sin( p.x * 1.7 - p.y * 2.9 + uTime * 0.5 + sin( p.y * 1.1 ) );
	return pow( max( 0.0, 1.0 - abs( a ) * 0.5 ), 7.0 ) * ( 0.75 + 0.25 * b );
}`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
	{
		float fdUp = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
		float fdWet = 1.0 - uAir * ( 1.0 - smoothstep( 0.96, 1.04, length( ( vFdSea - uAirCenter ) / uAirRadii ) ) );
		totalEmissiveRadiance += diffuseColor.rgb * vec3( 0.5, 0.85, 1.0 ) * fdSeaCaustic( vFdSea.xz ) * smoothstep( 0.1, 0.8, fdUp ) * 1.6 * fdWet;
	}`,
    );
}

export function createAtmosphere(app) {
  const grade = new Grade();
  const closeUp = new CloseUp(app);
  const effects = new Map();
  let lastId = null,
    lastTime = null;

  function frame(id, world, camera) {
    const now = app.state.time;
    const dt =
      lastTime === null ? 0 : Math.min(0.1, Math.max(0, now - lastTime));
    lastTime = now;
    const cut = id !== lastId && !app.state.crossing;
    lastId = id;
    grade.update(world.epilogue?.active ? "neutral" : id, dt, cut);
    heroUniforms.uFdCaustic.value = 0;
    heroUniforms.uFdWorldRim.value = 0;
    const effect = effects.get(world);
    effect.update?.(camera, dt);
    closeUp.update(world, effect.look, camera, dt);
  }

  // Installs a world's atmosphere before its shaders compile; later preparations reuse it.
  function attach(id, world) {
    closeUp.install();
    if (effects.has(world)) return;
    gradeComposer(id === "court" ? app.rig.post?.composer : world.composer);
    const effect = EFFECTS[id]?.(app, world) || {};
    effect.look = look(id);
    effects.set(world, effect);
    if (id === "court") closeUp.prepare(app.renderer);
    const before = world.beforeRender;
    // A world seen through a door also passes here, and must not take over the frame's light.
    world.beforeRender = (camera) => {
      before?.(camera);
      if (world === app.worlds.current) frame(id, world, camera);
    };
  }

  return {
    attach,
    grade,
    // Raises Nyra's close-up lighting (true), lowers it (false), or returns it to the shots (null).
    closeUp: (on) => closeUp.force(on),
    get closeUpAmount() {
      return closeUp.amount;
    },
    effect: (world) => effects.get(world),
  };
}

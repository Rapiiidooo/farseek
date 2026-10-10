import * as THREE from "three";
import { chainShader } from "./shader-chain.js";
import { settings } from "./store.js";

// Nyra's close-up lighting. Her own materials carry a soft key, a rim, a self-shadow from a
// map fitted to her body, and the sea's caustics, all driven by uniforms: nothing is added to
// any scene, so light counts and programs never change when a shot starts or ends.
export const HERO_LAYER = 7;

export const heroUniforms = {
  uFdCloseUp: { value: 0 },
  uFdKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uFdKeyColor: { value: new THREE.Color(0, 0, 0) },
  uFdRimDir: { value: new THREE.Vector3(0, 1, 0) },
  uFdRimColor: { value: new THREE.Color(0, 0, 0) },
  uFdShadowMap: { value: null },
  uFdShadowMatrix: { value: new THREE.Matrix4() },
  uFdShadowTexel: { value: 1 / 1024 },
  uFdCaustic: { value: 0 },
  uFdTime: { value: 0 },
  uFdWorldRim: { value: 0 },
  uFdWorldRimDir: { value: new THREE.Vector3(0, 1, 0) },
  uFdWorldRimColor: { value: new THREE.Color(0, 0, 0) },
};

const VERTEX_PARS = /* glsl */ `
varying vec3 vFdWorld;`;
const VERTEX_WORLD = /* glsl */ `
#ifdef USE_INSTANCING
	vFdWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#else
	vFdWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uFdCloseUp, uFdCaustic, uFdTime, uFdShadowTexel, uFdWorldRim;
uniform vec3 uFdKeyDir, uFdKeyColor, uFdRimDir, uFdRimColor, uFdWorldRimDir, uFdWorldRimColor;
uniform sampler2D uFdShadowMap;
uniform mat4 uFdShadowMatrix;
varying vec3 vFdWorld;
float fdCaustic( vec2 p ) {
	p *= 0.2;
	float a = sin( p.x * 3.1 + sin( p.y * 2.3 + uFdTime * 0.9 ) ) + sin( p.y * 2.7 + sin( p.x * 1.9 - uFdTime * 0.7 ) );
	float b = sin( p.x * 1.7 - p.y * 2.9 + uFdTime * 0.5 + sin( p.y * 1.1 ) );
	return pow( max( 0.0, 1.0 - abs( a ) * 0.5 ), 7.0 ) * ( 0.75 + 0.25 * b );
}
float fdSelfShadow( vec3 world, vec3 worldNormal ) {
	vec4 coord = uFdShadowMatrix * vec4( world + worldNormal * 0.006, 1.0 );
	if ( coord.x <= 0.0 || coord.x >= 1.0 || coord.y <= 0.0 || coord.y >= 1.0 || coord.z >= 1.0 ) return 1.0;
	float lit = 0.0;
	float depth = coord.z - 0.0012;
	lit += step( depth, texture2D( uFdShadowMap, coord.xy + vec2( -0.7, -0.4 ) * uFdShadowTexel ).x );
	lit += step( depth, texture2D( uFdShadowMap, coord.xy + vec2( 0.4, -0.7 ) * uFdShadowTexel ).x );
	lit += step( depth, texture2D( uFdShadowMap, coord.xy + vec2( 0.7, 0.4 ) * uFdShadowTexel ).x );
	lit += step( depth, texture2D( uFdShadowMap, coord.xy + vec2( -0.4, 0.7 ) * uFdShadowTexel ).x );
	return lit * 0.25;
}`;

const CAUSTIC = /* glsl */ `
	if ( uFdCaustic > 0.0 ) {
		float fdUp = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
		totalEmissiveRadiance += diffuseColor.rgb * vec3( 0.5, 0.85, 1.0 ) * fdCaustic( vFdWorld.xz ) * smoothstep( 0.05, 0.8, fdUp ) * 0.9 * uFdCaustic;
	}`;

// After the scene's own direct lights: her self-shadow darkens them, then the key and rim add;
// a world may also give her a rim of its own light during play.
const LIGHTS = /* glsl */ `
#if defined( RE_Direct )
	if ( uFdCloseUp > 0.0 ) {
		float fdShade = mix( 1.0, fdSelfShadow( vFdWorld, inverseTransformDirection( geometryNormal, viewMatrix ) ), uFdCloseUp );
		reflectedLight.directDiffuse *= fdShade;
		reflectedLight.directSpecular *= fdShade;
		#ifdef USE_SHEEN
			sheenSpecularDirect *= fdShade;
		#endif
		#ifdef USE_CLEARCOAT
			clearcoatSpecularDirect *= fdShade;
		#endif
		IncidentLight fdLight;
		fdLight.visible = true;
		fdLight.direction = normalize( ( viewMatrix * vec4( uFdKeyDir, 0.0 ) ).xyz );
		fdLight.color = uFdKeyColor * uFdCloseUp;
		RE_Direct( fdLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		fdLight.direction = normalize( ( viewMatrix * vec4( uFdRimDir, 0.0 ) ).xyz );
		fdLight.color = uFdRimColor * uFdCloseUp;
		RE_Direct( fdLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	if ( uFdWorldRim > 0.0 ) {
		IncidentLight fdRim;
		fdRim.visible = true;
		fdRim.direction = normalize( ( viewMatrix * vec4( uFdWorldRimDir, 0.0 ) ).xyz );
		fdRim.color = uFdWorldRimColor * uFdWorldRim;
		RE_Direct( fdRim, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#endif
#include <lights_fragment_maps>`;

function patchHeroMaterial(material) {
  if (!material?.isMeshStandardMaterial) return;
  chainShader(material, "fd-close-up", (shader) => {
    Object.assign(shader.uniforms, heroUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>" + VERTEX_PARS)
      .replace("#include <fog_vertex>", "#include <fog_vertex>" + VERTEX_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>" + FRAGMENT_PARS)
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>" + CAUSTIC,
      )
      .replace("#include <lights_fragment_maps>", LIGHTS);
  });
}

// A depth map of Nyra alone along the sun, a little over two metres across.
class HeroShadow {
  constructor() {
    this.size = 0;
    this.camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 12);
    this.camera.layers.set(HERO_LAYER);
    this.material = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    this.material.colorWrite = false;
    this.bias = new THREE.Matrix4().set(
      0.5,
      0,
      0,
      0.5,
      0,
      0.5,
      0,
      0.5,
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      0,
      1,
    );
    this.target = null;
    this.proxy = new THREE.Scene();
    this.proxy.matrixWorldAutoUpdate = false;
    this.proxy.overrideMaterial = this.material;
  }

  resize(size) {
    if (this.size === size) return;
    this.size = size;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(size, size, {
      depthTexture: new THREE.DepthTexture(size, size),
      depthBuffer: true,
    });
    this.target.texture.name = "nyra-close-up-shadow";
    heroUniforms.uFdShadowMap.value = this.target.depthTexture;
    heroUniforms.uFdShadowTexel.value = 1 / size;
  }

  // Drawn through a scene of its own that borrows her model without adopting it: three keeps
  // one light state per scene, and an empty one left on the world's scene would be read by the
  // world's next shadow pass and key its programs with no lights.
  render(renderer, model, center, toSun) {
    const camera = this.camera;
    camera.position.copy(center).addScaledVector(toSun, 6);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    heroUniforms.uFdShadowMatrix.value
      .copy(this.bias)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    const target = renderer.getRenderTarget();
    const planes = renderer.clippingPlanes;
    // The frame counter stays advanced: skeletons update once per counted frame, so the world's
    // draw that follows poses her bones again from this frame's matrices.
    const { calls, triangles, points, lines } = renderer.info.render;
    try {
      model.updateMatrixWorld(true);
      this.proxy.children = [model];
      renderer.clippingPlanes = [];
      renderer.setRenderTarget(this.target);
      renderer.clear(true, true, false);
      renderer.render(this.proxy, camera);
    } finally {
      this.proxy.children = [];
      renderer.clippingPlanes = planes;
      renderer.setRenderTarget(target);
      Object.assign(renderer.info.render, { calls, triangles, points, lines });
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const SHADOW_SIZE = { high: 1024, balanced: 1024, fast: 512 };

export class CloseUp {
  constructor(app) {
    this.app = app;
    this.amount = 0;
    this.forced = null;
    this.shadow = new HeroShadow();
    this.head = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.toSun = new THREE.Vector3();
    this.suns = new WeakMap();
    this.installed = false;
  }

  // Patches every look of every mesh before any world compiles, then marks the meshes for the map.
  install() {
    const { heroLooks, heroModel } = this.app;
    if (this.installed || !heroModel || !heroLooks?.size) return;
    this.installed = true;
    for (const look of heroLooks.values()) {
      patchHeroMaterial(look.court);
      patchHeroMaterial(look.plain);
    }
    heroModel.traverse((node) => {
      if (node.isMesh) node.layers.enable(HERO_LAYER);
    });
    this.shadow.resize(SHADOW_SIZE.high);
  }

  // Compiles the map's depth programs during preparation: a frustum over the whole world draws
  // every part of her once, hidden equipment included, whatever its skinning and morph variant.
  prepare(renderer) {
    if (!this.installed) return;
    const camera = this.shadow.camera;
    const view = [camera.left, camera.right, camera.top, camera.bottom];
    const far = camera.far;
    const hidden = [];
    this.app.heroModel.traverse((node) => {
      if (!node.visible) hidden.push(node);
    });
    for (const node of hidden) node.visible = true;
    Object.assign(camera, {
      left: -4000,
      right: 4000,
      top: 4000,
      bottom: -4000,
      far: 9000,
    });
    camera.updateProjectionMatrix();
    try {
      this.shadow.render(
        renderer,
        this.app.heroModel,
        this.center.set(0, 3000, 0),
        UP,
      );
    } finally {
      for (const node of hidden) node.visible = false;
      [camera.left, camera.right, camera.top, camera.bottom] = view;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  force(on) {
    this.forced = on === null || on === undefined ? null : !!on;
  }

  wanted(camera) {
    if (this.forced !== null) return this.forced ? 1 : 0;
    const { state } = this.app;
    const shot = state.cinematic;
    if (!shot || this.app.heroModel?.visible === false) return 0;
    const wish =
      typeof shot.closeUp === "function" ? shot.closeUp() : shot.closeUp;
    if (wish !== undefined && wish !== null) return wish ? 1 : 0;
    return camera.position.distanceTo(this.head) < 3 ? 1 : 0;
  }

  // Direction to the world's key light, from its strongest directional light.
  sunOf(world) {
    if (world === this.app.court) return this.toSun.copy(this.app.rig.sunDir);
    if (!this.suns.has(world))
      this.suns.set(
        world,
        world.scene.children
          .filter((node) => node.isDirectionalLight)
          .sort((a, b) => b.intensity - a.intensity)[0],
      );
    const sun = this.suns.get(world);
    if (!sun) return this.toSun.set(0.3, 0.8, 0.5).normalize();
    return this.toSun.copy(sun.position).sub(sun.target.position).normalize();
  }

  update(world, look, camera, dt) {
    const { heroModel, renderer } = this.app;
    if (!this.installed || !heroModel) return;
    const head = heroModel.userData.joints?.head;
    if (head) head.getWorldPosition(this.head);
    else heroModel.getWorldPosition(this.head).y += 1.6;
    const goal = this.wanted(camera);
    this.amount += (goal - this.amount) * (1 - Math.exp(-dt / 0.45));
    if (goal === 0 && this.amount < 0.002) this.amount = 0;
    heroUniforms.uFdCloseUp.value = this.amount;
    if (this.amount === 0) return;
    const toSun = this.sunOf(world);
    this.toCamera.copy(camera.position).sub(this.head).setY(0);
    if (this.toCamera.lengthSq() < 1e-6) this.toCamera.set(0, 0, 1);
    this.toCamera.normalize();
    this.side.crossVectors(UP, this.toCamera).normalize();
    // The key sits on the sun's side of the lens, so it shapes her face the way the scene does.
    const keySide = Math.sign(this.side.dot(toSun)) || -1;
    heroUniforms.uFdKeyDir.value
      .copy(this.toCamera)
      .multiplyScalar(0.85)
      .addScaledVector(this.side, 0.55 * keySide)
      .addScaledVector(UP, 0.45)
      .normalize();
    heroUniforms.uFdRimDir.value
      .copy(this.toCamera)
      .multiplyScalar(-0.8)
      .addScaledVector(this.side, -0.5 * keySide)
      .addScaledVector(UP, 0.35)
      .normalize();
    heroUniforms.uFdKeyColor.value.copy(look.key);
    heroUniforms.uFdRimColor.value.copy(look.rim);
    this.shadow.resize(SHADOW_SIZE[settings.quality] || SHADOW_SIZE.high);
    heroModel.getWorldPosition(this.center);
    this.center.y = this.head.y - 0.55;
    this.shadow.render(renderer, heroModel, this.center, toSun);
  }
}

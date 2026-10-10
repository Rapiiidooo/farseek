import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { forestRoute } from "./forest-route.js";

// Warm shafts falling through gaps in the canopy along the sun's direction, and dust motes
// glinting inside them. Both fade by their distance to the lens, so the camera can pass
// through a shaft without the near plane cutting it into a pale wedge.
const TO_SUN = new THREE.Vector3(-24, 48, -30).normalize();
// Where shafts meet the floor: [z, offset from the trail, radius at the floor].
const SHAFTS = [
  [-15, -4.5, 1.5],
  [-23, 3.5, 1.9],
  [-31, -1.2, 1.3],
  [-39, 6, 2.1],
  [-50, -5.5, 1.7],
  [-61, 2.2, 1.9],
  [-74, -3.6, 1.6],
  [-88, 4.4, 2.2],
  [-101, -2.4, 1.8],
  [-116, 5.2, 2.1],
  [-131, -4.2, 1.9],
];
const LENGTH = 30;
const MOTES = 420;

const SHAFT_VERTEX = /* glsl */ `
attribute float seed;
varying float vAlong;
varying float vAround;
varying float vSeed;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vAlong = uv.y;
  vAround = uv.x;
  vSeed = seed;
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vNormalW = normalize( mat3( modelMatrix ) * normal );
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform float uTime, uStrength;
uniform vec3 uColor;
varying float vAlong;
varying float vAround;
varying float vSeed;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 toEye = cameraPosition - vWorld;
  float distance = length( toEye );
  float facing = clamp( abs( dot( normalize( vNormalW ), toEye / max( distance, 1e-4 ) ) ), 0.0, 1.0 );
  float body = facing * facing;
  float ends = smoothstep( 0.0, 0.18, vAlong ) * ( 1.0 - smoothstep( 0.55, 1.0, vAlong ) );
  float leaves = 0.62 + 0.38 * sin( uTime * 0.45 + vSeed * 2.7 ) * sin( uTime * 0.21 + vSeed * 1.3 );
  float strands = 0.72 + 0.28 * sin( vAround * 37.7 + vSeed * 5.0 + sin( vAlong * 9.0 + uTime * 0.3 ) );
  float lens = smoothstep( 1.5, 7.0, distance ) * exp( - distance * 0.011 );
  float a = body * ends * leaves * strands * lens * uStrength;
  gl_FragColor = vec4( uColor * a, 1.0 );
}`;

const MOTE_VERTEX = /* glsl */ `
uniform float uTime, uScale;
attribute vec4 drift;
varying float vGlint;
varying float vLens;
void main() {
  vec3 p = position;
  float t = uTime * ( 0.08 + drift.w * 0.06 ) + drift.w * 40.0;
  p += vec3( sin( t * 1.3 + drift.x ), sin( t * 0.9 + drift.y ) * 0.7 - fract( t * 0.05 ) * 0.4, cos( t * 1.1 + drift.z ) ) * 0.35;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  float distance = - mv.z;
  vGlint = pow( max( 0.0, sin( uTime * ( 1.2 + drift.w * 2.0 ) + drift.x * 9.0 ) ), 6.0 ) * 0.75 + 0.25;
  vLens = smoothstep( 0.8, 3.0, distance ) * exp( - distance * 0.02 );
  gl_PointSize = clamp( ( 0.045 + drift.w * 0.03 ) * uScale / max( distance, 0.1 ), 1.0, 6.0 );
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vGlint;
varying float vLens;
void main() {
  float d = length( gl_PointCoord - 0.5 );
  float a = smoothstep( 0.5, 0.0, d ) * vGlint * vLens;
  gl_FragColor = vec4( uColor * a, 1.0 );
}`;

// `view` is the forest scenery: its clock, its ground and its scene.
export function buildForestLight(view, { renderer } = {}) {
  const time = {
    get value() {
      return view.time;
    },
  };
  const rand = seeded(53);
  const axis = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const shafts = [];
  const pieces = SHAFTS.map(([z, offset, radius], i) => {
    const x = forestRoute(z).x + offset;
    const foot = new THREE.Vector3(x, view.heightAt(x, z) - 0.6, z);
    const geometry = new THREE.CylinderGeometry(
      radius * 0.55,
      radius,
      LENGTH,
      14,
      1,
      true,
    ).translate(0, LENGTH / 2, 0);
    turn.setFromUnitVectors(up, axis.copy(TO_SUN));
    geometry.applyQuaternion(turn).translate(foot.x, foot.y, foot.z);
    geometry.setAttribute(
      "seed",
      new THREE.Float32BufferAttribute(
        new Array(geometry.attributes.position.count).fill(i + rand()),
        1,
      ),
    );
    shafts.push({ foot, radius });
    return geometry;
  });
  const shaftMaterial = new THREE.ShaderMaterial({
    name: "forest-light-shafts",
    uniforms: {
      uTime: time,
      uStrength: { value: 0.22 },
      uColor: { value: new THREE.Color(1, 0.84, 0.55) },
    },
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beams = new THREE.Mesh(mergeGeometries(pieces), shaftMaterial);
  beams.name = "forest-light-shafts";
  beams.frustumCulled = false;
  beams.renderOrder = 3;
  view.scene.add(beams);

  const position = new Float32Array(MOTES * 3),
    drift = new Float32Array(MOTES * 4);
  for (let i = 0; i < MOTES; i++) {
    const { foot, radius } = shafts[i % shafts.length];
    const along = 0.6 + rand() * 9;
    const angle = rand() * Math.PI * 2,
      r = Math.sqrt(rand()) * radius * 0.85;
    position.set(
      [
        foot.x + TO_SUN.x * along + Math.cos(angle) * r,
        foot.y + TO_SUN.y * along,
        foot.z + TO_SUN.z * along + Math.sin(angle) * r,
      ],
      i * 3,
    );
    drift.set([rand() * 6.3, rand() * 6.3, rand() * 6.3, rand()], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("drift", new THREE.BufferAttribute(drift, 4));
  const moteUniforms = {
    uTime: time,
    uScale: {
      get value() {
        return (renderer?.domElement.height ?? 800) * 0.5;
      },
    },
    uColor: { value: new THREE.Color(1.6, 1.42, 1.05) },
  };
  const motes = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      name: "forest-light-motes",
      uniforms: moteUniforms,
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  motes.name = "forest-light-motes";
  motes.frustumCulled = false;
  motes.renderOrder = 3;
  view.scene.add(motes);
  return {
    beams,
    motes,
    shafts,
    // Fast draws half the motes; the shafts are one cheap additive draw on every tier.
    setQuality(quality) {
      geometry.setDrawRange(0, quality === "fast" ? MOTES / 2 : MOTES);
    },
  };
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

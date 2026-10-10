import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// A shimmer over hot stone: the scene is resampled through rising noise whose strength grows
// with the distance read from the depth buffer, so near things and Nyra stay still.
const FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uTime, uNear, uFar, uStrength, uStart, uEnd;
varying vec2 vUv;

float hazeDistance( vec2 uv ) {
  return - perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar );
}
float hazeHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float hazeNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hazeHash( i ), hazeHash( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( hazeHash( i + vec2( 0.0, 1.0 ) ), hazeHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

void main() {
  float distance = hazeDistance( vUv );
  float amount = smoothstep( uStart, uEnd, distance ) * uStrength;
  vec2 cell = vUv * uResolution / vec2( 9.0, 5.0 );
  vec2 wobble = vec2(
    hazeNoise( cell + vec2( 0.0, - uTime * 3.1 ) ),
    hazeNoise( cell * 1.37 + vec2( 4.7, - uTime * 2.3 ) )
  ) - 0.5;
  vec2 uv = vUv + wobble * amount * 2.4 / uResolution;
  // A near surface never lends its pixels to the distance behind it, nor the reverse.
  if ( hazeDistance( uv ) < uStart ) uv = vUv;
  gl_FragColor = texture2D( tDiffuse, uv );
}`;

export class HeatHazePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      name: "HeatHaze",
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uStrength: { value: 1 },
        uStart: { value: 24 },
        uEnd: { value: 110 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  // The scene targets carry a depth texture from here on; their owner disposes them on change.
  static attachDepth(composer) {
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (target.depthTexture) continue;
      target.depthTexture = new THREE.DepthTexture(target.width, target.height);
      target.dispose();
    }
  }

  // The quad for shader preparation, which must compile even while the pass is off.
  get mesh() {
    return this.quad._mesh;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uResolution.value.set(readBuffer.width, readBuffer.height);
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uTime.value += Math.min(0.1, deltaTime || 0.016);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

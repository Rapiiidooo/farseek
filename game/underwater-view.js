import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export function underwaterPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uWater: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform float uWater; uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 ripple=vec2(sin(vUv.y*19.0+uTime*0.72),cos(vUv.x*16.0-uTime*0.57));
        vec2 uv=clamp(vUv+ripple*0.0012*uWater,vec2(0.001),vec2(0.999));
        vec4 sampleColor=texture2D(tDiffuse,uv);
        vec3 wet=sampleColor.rgb*vec3(0.66,0.91,1.04)+vec3(0.008,0.027,0.035);
        float edge=smoothstep(0.3,0.73,length(vUv-0.5));
        wet*=1.0-edge*0.28;
        gl_FragColor=vec4(mix(sampleColor.rgb,wet,uWater),sampleColor.a);
      }`,
  });
}

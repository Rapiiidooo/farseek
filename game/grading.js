import * as THREE from "three";

// Per world grades, folded into each composer's output pass so they cost no extra pass:
// an exposure before the tone curve, then lift, gamma, gain, saturation and an S-curve contrast
// on display values. Lift raises the darks towards its colour, gain scales the lights.
const NEUTRAL = {
  exposure: 1,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  saturation: 1,
  contrast: 1,
};

export const LOOKS = {
  neutral: NEUTRAL,
  court: {
    exposure: 1,
    lift: [0.014, 0.006, 0],
    gamma: [0.98, 1, 1.04],
    gain: [1.035, 1, 0.94],
    saturation: 1.06,
    contrast: 1.12,
  },
  two: {
    exposure: 0.96,
    lift: [0.016, 0.002, 0.036],
    gamma: [1.02, 1.05, 0.97],
    gain: [1.01, 0.97, 1.05],
    saturation: 1.1,
    contrast: 1.14,
  },
  three: {
    exposure: 0.97,
    lift: [0.006, 0.002, 0],
    gamma: [1.04, 1.07, 1.13],
    gain: [1.04, 1, 0.93],
    saturation: 1.07,
    contrast: 1.2,
  },
  four: {
    exposure: 1,
    lift: [0, 0.006, 0.024],
    gamma: [1.03, 1.01, 0.97],
    gain: [0.98, 1, 1.03],
    saturation: 0.97,
    contrast: 1.12,
  },
  five: {
    exposure: 1,
    lift: [0.002, 0.01, 0.002],
    gamma: [1.02, 0.99, 1.04],
    gain: [1.03, 1.02, 0.96],
    saturation: 1.03,
    contrast: 1.14,
  },
  six: {
    exposure: 1,
    lift: [0, 0.01, 0.018],
    gamma: [1.02, 0.99, 0.98],
    gain: [0.98, 1.01, 1.03],
    saturation: 1.05,
    contrast: 1.08,
  },
};

export const gradeUniforms = {
  uGradeExposure: { value: 1 },
  uGradeLift: { value: new THREE.Vector3() },
  uGradeGamma: { value: new THREE.Vector3(1, 1, 1) },
  uGradeGain: { value: new THREE.Vector3(1, 1, 1) },
  uGradeSaturation: { value: 1 },
  uGradeContrast: { value: 1 },
};

const PARS = /* glsl */ `
uniform float uGradeExposure, uGradeSaturation, uGradeContrast;
uniform vec3 uGradeLift, uGradeGamma, uGradeGain;`;

// Display values stay in [0, 1], so the pow base is clamped and the S-curve keeps both ends.
const GRADE = /* glsl */ `
	{
		vec3 graded = clamp( gl_FragColor.rgb, 0.0, 1.0 );
		graded = graded * uGradeGain + uGradeLift * ( 1.0 - graded );
		graded = pow( max( graded, vec3( 0.0 ) ), uGradeGamma );
		float gradeLuma = dot( graded, vec3( 0.2126, 0.7152, 0.0722 ) );
		graded = mix( vec3( gradeLuma ), graded, uGradeSaturation );
		graded = clamp( graded, 0.0, 1.0 );
		graded = mix( graded, graded * graded * ( 3.0 - 2.0 * graded ), uGradeContrast - 1.0 );
		gl_FragColor.rgb = clamp( graded, 0.0, 1.0 );
	}`;

const graded = new WeakSet();

// Rewrites the composer's output pass in place before its program first compiles.
export function gradeComposer(composer) {
  const pass = composer?.passes.find((p) => p.isOutputPass);
  if (!pass || graded.has(pass)) return pass;
  graded.add(pass);
  Object.assign(pass.uniforms, gradeUniforms);
  const source = pass.material.fragmentShader;
  const patched = source
    .replace(
      "uniform sampler2D tDiffuse;",
      "uniform sampler2D tDiffuse;" + PARS,
    )
    .replace(
      "// tone mapping",
      "gl_FragColor.rgb *= uGradeExposure;\n\n\t\t\t// tone mapping",
    )
    .replace(/(#ifdef SRGB_TRANSFER[\s\S]*?#endif)/, "$1\n" + GRADE);
  if (patched === source || !patched.includes("uGradeContrast - 1.0"))
    throw new Error("Output shader changed: the grade could not be installed");
  pass.material.fragmentShader = patched;
  pass.material.needsUpdate = true;
  return pass;
}

// Eases the shared grade towards a look; a cut snaps to it.
export class Grade {
  constructor() {
    this.look = {
      exposure: 1,
      lift: new THREE.Vector3(),
      gamma: new THREE.Vector3(1, 1, 1),
      gain: new THREE.Vector3(1, 1, 1),
      saturation: 1,
      contrast: 1,
    };
    this.target = new THREE.Vector3();
  }

  update(name, dt, cut = false) {
    const goal = LOOKS[name] || NEUTRAL;
    const k = cut ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.55);
    const look = this.look;
    look.exposure += (goal.exposure - look.exposure) * k;
    look.saturation += (goal.saturation - look.saturation) * k;
    look.contrast += (goal.contrast - look.contrast) * k;
    for (const key of ["lift", "gamma", "gain"])
      look[key].lerp(this.target.fromArray(goal[key]), k);
    const u = gradeUniforms;
    u.uGradeExposure.value = look.exposure;
    u.uGradeSaturation.value = look.saturation;
    u.uGradeContrast.value = look.contrast;
    u.uGradeLift.value.copy(look.lift);
    u.uGradeGamma.value.copy(look.gamma);
    u.uGradeGain.value.copy(look.gain);
  }
}

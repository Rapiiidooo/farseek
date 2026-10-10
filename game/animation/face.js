import * as THREE from "three";
import { smooth, mix } from "./math.js";

export const face = {
  updateFace(dt, hero, reduced) {
    const handles = this.face;
    if (!Object.keys(handles).length) return;
    const turn = THREE.MathUtils.clamp(this.motionTurn * 0.045, -0.16, 0.16);
    const target =
      hero.lookTarget ||
      (hero.ledge && ["hang", "climb"].includes(hero.state)
        ? {
            x: hero.ledge.hand.x,
            y: hero.ledge.top + 0.18,
            z: hero.ledge.hand.z,
          }
        : null);
    let x = 0,
      y = turn;
    if (target && this.joints.head) {
      const local = this.joints.head.worldToLocal(
        new THREE.Vector3(target.x, target.y, target.z),
      );
      y = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.28, 0.28);
      x = THREE.MathUtils.clamp(
        -Math.atan2(local.y, Math.hypot(local.x, local.z)),
        -0.2,
        0.2,
      );
    } else if (this.gaitSpeed < 0.1 && !hero.swimming) {
      const dwell = Math.floor(this.time / 2.7);
      y += Math.sin(dwell * 2.399) * 0.065;
      x = Math.sin(dwell * 1.73) * 0.027;
    }
    const gx = this.gaze.x.step(x, dt, 9, 1),
      gy = this.gaze.y.step(y, dt, 11, 1);
    const blink = this.blink;
    if (this.time >= blink.next) {
      blink.start = this.time;
      blink.count++;
      blink.next = this.time + 2.7 + (Math.sin(blink.count * 2.17) + 1) * 1.1;
    }
    const t = this.time - blink.start;
    blink.value = t < 0.06 ? smooth(0, 0.06, t) : 1 - smooth(0.08, 0.21, t);
    if (t > 0.21) blink.value = 0;
    for (const side of ["left", "right"]) {
      const eye = handles[side + "Eye"];
      if (eye) {
        eye.node.rotation.x = eye.rot.x + gx;
        eye.node.rotation.y = eye.rot.y + gy;
      }
      for (const suffix of ["UpperLid", "LowerLid"]) {
        const lid = handles[side + suffix];
        if (!lid) continue;
        const influence = lid.node.morphTargetDictionary?.blink;
        if (influence !== undefined && lid.node.morphTargetInfluences)
          lid.node.morphTargetInfluences[influence] = blink.value;
        else
          lid.node.rotation.x =
            lid.rot.x + blink.value * (suffix === "UpperLid" ? 0.62 : -0.18);
      }
    }
    if (handles.jaw)
      handles.jaw.node.rotation.x =
        handles.jaw.rot.x +
        Math.max(0, Math.sin(this.breathPhase)) * 0.012 * this.effort;
    const skin = handles.skin?.node;
    if (skin?.morphTargetInfluences) {
      const effort = skin.morphTargetDictionary?.effort,
        breathe = skin.morphTargetDictionary?.breathe;
      if (effort !== undefined)
        skin.morphTargetInfluences[effort] = this.effort * 0.4;
      if (breathe !== undefined)
        skin.morphTargetInfluences[breathe] =
          Math.max(0, Math.sin(this.breathPhase)) * mix(0.06, 0.3, this.effort);
    }
  },
};

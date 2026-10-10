import * as THREE from "three";
import { smooth } from "./math.js";

export const secondary = {
  updateSecondary(dt, hero, reduced) {
    const running = smooth(1.5, 5, this.gaitSpeed),
      water = hero.swimming ? 1 : 0;
    for (const [name, handle] of Object.entries(this.secondary)) {
      const hair = name.toLowerCase().includes("hair"),
        bag = name === "satchel";
      const scale = reduced ? 0.3 : 1;
      const x =
        THREE.MathUtils.clamp(
          this.motionAccel * (hair ? -0.012 : -0.004) +
            Math.sin(this.phase * 2 - 0.55) * running * (hair ? 0.055 : 0.018) +
            water * Math.sin(this.swimPhase - 0.4) * 0.045,
          -0.17,
          0.17,
        ) * scale;
      const z =
        THREE.MathUtils.clamp(
          -this.motionTurn * (hair ? 0.035 : bag ? 0.023 : 0.009) +
            Math.sin(this.phase - 0.3) * running * (bag ? 0.05 : 0.013),
          -0.2,
          0.2,
        ) * scale;
      const frequency = hair ? 2.4 : bag ? 3 : 4.5;
      const swayMorph = handle.node.morphTargetDictionary?.sway,
        liftMorph = handle.node.morphTargetDictionary?.lift;
      if (
        handle.node.morphTargetInfluences &&
        (swayMorph !== undefined || liftMorph !== undefined)
      ) {
        const sway = handle.springs[2].step(z, dt, frequency, 0.7);
        const lift = handle.springs[1].step(
          THREE.MathUtils.clamp(
            (this.gaitSpeed / 5) * 0.65 +
              water * 0.2 +
              this.motionAccel * 0.025,
            0,
            1,
          ),
          dt,
          frequency,
          0.85,
        );
        if (swayMorph !== undefined)
          handle.node.morphTargetInfluences[swayMorph] = THREE.MathUtils.clamp(
            sway / 0.2,
            -1,
            1,
          );
        if (liftMorph !== undefined)
          handle.node.morphTargetInfluences[liftMorph] = lift * scale;
        continue;
      }
      handle.node.rotation.x =
        handle.rot.x + handle.springs[0].step(x, dt, frequency, 0.7);
      handle.node.rotation.z =
        handle.rot.z + handle.springs[2].step(z, dt, frequency, 0.7);
      handle.node.position.y =
        handle.pos.y +
        Math.max(0, -Math.sin(this.phase * 2)) *
          running *
          (bag ? 0.008 : 0.003) *
          scale;
    }
  },

  updateScarf(dt, hero, turnRate) {
    const j = this.joints.scarfTail;
    if (!j) return;
    if (!this.scarfRest) this.scarfRest = j.rotation.clone();
    const gust =
      Math.sin(this.time * 2.3) * 0.5 + Math.sin(this.time * 5.1 + 1) * 0.3;
    const lift =
      hero.state === "hang"
        ? -0.1
        : 0.2 + hero.speed * 0.16 + Math.max(0, -hero.vel.y) * 0.07;
    const tx = Math.min(1.35, lift + gust * 0.12),
      tz = THREE.MathUtils.clamp(-turnRate * 0.08, -0.6, 0.6) + gust * 0.08;
    const s = this.scarf;
    s.vx += ((tx - s.x) * 60 - s.vx * 7) * dt;
    s.vz += ((tz - s.z) * 60 - s.vz * 7) * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    j.rotation.x = this.scarfRest.x + s.x;
    j.rotation.z = this.scarfRest.z + s.z;
  },
};

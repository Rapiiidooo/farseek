// What the music and the air answer to, read from the running game: nearby hostile creatures,
// an active boss and its phase, the air reserve, cinematics, crossings and local sources.

const NEAR = 40;

export function readScene(app, hero, gates) {
  const state = app?.state;
  const current = app?.worlds?.current;
  const scene = {
    where: state?.where,
    mode: state?.mode,
    cinematic: !!state?.cinematic,
    crossing: !!state?.crossing,
    danger: 0,
    phase: 0,
    hostile: 0,
    breath: null,
    gates: [],
    vents: [],
  };
  if (!current || !hero?.pos) return scene;
  if (state?.mode === "play") {
    let targets = [];
    try {
      targets = current.combatTargets?.() || [];
    } catch {
      targets = [];
    }
    for (const target of targets) {
      if (!target?.hostile || target.defeated) continue;
      if (target.hp <= 0 || target.alive?.() === false) continue;
      const p = target.pos;
      const d = p ? Math.hypot(p.x - hero.pos.x, p.z - hero.pos.z) : 0;
      if (d > NEAR) continue;
      scene.hostile++;
      scene.danger = Math.max(scene.danger, 0.72);
      if (target.boss)
        scene.phase = Math.max(
          scene.phase,
          target.phaseNumber ??
            (target.maxHp && target.hp <= target.maxHp / 2 ? 2 : 1),
        );
    }
    if (scene.hostile > 1)
      scene.danger = Math.min(1, scene.danger + 0.06 * (scene.hostile - 1));
    const boss = current.boss;
    if (boss?.active)
      scene.phase = Math.max(scene.phase, Number(boss.phase) || 1);
    // Each boss phase raises the tension: the second brings the full pattern.
    if (scene.phase)
      scene.danger = Math.max(
        scene.danger,
        0.62 + 0.12 * Math.min(3, scene.phase),
      );
  }
  const breath = current.drowned?.breath ?? current.breath;
  if (breath) {
    scene.breath = { ratio: breath.ratio, submerged: !!breath.submerged };
    if (breath.submerged && breath.ratio < 0.4)
      scene.danger = Math.max(
        scene.danger,
        0.3 + 0.45 * (1 - breath.ratio / 0.4),
      );
  }
  scene.vents = current.drowned?.vents || [];
  for (const gate of gates || [])
    if (
      gate.isOpen &&
      gate.center &&
      (gate.scene === current.scene ||
        (gate.world && gate.world === hero.world))
    )
      scene.gates.push(gate);
  return scene;
}

export class HeroWeather {
  constructor(looks) {
    const materials = new Set(
      [...looks.values()].flatMap((look) => [look.court, look.plain]),
    );
    this.materials = [...materials]
      .filter(
        (material) =>
          material.name.startsWith("explorer") &&
          material.name !== "explorer-eyes",
      )
      .map((material) => ({
        material,
        color: material.color.clone(),
        roughness: material.roughness,
        clearcoat: material.clearcoat,
        normalScale: material.normalScale?.clone(),
        skin: material.name === "explorer-skin",
        cloth: material.name === "explorer.cloth",
      }));
    this.wetness = 0;
  }

  update(dt, hero) {
    const submerged = hero.swimming || hero.state === "swim";
    this.wetness +=
      ((submerged ? 1 : 0) - this.wetness) *
      (1 - Math.exp(-dt * (submerged ? 3 : 0.075)));
    for (const look of this.materials) {
      const { material, skin, cloth } = look;
      material.color
        .copy(look.color)
        .multiplyScalar(
          1 - this.wetness * (skin ? 0.035 : cloth ? 0.21 : 0.12),
        );
      material.roughness =
        look.roughness * (1 - this.wetness * (cloth ? 0.22 : 0.42));
      if (skin) material.clearcoat = look.clearcoat + this.wetness * 0.22;
      if (look.normalScale)
        material.normalScale
          .copy(look.normalScale)
          .multiplyScalar(1 - this.wetness * 0.15);
    }
  }
}

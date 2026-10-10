import { addClimbSurface } from "./wall-climb.js";
import { Curtain, curtainMaterials } from "./frost-climbs.js";
import { ivyFaces } from "./forest-climbs.js";
import { ClimbChips } from "./climb-chips.js";

// The vault's climbing faces, made as the frozen reach and the wildwood make theirs: a scarred
// fall of ice for Mira's axes and thick ivy for bare hands. Each is a surface in `world.walls`
// over a solid face the caller builds.
const IVY = 0.06;

export class VaultClimbs {
  constructor(vault) {
    this.vault = vault;
    this.scene = vault.scene;
    this.world = vault.world;
    this.chips = {
      ice: new ClimbChips(this.scene, "ice"),
      vine: new ClimbChips(this.scene, "vine"),
    };
  }

  // A fall of ice `width` across and `top` high, its foot's middle at x, z on a plane facing n.
  ice({ id, x, z, n, width, top, seed = 31 }) {
    this.mat ??= curtainMaterials();
    const curtain = new Curtain(this, id, seed);
    curtain.patch({ width, height: top, lip: 0.1 });
    curtain.scars({ width, from: 0.35, to: top - 0.3 });
    curtain.place({ x, z }, n);
    return addClimbSurface(this.world, {
      kind: "ice",
      id,
      x,
      z,
      nx: n.x,
      nz: n.z,
      width: width - 0.3,
      bottom: -0.2,
      top,
    });
  }

  // Ivy up a face whose plane passes through x, z facing n.
  async ivy({ id, x, z, n, width, top, seed = 5 }) {
    const surface = addClimbSurface(this.world, {
      kind: "vine",
      id,
      x: x + n.x * IVY,
      z: z + n.z * IVY,
      nx: n.x,
      nz: n.z,
      width: width - 0.3,
      bottom: -0.3,
      top,
    });
    const vine = await this.vault.assets.make("wall_vine", {
      keepHierarchy: true,
    });
    if (vine)
      ivyFaces(this.scene, vine, `vault-${id}`, [
        { s: surface, rise: top - surface.y0, seed },
      ]);
    return surface;
  }

  update(dt, hero) {
    for (const strike of hero?.wallStrikes?.splice(0) ?? [])
      this.chips[strike.kind]?.burst(strike);
    this.chips.ice.update(dt);
    this.chips.vine.update(dt);
  }

  prepareForCompile(on) {
    this.chips.ice.prepareForCompile(on);
    this.chips.vine.prepareForCompile(on);
  }

  reset() {
    this.chips.ice.hide();
    this.chips.vine.hide();
  }
}

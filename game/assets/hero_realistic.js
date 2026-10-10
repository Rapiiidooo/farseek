import buildExplorer from "./hero_explorer.js";
import { attachRealisticOutfit } from "../hero-outfit.js";
import { attachRealisticFace } from "../hero-face.js";
import { attachAnatomicalBody } from "../hero-body.js";
import { attachRefinedBoots } from "../hero-boots.js";
import { attachRefinedGloves } from "../hero-gloves.js";
import { attachRefinedLegs } from "../hero-legs.js";
import { attachModernWarrior } from "../hero-warrior.js";
import { attachHairContact } from "../hero-hair-contact.js";
import { attachGarmentDetail } from "../hero-tailoring.js";
import { shapeCombatBoots } from "../hero-sculpt.js";
import { attachMoonNecklace } from "../hero-jewelry.js";
import { preserveExplorerDeclarations } from "../explorer-declarations.js";
import { fitSession } from "../fit-cache.js";

export default function buildRealisticExplorer(THREE) {
  return fitSession("hero_realistic", () => buildFittedExplorer(THREE));
}

function buildFittedExplorer(THREE) {
  const group = attachRealisticOutfit(THREE, buildExplorer(THREE));
  attachRefinedLegs(THREE, group);
  attachAnatomicalBody(THREE, group, { contoured: true });
  attachRefinedBoots(THREE, group);
  attachRefinedGloves(THREE, group);
  attachRealisticFace(THREE, group, { friendly: true });
  const arms = group.getObjectByName("explorerBareArms");
  if (arms) {
    arms.material = group.userData.face.skin.material.clone();
    arms.material.roughness = 0.59;
    arms.material.vertexColors = true;
  }
  attachModernWarrior(THREE, group);
  shapeCombatBoots(THREE, group);
  attachGarmentDetail(THREE, group);
  attachMoonNecklace(THREE, group);
  attachHairContact(THREE, group);
  group.userData.appearance.version = 18;
  group.userData.appearance.name = "Nyra Varen";
  return preserveExplorerDeclarations(THREE, group);
}

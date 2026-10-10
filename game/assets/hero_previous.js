import buildExplorer from "./hero_explorer.js";
import { attachRealisticOutfit } from "../hero-outfit.js";
import { attachRealisticFace } from "../hero-face.js";
import { attachAnatomicalBody } from "../hero-body-previous.js";
import { attachRefinedBoots } from "../hero-boots.js";
import { attachRefinedGloves } from "../hero-gloves.js";
import { attachRefinedLegs } from "../hero-legs.js";

export default function buildPreviousExplorer(THREE) {
  const group = attachRealisticOutfit(THREE, buildExplorer(THREE));
  attachRefinedLegs(THREE, group);
  attachAnatomicalBody(THREE, group);
  attachRefinedBoots(THREE, group);
  attachRefinedGloves(THREE, group);
  return attachRealisticFace(THREE, group);
}

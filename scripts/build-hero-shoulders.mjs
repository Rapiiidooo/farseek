import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const source = fs.readFileSync(new URL("game/assets/explorer/body.js", root));
const body = JSON.parse(
  source.toString().trim().slice("export default ".length, -1),
);
const fractions = body.supportFractions;
assert.deepEqual(fractions, [0.2, 0.4, 0.6, 0.8]);
for (const side of ["left", "right"])
  fractions.forEach((_, i) =>
    assert(body.joints.includes(side + "ShoulderSkin" + (i + 1))),
  );
const output = {
  schema: 2,
  method: "distributed-anatomical",
  bodySha256: crypto.createHash("sha256").update(source).digest("hex"),
  vertices: Buffer.from(body.position, "base64").length / 12,
  joints: body.joints,
  supportFractions: fractions,
};
const target = new URL("game/assets/explorer/shoulders.js", root);
fs.writeFileSync(target, "export default " + JSON.stringify(output) + ";\n");
const report = {
  ...output,
  bytes: fs.statSync(target).size,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(target))
    .digest("hex"),
  previousMorphGenerator:
    "receipts/verification-modern-warrior/revision-8/scripts/build-hero-shoulders.mjs",
};
const receipt = new URL("receipts/verification-arms-detail/", root);
fs.mkdirSync(receipt, { recursive: true });
fs.writeFileSync(
  new URL("supports.json", receipt),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));

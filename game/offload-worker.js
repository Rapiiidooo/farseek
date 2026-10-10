// Module worker for pure building work: import-free asset factories and detail pixel loops.
// Workers cannot read the page's import map, so three.js comes from its vendored path.
import * as THREE from "./vendor/three.module.js";
import { installObjectCopy } from "./object-copy-patch.js";
import { encodeTree, Unsupported } from "./offload-codec.js";
import { detailPixels, mineralPixels } from "./detail-pixels.js";

installObjectCopy(THREE);

const jobs = {
  async factory({ url, options }) {
    const module = await import(url);
    const build = module.default || module.build || module.create;
    if (typeof build !== "function") throw new Unsupported("no factory");
    const { payload, transfer } = encodeTree(THREE, build(THREE, options));
    return { result: payload, transfer };
  },
  detail({ output, kind, size, source }) {
    const result = detailPixels(output, kind, size, source);
    return { result, transfer: [result.pixels.buffer] };
  },
  mineral({ source, size }) {
    const result = mineralPixels(source, size);
    return {
      result,
      transfer: [result.normal.buffer, result.roughness.buffer],
    };
  },
};

self.onmessage = async ({ data: { id, kind, input } }) => {
  try {
    const { result, transfer } = await jobs[kind](input);
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};

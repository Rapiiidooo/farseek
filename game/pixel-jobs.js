// Texture images whose pixels are produced on demand: by a worker once the game installs a
// scheduler, otherwise here, at the first read of `data`.
let scheduler = null;

export function setPixelScheduler(schedule) {
  scheduler = schedule;
}

// Textures every realm builds identically, so a worker's tree can name them instead of copying.
const shared = new Map();

export function shareTextures(name, textures) {
  shared.set(name, textures);
}

export function sharedTexture(THREE, key) {
  const [name, slot] = key.split(":");
  return shared.get(name)?.(THREE)?.[slot] ?? null;
}

export function deferPixels(kind, input, compute) {
  if (scheduler) return scheduler(kind, input, compute);
  let result = null;
  return (name, size) => ({
    width: size,
    height: size,
    get data() {
      return (result ??= compute())[name];
    },
  });
}

// Pixel loops behind the shared detail maps, free of three.js so a worker can run them as well.
const TAU = Math.PI * 2;
const heightFields = new Map();

function field(u, v, frequency) {
  const x = u * frequency,
    y = v * frequency,
    ix = Math.floor(x),
    iy = Math.floor(y),
    sx = (x - ix) ** 2 * (3 - 2 * (x - ix)),
    sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
  const hash = (a, b) => {
    const px = ((a % frequency) + frequency) % frequency,
      py = ((b % frequency) + frequency) % frequency;
    let value = (Math.imul(px, 374761393) + Math.imul(py, 668265263)) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), sx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
    sy,
  );
}

function height(kind, u, v) {
  const grain = field(u, v, 192);
  if (kind === "dentine") return grain * 0.03;
  if (kind === "metal")
    return 0.065 * Math.sin(v * TAU * 91 + field(u, v, 8) * 2) + 0.022 * grain;
  if (kind === "fabric")
    return (
      0.12 * Math.sin(u * TAU * 48) * Math.sin(v * TAU * 48) +
      0.018 * Math.cos((u + v) * TAU * 24) +
      0.025 * grain
    );
  if (kind === "timber")
    return (
      0.16 *
        Math.sin(
          u * TAU * 38 + Math.sin(v * TAU * 2) * 1.6 + field(u, v, 4) * 2.2,
        ) +
      0.05 * field(u, v, 48) +
      0.035 * grain
    );
  if (kind === "leaf")
    return (
      0.17 * Math.cos(u * TAU * 4) +
      0.07 * Math.cos((v * 12 + Math.abs(Math.sin(u * TAU * 4))) * TAU)
    );
  if (kind === "feather")
    return (
      0.16 * Math.cos(u * TAU * 7) +
      0.08 * Math.cos((v * 28 + Math.abs(Math.sin(u * TAU * 7))) * TAU)
    );
  if (kind === "fur")
    return (
      0.12 * Math.sin(u * TAU * 38 + Math.sin(v * TAU * 4) * 2) + 0.04 * grain
    );
  if (kind === "boar-coat")
    return (
      0.09 * Math.sin(u * TAU * 92 + Math.sin(v * TAU * 6) * 1.2) +
      0.035 * field(u, v, 64) +
      0.018 * grain
    );
  if (kind === "scales") {
    const row = Math.floor(v * 18);
    const x = ((u * 18 + (row % 2) * 0.5) % 1) - 0.5;
    const y = (v * 18) % 1;
    return 0.18 * Math.cos(Math.hypot(x, y * 0.65) * TAU) + 0.025 * grain;
  }
  if (kind === "ice")
    return 0.1 * Math.sin((u * 9 + v * 11) * TAU) ** 14 + 0.025 * grain;
  if (kind === "paper") return 0.025 * Math.sin(u * TAU * 42) + 0.035 * grain;
  if (kind === "rubber")
    return (
      0.085 * grain + 0.07 * Math.sin(u * TAU * 24) * Math.sin(v * TAU * 24)
    );
  if (kind === "coral")
    return (
      0.2 * Math.cos((u * 14 + Math.sin(v * TAU * 8) * 0.32) * TAU) +
      0.035 * grain
    );
  if (kind === "ceramic") return 0.045 * Math.cos(v * TAU * 24) + 0.09 * grain;
  return (
    0.09 * grain +
    0.075 * field(u, v, 24) +
    0.035 * Math.sin((u * 7 + v * 2) * TAU + field(u, v, 4) * 2) -
    0.28 * Math.max(0, 0.28 - field(u, v, 96))
  );
}

function fields(kind, size) {
  const fieldKey = `${kind}:${size}`;
  if (!heightFields.has(fieldKey)) {
    const field = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        field[y * size + x] = height(kind, x / size, y / size);
    heightFields.set(fieldKey, field);
  }
  const heights = heightFields.get(fieldKey);
  if (!heightFields.has(`grain:${size}`)) {
    const grain = new Float64Array(size * size),
      macro = new Float64Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        grain[y * size + x] = field(x / size, y / size, 96);
        macro[y * size + x] = field(x / size, y / size, 8);
      }
    heightFields.set(`grain:${size}`, { grain, macro });
  }
  return { heights, grains: heightFields.get(`grain:${size}`) };
}

// Source texel offsets per row and column, so the per-pixel lookups below skip their divisions.
function lookup(image, size) {
  if (!image) return null;
  const columns = new Int32Array(size),
    rows = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    columns[i] = Math.floor((i * image.width) / size);
    rows[i] = Math.floor((i * image.height) / size) * image.width;
  }
  return { data: image.data, columns, rows };
}

const sample = (image, x, y, channel) =>
  image?.data[(image.rows[y] + image.columns[x]) * 4 + channel];

// One detail map of a substance (normal, roughness or albedo) over the readable source map it
// refines; each depends on that source alone, so equal sources share their pixels.
export function detailPixels(output, kind, size, source) {
  const { heights, grains } = fields(kind, size);
  const image = lookup(source, size);
  const at = (x, y) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      if (output === "normal") {
        const dx = at(x + 1, y) - at(x - 1, y),
          dy = at(x, y + 1) - at(x, y - 1);
        const nx = (image ? sample(image, x, y, 0) / 127.5 - 1 : 0) - dx,
          ny = (image ? sample(image, x, y, 1) / 127.5 - 1 : 0) - dy,
          nz = image ? sample(image, x, y, 2) / 127.5 - 1 : 1,
          length = Math.hypot(nx, ny, nz) || 1;
        pixels[index] = ((nx / length) * 0.5 + 0.5) * 255;
        pixels[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
        pixels[index + 2] = ((nz / length) * 0.5 + 0.5) * 255;
        pixels[index + 3] = 255;
        continue;
      }
      const grain = grains.grain[y * size + x],
        macro = grains.macro[y * size + x];
      if (output === "roughness") {
        const variation = 0.83 + 0.13 * grain + 0.035 * macro - 0.07 * at(x, y);
        const r = image
          ? (sample(image, x, y, 1) / 255) * 0.7 + variation * 0.3
          : variation;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 255 * r;
        pixels[index + 3] = 255;
        continue;
      }
      const tint =
        0.95 + 0.045 * macro + 0.022 * grain - 0.04 * Math.max(0, 0.2 - grain);
      for (let channel = 0; channel < 3; channel++)
        pixels[index + channel] = Math.min(
          255,
          (sample(image, x, y, channel) ?? 255) * tint,
        );
      pixels[index + 3] = sample(image, x, y, 3) ?? 255;
    }
  return { pixels };
}

export function meanLinearColor(source) {
  const lookup = Float64Array.from({ length: 256 }, (_, index) => {
    const value = index / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const result = [0, 0, 0];
  for (let i = 0; i < source.data.length; i += 4)
    for (let channel = 0; channel < 3; channel++)
      result[channel] += lookup[source.data[i + channel]];
  return result.map((value) => value / (source.width * source.height));
}

export function mineralPixels(source, size = 512) {
  const heights = new Float32Array(size * size);
  const scaleX = source.width / size,
    scaleY = source.height / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index =
        (Math.min(source.height - 1, Math.floor((y + 0.5) * scaleY)) *
          source.width +
          Math.min(source.width - 1, Math.floor((x + 0.5) * scaleX))) *
        4;
      heights[y * size + x] =
        (source.data[index] * 0.2126 +
          source.data[index + 1] * 0.7152 +
          source.data[index + 2] * 0.0722) /
        255;
    }
  const at = (x, y) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  const normal = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 2.6;
      const ny = (at(x, y - 1) - at(x, y + 1)) * 2.6;
      const length = Math.hypot(nx, ny, 1);
      const index = (y * size + x) * 4;
      normal.set(
        [
          ((nx / length) * 0.5 + 0.5) * 255,
          ((ny / length) * 0.5 + 0.5) * 255,
          ((1 / length) * 0.5 + 0.5) * 255,
          255,
        ],
        index,
      );
      const r = (0.93 - 0.16 * at(x, y)) * 255;
      roughness.set([r, r, r, 255], index);
    }
  return { normal, roughness };
}

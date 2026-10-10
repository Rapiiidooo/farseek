// PNG decoding and encoding, box downscaling and the perceptual comparison of two views.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes an 8-bit, non-interlaced greyscale, RGB or RGBA PNG into RGBA pixels. */
export function decodePNG(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG");
  let offset = 8,
    width = 0,
    height = 0,
    type = 0,
    depth = 0,
    interlace = 0;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const kind = buffer.toString("latin1", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === "IDAT") data.push(body);
    else if (kind === "IEND") break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace)
    throw new Error(`Unsupported PNG: type ${type}, depth ${depth}`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= channels ? up[x - channels] : 0;
      const value = line[x];
      out[x] =
        filter === 0
          ? value
          : filter === 1
            ? value + a
            : filter === 2
              ? value + b
              : filter === 3
                ? value + ((a + b) >> 1)
                : value + paeth(a, b, c);
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const grey = channels <= 2;
    pixels[i * 4] = rows[j];
    pixels[i * 4 + 1] = grey ? rows[j] : rows[j + 1];
    pixels[i * 4 + 2] = grey ? rows[j] : rows[j + 2];
    pixels[i * 4 + 3] =
      channels === 4 ? rows[j + 3] : channels === 2 ? rows[j + 1] : 255;
  }
  return { width, height, pixels };
}

function chunk(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** Encodes RGBA pixels as an opaque 8-bit RGB PNG. */
export function encodePNG({ width, height, pixels }) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const line = new Uint8Array(stride),
    previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      for (let k = 0; k < 3; k++)
        line[x * 3 + k] = pixels[(y * width + x) * 4 + k];
    // Up filtering on every row but the first compresses rendered scenes well enough.
    const filter = y ? 2 : 1;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++)
      raw[y * (stride + 1) + 1 + x] =
        filter === 2
          ? line[x] - previous[x]
          : line[x] - (x >= 3 ? line[x - 3] : 0);
    previous.set(line);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Averages pixels over factor x factor blocks. */
export function downscale(image, factor) {
  if (factor === 1) return image;
  const width = Math.floor(image.width / factor),
    height = Math.floor(image.height / factor);
  const pixels = new Uint8Array(width * height * 4);
  const area = factor * factor;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let k = 0; k < 4; k++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++)
          for (let dx = 0; dx < factor; dx++)
            sum +=
              image.pixels[
                ((y * factor + dy) * image.width + x * factor + dx) * 4 + k
              ];
        pixels[(y * width + x) * 4 + k] = Math.round(sum / area);
      }
  return { width, height, pixels };
}

function luma(image) {
  const out = new Float32Array(image.width * image.height);
  for (let i = 0; i < out.length; i++)
    out[i] =
      0.2126 * image.pixels[i * 4] +
      0.7152 * image.pixels[i * 4 + 1] +
      0.0722 * image.pixels[i * 4 + 2];
  return out;
}

function lab(r, g, b) {
  const linear = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = linear(r),
    G = linear(g),
    B = linear(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const WINDOW = 8;
const STEP = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/**
 * Compares two images of equal size: mean structural similarity of luma over 8 px windows,
 * the same per tile of a cols x rows grid, and the mean CIELAB colour distance per tile.
 */
export function compare(a, b, { cols = 16, rows = 9 } = {}) {
  if (a.width !== b.width || a.height !== b.height)
    throw new Error(
      `Image sizes differ: ${a.width}x${a.height} and ${b.width}x${b.height}`,
    );
  const { width, height } = a;
  const la = luma(a),
    lb = luma(b);
  const tileSsim = new Float64Array(cols * rows),
    tileWindows = new Float64Array(cols * rows);
  let total = 0,
    windows = 0;
  const map = [];
  for (let y = 0; y + WINDOW <= height; y += STEP) {
    for (let x = 0; x + WINDOW <= width; x += STEP) {
      let sa = 0,
        sb = 0,
        saa = 0,
        sbb = 0,
        sab = 0;
      for (let dy = 0; dy < WINDOW; dy++)
        for (let dx = 0; dx < WINDOW; dx++) {
          const i = (y + dy) * width + x + dx;
          const va = la[i],
            vb = lb[i];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      const n = WINDOW * WINDOW;
      const ma = sa / n,
        mb = sb / n;
      const va = saa / n - ma * ma,
        vb = sbb / n - mb * mb,
        cov = sab / n - ma * mb;
      const s =
        ((2 * ma * mb + C1) * (2 * cov + C2)) /
        ((ma * ma + mb * mb + C1) * (va + vb + C2));
      total += s;
      windows++;
      const tile =
        Math.min(rows - 1, Math.floor(((y + WINDOW / 2) / height) * rows)) *
          cols +
        Math.min(cols - 1, Math.floor(((x + WINDOW / 2) / width) * cols));
      tileSsim[tile] += s;
      tileWindows[tile]++;
      map.push([x, y, s]);
    }
  }
  const tileColor = new Float64Array(cols * rows),
    tilePixels = new Float64Array(cols * rows);
  let colorTotal = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const p = lab(a.pixels[i], a.pixels[i + 1], a.pixels[i + 2]);
      const q = lab(b.pixels[i], b.pixels[i + 1], b.pixels[i + 2]);
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const tile =
        Math.min(rows - 1, Math.floor((y / height) * rows)) * cols +
        Math.min(cols - 1, Math.floor((x / width) * cols));
      tileColor[tile] += d;
      tilePixels[tile]++;
      colorTotal += d;
    }
  const tiles = [];
  for (let i = 0; i < cols * rows; i++)
    tiles.push({
      col: i % cols,
      row: Math.floor(i / cols),
      ssim: tileWindows[i] ? tileSsim[i] / tileWindows[i] : 1,
      deltaE: tilePixels[i] ? tileColor[i] / tilePixels[i] : 0,
    });
  const worstSsim = tiles.reduce((m, t) => (t.ssim < m.ssim ? t : m));
  const worstColor = tiles.reduce((m, t) => (t.deltaE > m.deltaE ? t : m));
  return {
    ssim: total / windows,
    tileSsim: worstSsim.ssim,
    tileDeltaE: worstColor.deltaE,
    deltaE: colorTotal / (width * height),
    worstTile: [worstSsim.col, worstSsim.row],
    tiles,
    cols,
    rows,
    map,
  };
}

/** Renders the comparison as the current image darkened, with dissimilar windows in red. */
export function heatmap(
  current,
  result,
  { tileSsim = 1, tileDeltaE = Infinity } = {},
) {
  const { width, height } = current;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const l =
      0.2126 * current.pixels[i * 4] +
      0.7152 * current.pixels[i * 4 + 1] +
      0.0722 * current.pixels[i * 4 + 2];
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = l * 0.45;
    pixels[i * 4 + 3] = 255;
  }
  for (const [x, y, s] of result.map) {
    const heat = Math.max(0, Math.min(1, (1 - s) * 2.5));
    if (heat < 0.04) continue;
    for (let dy = 0; dy < STEP; dy++)
      for (let dx = 0; dx < STEP; dx++) {
        const i = ((y + 2 + dy) * width + x + 2 + dx) * 4;
        if (i >= pixels.length) continue;
        pixels[i] = Math.max(pixels[i], 255 * heat);
        pixels[i + 1] *= 1 - heat * 0.6;
        pixels[i + 2] *= 1 - heat * 0.6;
      }
  }
  const tw = width / result.cols,
    th = height / result.rows;
  for (const tile of result.tiles) {
    if (tile.ssim >= tileSsim && tile.deltaE <= tileDeltaE) continue;
    const x0 = Math.round(tile.col * tw),
      y0 = Math.round(tile.row * th),
      x1 = Math.round((tile.col + 1) * tw) - 1,
      y1 = Math.round((tile.row + 1) * th) - 1;
    for (let x = x0; x <= x1; x++)
      for (const y of [y0, y1]) pixels.set([255, 220, 0], (y * width + x) * 4);
    for (let y = y0; y <= y1; y++)
      for (const x of [x0, x1]) pixels.set([255, 220, 0], (y * width + x) * 4);
  }
  return { width, height, pixels };
}

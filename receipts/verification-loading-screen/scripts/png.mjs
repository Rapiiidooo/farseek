// A minimal decoder for the 8-bit, non-interlaced RGB and RGBA PNGs Chrome's screencast sends.
import { inflateSync } from "node:zlib";

export const PNG = {
  decode(buffer) {
    let offset = 8;
    let width, height, channels;
    const chunks = [];
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        channels = { 2: 3, 6: 4 }[data[9]];
        if (data[8] !== 8 || !channels || data[12]) throw new Error("PNG");
      } else if (type === "IDAT") chunks.push(data);
      offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(chunks));
    const stride = width * channels;
    const pixels = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? pixels[y * stride + x - channels] : 0;
        const b = y ? pixels[(y - 1) * stride + x] : 0;
        const c =
          y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        const predicted = [0, a, b, (a + b) >> 1, paeth][filter];
        pixels[y * stride + x] = (line[x] + predicted) & 255;
      }
    }
    return {
      width,
      height,
      pixel: (x, y) => {
        const at = y * stride + x * channels;
        return [pixels[at], pixels[at + 1], pixels[at + 2]];
      },
    };
  },
};

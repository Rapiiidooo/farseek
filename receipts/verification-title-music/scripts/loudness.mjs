// ITU-R BS.1770-4 loudness approximation: K weighting, 400 ms gated blocks, true peak by 4x
// polyphase interpolation. Coefficients are derived for any sample rate.
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float64Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

export function kWeight(x, fs) {
  const G = 3.99984385397,
    Q1 = 0.7071752369554193,
    f1 = 1681.974450955533;
  const K1 = Math.tan((Math.PI * f1) / fs),
    Vh = Math.pow(10, G / 20),
    Vb = Math.pow(Vh, 0.499666774155),
    n1 = 1 + K1 / Q1 + K1 * K1;
  const shelf = biquad(
    x,
    (Vh + (Vb * K1) / Q1 + K1 * K1) / n1,
    (2 * (K1 * K1 - Vh)) / n1,
    (Vh - (Vb * K1) / Q1 + K1 * K1) / n1,
    (2 * (K1 * K1 - 1)) / n1,
    (1 - K1 / Q1 + K1 * K1) / n1,
  );
  const Q2 = 0.5003270373238773,
    f2 = 38.13547087602444;
  const K2 = Math.tan((Math.PI * f2) / fs),
    n2 = 1 + K2 / Q2 + K2 * K2;
  return biquad(
    shelf,
    1,
    -2,
    1,
    (2 * (K2 * K2 - 1)) / n2,
    (1 - K2 / Q2 + K2 * K2) / n2,
  );
}

const lufs = (power) => -0.691 + 10 * Math.log10(Math.max(power, 1e-20));

// Mean square of each 400 ms block, stepped by 100 ms, summed over channels.
function blockPowers(weighted, fs, seconds = 0.4) {
  const size = Math.round(fs * seconds),
    step = Math.round(fs * 0.1);
  const n = weighted[0].length;
  const blocks = [];
  for (let start = 0; start + size <= n; start += step) {
    let power = 0;
    for (const channel of weighted) {
      let sum = 0;
      for (let i = start; i < start + size; i++) sum += channel[i] * channel[i];
      power += sum / size;
    }
    blocks.push(power);
  }
  return blocks;
}

export function integrated(weighted, fs) {
  const blocks = blockPowers(weighted, fs).filter((p) => lufs(p) > -70);
  if (!blocks.length) return -Infinity;
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const relative = lufs(mean(blocks)) - 10;
  const gated = blocks.filter((p) => lufs(p) > relative);
  return gated.length ? lufs(mean(gated)) : -Infinity;
}

// 4x oversampling through a 48 tap per phase Kaiser windowed sinc, as BS.1770 Annex 2 suggests.
function truePeak(x) {
  const factor = 4,
    taps = 48,
    beta = 8;
  const bessel = (v) => {
    let sum = 1,
      term = 1;
    for (let k = 1; k < 32; k++) {
      term *= (v / (2 * k)) ** 2;
      sum += term;
    }
    return sum;
  };
  const length = taps * factor,
    half = (length - 1) / 2;
  const phases = Array.from({ length: factor }, () => new Float64Array(taps));
  for (let i = 0; i < length; i++) {
    const t = (i - half) / factor;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const w =
      bessel(beta * Math.sqrt(1 - ((i - half) / half) ** 2)) / bessel(beta);
    phases[i % factor][Math.floor(i / factor)] = sinc * w;
  }
  let peak = 0;
  for (let n = taps; n < x.length; n++)
    for (const h of phases) {
      let v = 0;
      for (let k = 0; k < taps; k++) v += h[k] * x[n - k];
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
  for (const v of x) if (Math.abs(v) > peak) peak = Math.abs(v);
  return peak;
}

const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));

export function measure(channels, fs) {
  const weighted = channels.map((c) => kWeight(c, fs));
  const short = blockPowers(weighted, fs, 3).map(lufs);
  const momentary = blockPowers(weighted, fs, 0.4).map(lufs);
  let sample = 0;
  for (const c of channels)
    for (const v of c) sample = Math.max(sample, Math.abs(v));
  return {
    integratedLufs: +integrated(weighted, fs).toFixed(2),
    truePeakDbtp: +db(Math.max(...channels.map(truePeak))).toFixed(2),
    samplePeakDbfs: +db(sample).toFixed(2),
    shortTermMaxLufs: short.length ? +Math.max(...short).toFixed(2) : null,
    momentaryMaxLufs: momentary.length
      ? +Math.max(...momentary).toFixed(2)
      : null,
    seconds: +(channels[0].length / fs).toFixed(2),
  };
}

export function wav(channels, fs) {
  const n = channels[0].length,
    count = channels.length;
  const buffer = Buffer.alloc(44 + n * count * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + n * count * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(count, 22);
  buffer.writeUInt32LE(fs, 24);
  buffer.writeUInt32LE(fs * count * 2, 28);
  buffer.writeUInt16LE(count * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(n * count * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (const c of channels) {
      const v = Math.max(-1, Math.min(1, c[i]));
      buffer.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  return buffer;
}

// Replays the explorer's garment fit: every surface ray the fit casts, recorded once by
// scripts/build-fit-cache.mjs, is answered from assets/explorer/fit-cache.json. Each query is
// hashed with its target's contents; any difference abandons the record and fits live.
const RECORD = globalThis.__FIT_RECORD__ === true;
const STRIDE = 64;
const NO_HIT = 0xffffffff;

export const fitTelemetry = {
  source: RECORD ? "record" : "none",
  sessions: {},
};

const decode = (text, Type) => {
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return new Type(bytes.buffer);
};
const encode = (array) => {
  const bytes = new Uint8Array(
    array.buffer,
    array.byteOffset,
    array.byteLength,
  );
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

let records = {};
if (!RECORD) {
  try {
    const response = await fetch(
      new URL(
        "./assets/explorer/fit-cache.json" + new URL(import.meta.url).search,
        import.meta.url,
      ),
    );
    const data = response.ok ? await response.json() : null;
    if (data?.format === 1) {
      records = data.sessions;
      fitTelemetry.source = "cache";
    }
  } catch {
    fitTelemetry.source = "unavailable";
  }
}

const mixWord = (h, k) => {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
};
const scalar = new Float64Array(1),
  scalarWords = new Uint32Array(scalar.buffer);
const mixNumber = (h, value) => {
  scalar[0] = value;
  return mixWord(mixWord(h, scalarWords[0]), scalarWords[1]);
};
const contents = new WeakMap();
function contentHash(attribute) {
  if (!attribute) return 0;
  if (contents.has(attribute)) return contents.get(attribute);
  const array = attribute.array,
    aligned = array.byteOffset % 4 === 0,
    words = aligned ? Math.floor(array.byteLength / 4) : 0,
    view = new Uint32Array(array.buffer, array.byteOffset, words),
    tail = new Uint8Array(array.buffer, array.byteOffset + words * 4);
  let h = mixWord(attribute.itemSize, array.length);
  for (let i = 0; i < words; i++) h = mixWord(h, view[i]);
  for (let i = 0; i < array.byteLength - words * 4; i++)
    h = mixWord(h, tail[i]);
  contents.set(attribute, h);
  return h;
}

function queryHash(raycaster, object, mode) {
  const { origin, direction } = raycaster.ray,
    geometry = object.geometry;
  let h = mode === "farthest" ? 7 : 3;
  for (const value of [
    origin.x,
    origin.y,
    origin.z,
    direction.x,
    direction.y,
    direction.z,
    raycaster.near,
    raycaster.far,
    geometry.drawRange.start,
    geometry.drawRange.count,
    object.material.side,
    ...object.matrixWorld.elements,
  ])
    h = mixNumber(h, value);
  h = mixWord(h, contentHash(geometry.attributes.position));
  return mixWord(h, contentHash(geometry.index));
}

class FitStale extends Error {}

let session = null;

// Runs a deterministic fit; a record that stops matching rebuilds it live.
export function fitSession(name, build) {
  const record = records[name];
  if (RECORD || globalThis.__FIT_LIVE__ === true || !record) {
    session = RECORD ? recorder(name) : null;
    try {
      const result = build();
      if (session) finishRecording(session);
      fitTelemetry.sessions[name] = {
        mode: RECORD ? "recorded" : "live",
        calls: session?.calls ?? null,
      };
      return result;
    } finally {
      session = null;
    }
  }
  session = {
    name,
    replay: true,
    calls: 0,
    hash: 0,
    faces: decode(record.faces, Uint32Array),
    checks: decode(record.checks, Int32Array),
    total: record.calls,
    final: record.inputs,
  };
  const started = performance.now();
  try {
    const result = build();
    if (session.calls !== session.total || session.hash !== session.final)
      throw new FitStale(name);
    fitTelemetry.sessions[name] = {
      mode: "replayed",
      calls: session.calls,
      ms: Math.round(performance.now() - started),
    };
    return result;
  } catch (error) {
    if (!(error instanceof FitStale)) throw error;
    session = null;
    const result = build();
    fitTelemetry.sessions[name] = { mode: "stale", calls: null };
    return result;
  } finally {
    session = null;
  }
}

function recorder(name) {
  return {
    name,
    replay: false,
    calls: 0,
    hash: 0,
    faces: [],
    checks: [],
    targets: new Set(),
  };
}

function finishRecording(state) {
  for (const attribute of state.targets) {
    const before = contents.get(attribute);
    contents.delete(attribute);
    if (contentHash(attribute) !== before)
      throw new Error(`${state.name}: a fit target changed during the fit`);
  }
  records[state.name] = {
    calls: state.calls,
    inputs: state.hash,
    stride: STRIDE,
    checks: encode(Int32Array.from(state.checks)),
    faces: encode(Uint32Array.from(state.faces)),
  };
}

export function takeFitRecord() {
  return { format: 1, sessions: records };
}

// The farthest keeps the first of equally distant hits, as a strict comparison over them does.
const pick = (hits, mode) =>
  mode === "farthest"
    ? hits.reduce(
        (best, hit) => (!best || hit.distance > best.distance ? hit : best),
        null,
      )
    : hits[0] || null;

// Stands in for raycaster.intersectObject(object), returning the first hit or the farthest one.
// A replay intersects only the recorded triangle through three's own raycast, so hits are exact.
export function fitRay(raycaster, object, mode = "first") {
  const active = session;
  if (!active || object.children.length) {
    const hit = pick(raycaster.intersectObject(object), mode);
    return hit ? [hit] : [];
  }
  const geometry = object.geometry;
  const call = active.calls++;
  active.hash = mixWord(active.hash, queryHash(raycaster, object, mode));
  if (!active.replay) {
    active.targets.add(geometry.attributes.position);
    if (geometry.index) active.targets.add(geometry.index);
    const hit = pick(raycaster.intersectObject(object), mode);
    active.faces.push(hit ? hit.faceIndex : NO_HIT);
    if (active.calls % STRIDE === 0) active.checks.push(active.hash);
    return hit ? [hit] : [];
  }
  if (
    call >= active.total ||
    (active.calls % STRIDE === 0 &&
      active.checks[active.calls / STRIDE - 1] !== active.hash)
  )
    throw new FitStale(active.name);
  const face = active.faces[call];
  if (face === NO_HIT) {
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    return [];
  }
  const { start, count } = geometry.drawRange;
  geometry.setDrawRange(face * 3, 3);
  try {
    const hit = raycaster.intersectObject(object)[0];
    if (!hit) throw new FitStale(active.name);
    return [hit];
  } finally {
    geometry.setDrawRange(start, count);
  }
}

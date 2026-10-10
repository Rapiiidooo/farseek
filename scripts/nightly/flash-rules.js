// Flash rules over three consecutive rendered frames; the recorder runs this source in the page.
// Each frame is { L, cells, zero, shots, space, cut, hidden, p, f }: mean luma 0 to 255, luma
// per region, the fraction of exactly black pixels, the pistol shot count, whether the space
// finale shows, whether the camera jumped since the previous frame, whether the follow camera
// hides Nyra, and the camera position and view direction.
export function flashKinds(a, b, c, limits) {
  const kinds = [];
  const blackRise = b.zero - Math.max(a.zero, c.zero);
  if (blackRise >= limits.blackSpike)
    kinds.push(`black spike ${(blackRise * 100).toFixed(1)}%`);
  if (
    !b.space &&
    b.zero >= limits.blackArea &&
    b.zero - a.zero >= limits.blackOnset
  )
    kinds.push(`black region ${(b.zero * 100).toFixed(1)}%`);
  // Cuts, shake and the follow camera hiding Nyra change the picture by design; only black
  // regions count across them.
  if (b.cut || c.cut || a.hidden !== b.hidden || b.hidden !== c.hidden)
    return kinds;
  const off = Math.hypot(
    b.p[0] - (a.p[0] + c.p[0]) / 2,
    b.p[1] - (a.p[1] + c.p[1]) / 2,
    b.p[2] - (a.p[2] + c.p[2]) / 2,
  );
  const mean = [0, 1, 2].map((k) => a.f[k] + c.f[k]);
  const length = Math.hypot(...mean) || 1;
  const turn = Math.acos(
    Math.min(
      1,
      Math.abs(mean.reduce((sum, v, k) => sum + (v / length) * b.f[k], 0)),
    ),
  );
  if (off > limits.shakeMetres || turn > limits.shakeRadians) return kinds;
  const d1 = b.L - a.L,
    d2 = b.L - c.L;
  if (
    Math.sign(d1) === Math.sign(d2) &&
    Math.min(Math.abs(d1), Math.abs(d2)) >= limits.lumaSpike &&
    Math.abs(a.L - c.L) <= limits.lumaSpike / 2
  )
    kinds.push(`luma spike ${d1.toFixed(1)}/${d2.toFixed(1)}`);
  // A shot's muzzle flash brightens a region for a frame by design, and geometry passing the
  // lens sweeps a corner or two, so a regional flash must cover several regions at once.
  const firing = b.shots !== a.shots || c.shots !== b.shots;
  const regions = [];
  for (let k = 0; k < b.cells.length; k++) {
    const e1 = b.cells[k] - a.cells[k],
      e2 = b.cells[k] - c.cells[k];
    if (Math.sign(e1) !== Math.sign(e2) || (firing && e1 > 0)) continue;
    const step = Math.min(Math.abs(e1), Math.abs(e2));
    if (
      step >= limits.cellSpike &&
      Math.abs(a.cells[k] - c.cells[k]) <= step / 2
    )
      regions.push(k);
  }
  if (regions.length >= limits.cellCount)
    kinds.push(
      `regional spike in ${regions.length} of ${b.cells.length} regions`,
    );
  return kinds;
}

export const FLASH_LIMITS = {
  blackSpike: 0.02,
  blackArea: 0.15,
  blackOnset: 0.1,
  lumaSpike: 10,
  cellSpike: 45,
  cellCount: 4,
  cutMetres: 0.75,
  cutRadians: 0.2,
  shakeMetres: 0.02,
  shakeRadians: 0.004,
};

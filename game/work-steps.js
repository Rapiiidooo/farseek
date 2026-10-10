// Long synchronous work written as a generator: every `yield` is a point where it may pause.

export function finishSteps(steps) {
  let step;
  while (!(step = steps.next()).done);
  return step.value;
}

export async function runSteps(steps, yieldWork) {
  let step;
  while (!(step = steps.next()).done) await yieldWork();
  return step.value;
}

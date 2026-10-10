import { LOCAL_PREVIEW } from "./local-preview.js";

export function recordLoadEvent(state, event, detail = {}) {
  const { stack, ...context } = detail;
  const trace = (state.loadTrace ||= []);
  trace.push({ time: Math.round(performance.now()), event, ...context });
  if (trace.length > 48) trace.splice(0, trace.length - 48);
}

export function reportLoadFailure(error, stage, state, renderer, context = {}) {
  let contextLost = null;
  try {
    contextLost = renderer?.getContext()?.isContextLost() ?? null;
  } catch {}
  try {
    const failure = {
      at: new Date().toISOString(),
      stage,
      message: String(error?.message || error),
      stack: String(error?.stack || error),
      mode: state.mode,
      chapter: state.chapter,
      world: state.where,
      online: navigator.onLine,
      contextLost,
      trace: [...(state.loadTrace || [])],
      context,
    };
    window.__LOAD_ERROR__ = failure;
    if (LOCAL_PREVIEW)
      fetch("/__load-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(failure),
        keepalive: true,
      }).catch(() => {});
  } catch {}
}

export const LOCAL_PREVIEW = [
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
].includes(globalThis.location?.hostname);
export const LAB_SESSION =
  LOCAL_PREVIEW &&
  new URLSearchParams(globalThis.location?.search).get("lab") === "1";

export function levelPreviewURL(level) {
  return `./?lab=1&level=${encodeURIComponent(level)}`;
}

// ── Runtime asset bazasi (GLB/tekstura yo'llari) ─────────────
// Dev/brauzerда: "/" (public'дан beriladi).
// VS Code webview'да: extension `window.__ASSET_BASE__`ни webview URI'siga
// o'rnatadi (dist/webview/), chunki oddiy "/models/..." webview'да ishlamaydi.

const BASE: string =
  (typeof window !== "undefined" && (window as unknown as { __ASSET_BASE__?: string }).__ASSET_BASE__) || "/";

/** "models/x.glb" yoki "/models/x.glb" → to'g'ri to'liq URL. */
export function asset(path: string): string {
  return BASE.replace(/\/$/, "/") + path.replace(/^\//, "");
}

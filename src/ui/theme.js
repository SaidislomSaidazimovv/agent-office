// ── Design system ────────────────────────────────────────────
// Single source of design tokens for the mission-control overlay.
// Aesthetic: dark, glassy, premium HUD. Cool blue-grey neutrals with
// Apple-system status accents. Consumed by src/ui/Overlay.jsx.

// Turn a hex color into an rgba() string — used for status tints & glows.
export const withAlpha = (hex, a) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const colors = {
  // Backgrounds
  bg: "#0b0e13",
  bgScrim: "rgba(8, 10, 14, 0.66)", // top-bar gradient scrim
  // Surfaces (glass)
  surface: "rgba(14, 18, 25, 0.78)",
  surfaceRaised: "rgba(20, 25, 34, 0.9)",
  chip: "rgba(12, 15, 20, 0.6)",
  hover: "rgba(255, 255, 255, 0.08)",
  track: "rgba(255, 255, 255, 0.08)", // progress / meter tracks
  // Borders
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  // Text
  textPrimary: "#EDF1F7",
  textSecondary: "#AEB6C4",
  textMuted: "#727C8C",
  accent: "#0A84FF",
  // Agent status accents (mirrors STATUS hexes in src/config.js)
  status: {
    idle: "#9AA3AF",
    thinking: "#FFD60A",
    working: "#30D158",
    review: "#FF9F0A",
    blocked: "#FF453A",
    collab: "#0A84FF",
  },
};

// 4-point spacing scale.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };

export const font = {
  display:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  size: { xs: 11, sm: 12, base: 13, md: 14, lg: 18, xl: 24 },
  weight: { regular: 400, medium: 500, semibold: 600 },
  // Uppercase, wide-tracked utility label — the HUD "eyebrow".
  eyebrow: {
    fontSize: 10.5,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontWeight: 600,
    color: colors.textMuted,
  },
  // Data readouts sit on a fixed grid so numbers don't jitter.
  tabular: { fontVariantNumeric: "tabular-nums" },
};

export const shadow = {
  panel: "0 16px 44px -18px rgba(0, 0, 0, 0.72)",
};

// Reusable glass panel — dark translucent, blurred, hairline border.
export const panel = {
  background: colors.surface,
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  boxShadow: shadow.panel,
};

const theme = { colors, space, radii, font, shadow, panel, withAlpha };
export default theme;

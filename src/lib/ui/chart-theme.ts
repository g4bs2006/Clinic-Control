/**
 * Shared color constants for chart/table components that render via inline
 * styles (Recharts, raw <table>) and therefore can't use Tailwind tokens.
 * Mirrors the neutral near-black + violet accent defined in globals.css (.dark).
 * Keep these in sync with the CSS variables.
 */
export const CHART = {
  /** Tooltip / floating surface background */
  surface: "oklch(0.195 0.004 286)",
  /** Hairline border */
  border: "oklch(0.27 0.006 286)",
  /** Primary text */
  fg: "oklch(0.96 0 0)",
  /** Secondary / muted text */
  muted: "oklch(0.64 0 0)",
  /** Purple brand accent */
  accent: "oklch(0.56 0.27 296)",
  /** Chart grid lines (very subtle) */
  grid: "oklch(0.27 0.006 286)",
  /** Table row divider */
  rowBorder: "oklch(0.235 0 0)",
  /** Zebra-stripe background */
  zebra: "oklch(0.178 0 0)",
  /** Row hover background */
  hover: "oklch(0.24 0.006 286)",
  /** Track / empty-bar background */
  track: "oklch(0.225 0 0)",
} as const

/**
 * Distinct line/series colors for multi-clinic charts, legible on near-black.
 * Led by the blue accent, then spread across the hue wheel.
 */
export const SERIES_PALETTE = [
  "#9333EA", // brand purple (accent)
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f472b6", // pink
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#a3e635", // lime
  "#fb923c", // orange
  "#C026D3", // fuchsia
  "#f87171", // red
  "#2dd4bf", // teal
  "#c084fc", // purple
] as const

// Named colors map to CSS custom properties (--c-<name>) that have light and
// dark variants in styles.css; anything else is used as a raw CSS color.

export const PALETTE = ["blue", "orange", "green", "red", "purple", "teal", "yellow", "pink", "gray"] as const;
export const SEMANTIC = ["ok", "warn", "bad", "accent", "muted"] as const;
export const COLOR_NAMES: readonly string[] = [...SEMANTIC, ...PALETTE];

export function cssColor(c: string | undefined, fallback = "accent"): string {
  const name = c || fallback;
  return COLOR_NAMES.includes(name) ? `var(--c-${name})` : name;
}

/** Series colors used when a plot series has no explicit color. */
export function seriesColor(i: number): string {
  return PALETTE[i % (PALETTE.length - 1)]!;
}

let cache = new Map<string, string>();
let cacheTheme = "";

/**
 * Resolved color for canvas drawing (canvas does not understand var()).
 * Accepts palette names, CSS custom properties ("--grid") or raw colors.
 */
export function canvasColor(c: string | undefined, fallback = "accent"): string {
  const theme = document.documentElement.dataset.theme || "";
  if (theme !== cacheTheme) {
    cache = new Map();
    cacheTheme = theme;
  }
  const name = c || fallback;
  let v = cache.get(name);
  if (v === undefined) {
    const prop = COLOR_NAMES.includes(name) ? `--c-${name}` : name.startsWith("--") ? name : "";
    v = prop ? getComputedStyle(document.documentElement).getPropertyValue(prop).trim() : name;
    cache.set(name, v);
  }
  return v;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

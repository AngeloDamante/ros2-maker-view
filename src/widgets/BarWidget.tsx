import { useTopic } from "../bridge/react.tsx";
import { cssColor } from "../lib/colors.ts";
import { fmtNumber } from "../lib/format.ts";
import { getPath, toNumber } from "../lib/path.ts";
import { SOURCE_FIELDS, TopicFooter } from "./common.tsx";
import { TRANSFORM_FIELDS, transform } from "./resolve.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Threshold {
  value: number;
  color: string;
  label?: string;
}

interface Config {
  topic: string;
  path: string;
  unit?: string;
  decimals?: number | null;
  scale?: number | null;
  offset?: number | null;
  abs?: boolean;
  min?: number | null;
  max?: number | null;
  baseColor?: string;
  thresholds?: Threshold[];
  orientation?: "horizontal" | "vertical";
}

/** Color of the band containing v: baseColor, then the last threshold with v ≥ value. */
export function colorFor(v: number | undefined, base: string | undefined, thresholds: Threshold[]): string {
  let c = base || "ok";
  if (v === undefined) return c;
  for (const t of thresholds) if (v >= t.value) c = t.color;
  return c;
}

const fmtTick = (v: number) => String(+v.toPrecision(6));

function BarWidget({ config }: WidgetProps<Config>) {
  const view = useTopic(config.topic);
  const v = transform(toNumber(view.msg === undefined ? undefined : getPath(view.msg, config.path || "")), config);
  const min = config.min ?? 0, max = config.max ?? 100;
  const span = max - min || 1;
  const thresholds = [...(config.thresholds || [])].filter((t) => typeof t.value === "number").sort((a, b) => a.value - b.value);
  const frac = (x: number) => Math.max(0, Math.min(1, (x - min) / span));
  const shown = view.stale ? undefined : v;
  const color = colorFor(shown, config.baseColor, thresholds);
  const vertical = config.orientation === "vertical";
  // Background bands: [min, t1) base, [t1, t2) t1.color, ...
  const edges = [min, ...thresholds.map((t) => t.value).filter((x) => x > min && x < max), max];
  const bands = edges.slice(0, -1).map((a, i) => ({ a, b: edges[i + 1]!, color: colorFor(a, config.baseColor, thresholds) }));
  const pos = (f: number) => (vertical ? { bottom: `${f * 100}%` } : { left: `${f * 100}%` });
  const size = (f: number) => (vertical ? { height: `${f * 100}%` } : { width: `${f * 100}%` });
  return (
    <div className={`w-bar ${vertical ? "vertical" : "horizontal"}${view.stale ? " stale" : ""}`}>
      <div className="bar-value" style={{ color: shown === undefined ? undefined : cssColor(color) }}>
        <span className="num">{fmtNumber(shown, config.decimals ?? undefined)}</span>
        {config.unit ? <span className="unit">{config.unit}</span> : null}
      </div>
      <div className="bar-track-wrap">
        <div className="bar-track">
          {bands.map((b, i) => (
            <div key={i} className="bar-band" style={{ ...pos(frac(b.a)), ...size(frac(b.b) - frac(b.a)), background: cssColor(b.color) }} />
          ))}
          <div className="bar-fill" style={{ ...size(shown === undefined ? 0 : frac(shown)), background: cssColor(color) }} />
          {thresholds
            .filter((t) => t.value > min && t.value < max)
            .map((t, i) => (
              <div key={i} className="bar-mark" style={pos(frac(t.value))} title={`${t.label || ""} ≥ ${t.value}`} />
            ))}
        </div>
        <div className="bar-scale">
          <span style={pos(0)}>{fmtTick(min)}</span>
          {thresholds
            .filter((t) => t.value > min && t.value < max)
            .map((t, i) => (
              <span key={i} style={pos(frac(t.value))}>
                {t.label || fmtTick(t.value)}
              </span>
            ))}
          <span style={pos(1)}>{fmtTick(max)}</span>
        </div>
      </div>
      <TopicFooter name={config.topic} view={view} />
    </div>
  );
}

export const barWidget: WidgetDef = {
  type: "bar",
  label: "Bar",
  description: "Horizontal or vertical bar colored by thresholds (limits).",
  category: "Read",
  size: { w: 6, h: 4 },
  minSize: { w: 2, h: 3 },
  defaults: () => ({
    topic: "",
    path: "data",
    min: 0,
    max: 100,
    baseColor: "ok",
    thresholds: [
      { value: 70, color: "warn", label: "" },
      { value: 90, color: "bad", label: "" },
    ],
    orientation: "horizontal",
  }),
  fields: [
    ...SOURCE_FIELDS(true),
    { key: "min", label: "Min", kind: "number", placeholder: "0" },
    { key: "max", label: "Max", kind: "number", placeholder: "100" },
    { key: "baseColor", label: "Base color", kind: "color", help: "Color below the first threshold." },
    {
      key: "thresholds",
      label: "Thresholds",
      kind: "list",
      help: "From each value upwards the bar takes the threshold color.",
      fields: [
        { key: "value", label: "From value", kind: "number" },
        { key: "color", label: "Color", kind: "color" },
        { key: "label", label: "Label", kind: "text", placeholder: "optional" },
      ],
      newItem: () => ({ value: 0, color: "warn", label: "" }),
      itemLabel: (t) => `≥ ${t.value ?? "?"} → ${t.color ?? ""}`,
    },
    { key: "abs", label: "Absolute value", kind: "bool", help: "Use |value| (e.g. current in both directions)." },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "decimals", label: "Decimals", kind: "number", placeholder: "auto" },
    ...TRANSFORM_FIELDS,
    {
      key: "orientation",
      label: "Orientation",
      kind: "select",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
  ],
  component: BarWidget,
};

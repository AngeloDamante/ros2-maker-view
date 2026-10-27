import { useTopic } from "../bridge/react.tsx";
import { cssColor } from "../lib/colors.ts";
import { fmtValue } from "../lib/format.ts";
import { getPath, toNumber } from "../lib/path.ts";
import { SOURCE_FIELDS, TopicFooter } from "./common.tsx";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface State {
  value: string;
  label?: string;
  color?: string;
}

interface Config {
  topic: string;
  path: string;
  states?: State[];
  otherColor?: string;
  showRaw?: boolean;
  layout?: "single" | "all";
}

export function matchState(raw: unknown, states: State[]): State | undefined {
  const n = toNumber(raw);
  const s = typeof raw === "string" ? raw : fmtValue(raw);
  return states.find((st) => {
    const want = String(st.value ?? "").trim();
    if (want === s) return true;
    const wn = want === "" ? undefined : Number(want);
    return n !== undefined && typeof raw !== "string" && wn !== undefined && Number.isFinite(wn) && wn === n;
  });
}

function IndicatorWidget({ config }: WidgetProps<Config>) {
  const view = useTopic(config.topic);
  const states = config.states || [];
  const raw = view.msg === undefined ? undefined : getPath(view.msg, config.path || "");
  const st = view.stale ? undefined : matchState(raw, states);
  const color = view.stale ? "muted" : st?.color || config.otherColor || "muted";
  if (config.layout === "all") {
    return (
      <div className={"w-indicator all" + (view.stale ? " stale" : "")}>
        <div className="steps">
          {states.map((s, i) => (
            <div key={i} className={"step" + (s === st ? " on" : "")} style={s === st ? { borderColor: cssColor(s.color), background: `color-mix(in srgb, ${cssColor(s.color)} 18%, transparent)` } : undefined}>
              <span className="dot" style={{ background: s === st ? cssColor(s.color) : undefined }} />
              <span className="lbl">{s.label || s.value}</span>
              <span className="val">{s.value}</span>
            </div>
          ))}
        </div>
        {config.showRaw && <div className="raw">value: {view.stale ? "—" : fmtValue(raw)}</div>}
        <TopicFooter name={config.topic} view={view} />
      </div>
    );
  }
  return (
    <div className={"w-indicator" + (view.stale ? " stale" : "")}>
      <div className="main">
        <span className="lamp" style={{ background: cssColor(color), boxShadow: view.stale ? "none" : `0 0 12px ${cssColor(color)}` }} />
        <span className="lbl">{view.stale ? "—" : st?.label || st?.value || fmtValue(raw)}</span>
      </div>
      {config.showRaw && <div className="raw">value: {view.stale ? "—" : fmtValue(raw)}</div>}
      <TopicFooter name={config.topic} view={view} />
    </div>
  );
}

export const indicatorWidget: WidgetDef = {
  type: "indicator",
  label: "State indicator",
  description: "Lamp / label mapping discrete values (states, booleans, enums) to colors.",
  category: "Read",
  size: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  defaults: () => ({
    topic: "",
    path: "data",
    states: [
      { value: "false", label: "OFF", color: "muted" },
      { value: "true", label: "ON", color: "ok" },
    ],
    otherColor: "warn",
    showRaw: false,
    layout: "single",
  }),
  fields: [
    ...SOURCE_FIELDS(false),
    {
      key: "states",
      label: "States",
      kind: "list",
      fields: [
        { key: "value", label: "Value", kind: "text", help: "Compared as number when both are numeric (1 = 1.0), as text otherwise (true, IDLE…)." },
        { key: "label", label: "Label", kind: "text" },
        { key: "color", label: "Color", kind: "color" },
      ],
      newItem: () => ({ value: "", label: "", color: "accent" }),
      itemLabel: (s) => `${s.value} → ${s.label || ""}`,
    },
    { key: "otherColor", label: "Color for other values", kind: "color" },
    {
      key: "layout",
      label: "Layout",
      kind: "select",
      options: [
        { value: "single", label: "Single lamp" },
        { value: "all", label: "All states (stepper)" },
      ],
    },
    { key: "showRaw", label: "Show raw value", kind: "bool" },
  ],
  component: IndicatorWidget,
};

import { useTopic } from "../bridge/react.tsx";
import { fmtValue } from "../lib/format.ts";
import { getPath, toNumber } from "../lib/path.ts";
import { SOURCE_FIELDS, TopicFooter } from "./common.tsx";
import { TRANSFORM_FIELDS, transform } from "./resolve.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  topic: string;
  path: string;
  unit?: string;
  decimals?: number | null;
  scale?: number | null;
  offset?: number | null;
  staleAfter?: number | null;
}

function ValueWidget({ config }: WidgetProps<Config>) {
  const view = useTopic(config.topic, config.staleAfter ?? 2);
  const raw = view.msg === undefined ? undefined : getPath(view.msg, config.path || "");
  const n = toNumber(raw);
  const shown = typeof raw === "number" || typeof raw === "bigint" ? transform(n, config) : raw;
  return (
    <div className={"w-value" + (view.stale ? " stale" : "")}>
      <div className="big">
        <span className="num">{view.stale && view.msg === undefined ? "—" : fmtValue(shown, config.decimals ?? undefined)}</span>
        {config.unit ? <span className="unit">{config.unit}</span> : null}
      </div>
      <TopicFooter name={config.topic} view={view} />
    </div>
  );
}

export const valueWidget: WidgetDef = {
  type: "value",
  label: "Value",
  description: "Big readout of one field (number, text or boolean).",
  category: "Read",
  size: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  defaults: () => ({ topic: "", path: "data", unit: "", decimals: null }),
  fields: [
    ...SOURCE_FIELDS(false),
    { key: "unit", label: "Unit", kind: "text", placeholder: "e.g. A, °, m/s" },
    { key: "decimals", label: "Decimals", kind: "number", placeholder: "auto" },
    ...TRANSFORM_FIELDS,
    { key: "staleAfter", label: "Stale after [s]", kind: "number", placeholder: "2" },
  ],
  component: ValueWidget,
};

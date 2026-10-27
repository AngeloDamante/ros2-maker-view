import { useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { fmtTime, fmtValue } from "../lib/format.ts";
import { kindOf } from "../lib/paramValue.ts";
import { useParam } from "./param.ts";
import { StatusLine, type SendStatus } from "./PublishWidget.tsx";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  node: string;
  param: string;
  unit?: string;
  decimals?: number | null;
  editable?: boolean;
}

/**
 * One parameter of a node: its value, kept up to date, and the control for its type
 * (a checkbox for booleans, an input with Set for the others).
 */
function ParamWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeVersion();
  const p = useParam(config.node, config.param);
  const cur = p.param;
  const kind = cur ? kindOf(cur) : undefined;
  const [edit, setEdit] = useState<string | null>(null);
  const [status, setStatus] = useState<SendStatus | null>(null);

  const apply = async (raw: unknown) => {
    setStatus({ ok: true, text: "…" });
    const r = await p.set(raw);
    setStatus(r.ok ? { ok: true, text: `✓ set · ${fmtTime(Date.now())}` } : { ok: false, text: r.text });
    if (r.ok) setEdit(null);
  };

  // the text edited in the input: doubles keep a decimal point, arrays are JSON
  const asText = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : kind === "double" && Number.isInteger(v) ? (v as number).toFixed(1) : String(v));
  const shown =
    cur === undefined ? "—" : kind === "array" || kind === "string" || (kind === "double" && config.decimals == null) ? asText(cur.value) : fmtValue(cur.value, config.decimals ?? undefined);
  const editable = config.editable !== false && !!cur;

  let foot = p.full || "no node or parameter configured";
  if (p.full && !client.connected) foot += " · offline";
  else if (kind) foot += ` · ${kind}`;
  return (
    <div className="w-param">
      <div className="big">
        <span className="num" title={cur ? asText(cur.value) : undefined}>
          {shown}
        </span>
        {config.unit && cur ? <span className="unit">{config.unit}</span> : null}
      </div>
      {editable && (
        <div className="w-actions">
          {kind === "bool" ? (
            <label className="param-toggle">
              <input type="checkbox" checked={Boolean(cur.value)} onChange={(e) => apply(e.target.checked)} />
              {cur.value ? "on" : "off"}
            </label>
          ) : (
            <>
              <input
                className={"mono param-input" + (edit !== null ? " edited" : "")}
                type={kind === "integer" || kind === "double" ? "number" : "text"}
                step={kind === "integer" ? 1 : "any"}
                value={edit ?? asText(cur.value)}
                onChange={(e) => setEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && edit !== null) apply(edit);
                  if (e.key === "Escape") setEdit(null);
                }}
              />
              <button className="primary" disabled={edit === null} onClick={() => edit !== null && apply(edit)}>
                Set
              </button>
            </>
          )}
        </div>
      )}
      <StatusLine status={status ?? (p.error ? { ok: false, text: p.error } : null)} />
      <div className={"w-foot" + (p.full ? "" : " warn")}>
        {foot}
      </div>
    </div>
  );
}

export const paramWidget: WidgetDef = {
  type: "param",
  label: "Parameter",
  description: "One node parameter: its current value and a control to set it.",
  category: "Write",
  size: { w: 5, h: 4 },
  minSize: { w: 3, h: 3 },
  defaults: () => ({ node: "", param: "", unit: "", decimals: null, editable: true }),
  fields: [
    { key: "node", label: "Node", kind: "node", help: "Absolute (/ns/node) or relative name." },
    { key: "param", label: "Parameter", kind: "text", placeholder: "e.g. max_speed or pid.kp" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "decimals", label: "Decimals", kind: "number", placeholder: "auto" },
    { key: "editable", label: "Editable", kind: "bool", help: "Off: shows the value only." },
  ],
  component: ParamWidget,
};

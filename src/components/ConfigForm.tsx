// Generic form rendering FieldSpec lists: used for widget configuration and
// view settings. Topic, type, node, service and field-path inputs get
// suggestions from what the bridge currently advertises.

import { useEffect, useId, useRef, useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { defaultMessage, leafPaths, type Definitions } from "../bridge/schema.ts";
import { COLOR_NAMES, cssColor } from "../lib/colors.ts";
import { substitute, type VarValues } from "../lib/vars.ts";
import type { FieldSpec } from "../widgets/types.ts";

export const DL_TOPICS = "rmv-dl-topics";
export const DL_TYPES = "rmv-dl-types";
export const DL_NODES = "rmv-dl-nodes";
export const DL_SERVICES = "rmv-dl-services";

/** Datalists shared by all inputs of the open form. */
export function BridgeDatalists() {
  const client = useBridge();
  useBridgeVersion();
  return (
    <>
      <datalist id={DL_TOPICS}>
        {client.topicNames().map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={DL_TYPES}>
        {client.typeNames().map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={DL_NODES}>
        {client.nodeNames().map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={DL_SERVICES}>
        {client.serviceNames().map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

interface Ctx {
  vars: VarValues;
  root: Record<string, any>;
}

export function ConfigForm({
  fields,
  value,
  onChange,
  vars,
  root,
}: {
  fields: FieldSpec[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  vars: VarValues;
  root?: Record<string, any>;
}) {
  const ctx: Ctx = { vars, root: root ?? value };
  return (
    <div className="cfg-form">
      {fields
        .filter((f) => !f.showIf || f.showIf(value))
        .map((f) => (
          <FieldRow key={f.key} spec={f} item={value} ctx={ctx} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} />
        ))}
    </div>
  );
}

function lookup(key: string | undefined, item: Record<string, any>, ctx: Ctx): string {
  if (!key) return "";
  const v = item[key] ?? ctx.root[key];
  return typeof v === "string" ? substitute(v, ctx.vars) : "";
}

function FieldRow({ spec, value, onChange, item, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; item: Record<string, any>; ctx: Ctx }) {
  const inline = spec.kind === "bool";
  return (
    <div className={"cfg-row" + (inline ? " inline" : "") + (spec.kind === "list" ? " list" : "")}>
      <label className="cfg-label">{spec.label}</label>
      <div className="cfg-input">
        <FieldInput spec={spec} value={value} onChange={onChange} item={item} ctx={ctx} />
        {spec.help && <div className="cfg-help">{spec.help}</div>}
      </div>
    </div>
  );
}

function FieldInput({ spec, value, onChange, item, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; item: Record<string, any>; ctx: Ctx }) {
  const client = useBridge();
  useBridgeVersion();
  const listId = useId();
  switch (spec.kind) {
    case "text":
      return <input type="text" value={value ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      return <textarea rows={4} value={value ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          type="number"
          step="any"
          value={value === null || value === undefined ? "" : value}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "bool":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "select":
      return (
        <select value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(spec.numeric ? Number(e.target.value) : e.target.value)}>
          {value === undefined && <option value="">—</option>}
          {(spec.options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "color":
      return <ColorInput value={value} onChange={onChange} />;
    case "topic": {
      const name = typeof value === "string" ? substitute(value, ctx.vars) : "";
      const ch = name ? client.channelFor(name) : undefined;
      return (
        <>
          <input type="text" className="mono" list={DL_TOPICS} value={value ?? ""} placeholder={spec.placeholder || "/namespace/topic"} onChange={(e) => onChange(e.target.value)} />
          {name && (
            <div className={"cfg-hint " + (ch ? "ok" : client.connected ? "warn" : "")}>
              {ch ? `✓ ${ch.topic} · ${ch.schemaName}` : client.connected ? "not advertised by the bridge (yet)" : "bridge offline: checked when connected"}
            </div>
          )}
        </>
      );
    }
    case "type": {
      const topic = lookup(spec.topicKey, item, ctx);
      const auto = topic ? client.channelFor(topic)?.schemaName : undefined;
      return <input type="text" className="mono" list={DL_TYPES} value={value ?? ""} placeholder={auto ? `auto: ${auto}` : client.connected ? "pkg/msg/Type" : "pkg/msg/Type (offline: set it, or it is taken from the topic)"} onChange={(e) => onChange(e.target.value)} />;
    }
    case "node":
      return <input type="text" className="mono" list={DL_NODES} value={value ?? ""} placeholder="/namespace/node" onChange={(e) => onChange(e.target.value)} />;
    case "service":
      return <input type="text" className="mono" list={DL_SERVICES} value={value ?? ""} placeholder="/namespace/service" onChange={(e) => onChange(e.target.value)} />;
    case "path": {
      const topic = lookup(spec.topicKey, item, ctx);
      const ch = topic ? client.channelFor(topic) : undefined;
      let paths: string[] = [];
      try {
        const defs = ch ? client.definitionsFor(ch.schemaName) : undefined;
        if (defs) paths = leafPaths(defs).filter((p) => !spec.numeric || p.numeric).map((p) => p.path);
      } catch {
        paths = [];
      }
      return (
        <>
          <input type="text" className="mono" list={listId} value={value ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />
          <datalist id={listId}>
            {paths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      );
    }
    case "stringList":
      return <StringListInput spec={spec} value={value} onChange={onChange} />;
    case "message":
      return <MessageInput spec={spec} value={value} onChange={onChange} item={item} ctx={ctx} />;
    case "list":
      return <ListInput spec={spec} value={value} onChange={onChange} ctx={ctx} />;
  }
}

function ColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const isNamed = !value || COLOR_NAMES.includes(value);
  const [custom, setCustom] = useState(!isNamed);
  return (
    <div className="color-input">
      <span className="swatch" style={{ background: value ? cssColor(value) : "transparent" }} />
      <select
        value={custom ? "__custom" : value || ""}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            onChange(value && !COLOR_NAMES.includes(value) ? value : "#2563eb");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">default</option>
        {COLOR_NAMES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__custom">custom…</option>
      </select>
      {custom && <input type="text" className="mono" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#rrggbb" />}
    </div>
  );
}

/** Textarea with one entry per line; keeps its own text so blank lines can be typed. */
function StringListInput({ spec, value, onChange }: { spec: FieldSpec; value: any; onChange: (v: any) => void }) {
  const toText = (v: any) => {
    const lines = spec.formatLines ? spec.formatLines(v) : v;
    return Array.isArray(lines) ? lines.join("\n") : typeof lines === "string" ? lines : "";
  };
  const [text, setText] = useState(() => toText(value));
  const emitted = useRef<string>(JSON.stringify(value ?? []));
  useEffect(() => {
    const incoming = JSON.stringify(value ?? []);
    if (incoming !== emitted.current) {
      emitted.current = incoming;
      setText(toText(value));
    }
  }, [value]);
  return (
    <textarea
      rows={Math.min(8, Math.max(2, text.split("\n").length))}
      className="mono"
      value={text}
      placeholder={spec.placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const lines = e.target.value.split("\n");
        const v = spec.parseLines ? spec.parseLines(lines) : lines;
        emitted.current = JSON.stringify(v);
        onChange(v);
      }}
    />
  );
}

function MessageInput({ spec, value, onChange, item, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; item: Record<string, any>; ctx: Ctx }) {
  const client = useBridge();
  useBridgeVersion();
  const fmt = (v: any) => (typeof v === "string" ? v : JSON.stringify(v ?? {}, null, 2));
  const [text, setText] = useState(() => fmt(value));
  const [error, setError] = useState("");
  const emitted = useRef<string>(JSON.stringify(value ?? {}));
  useEffect(() => {
    const incoming = JSON.stringify(value ?? {});
    if (incoming !== emitted.current) {
      emitted.current = incoming;
      setText(fmt(value));
      setError("");
    }
  }, [value]);

  let defs: Definitions | undefined;
  let typeName = "";
  try {
    if (spec.serviceKey) {
      const svc = client.serviceFor(lookup(spec.serviceKey, item, ctx));
      if (svc) {
        defs = client.serviceDefinitions(svc, "request");
        typeName = svc.type + " request";
      }
    } else {
      const topic = lookup(spec.topicKey, item, ctx);
      typeName = lookup(spec.typeKey, item, ctx) || (topic ? client.channelFor(topic)?.schemaName || "" : "");
      defs = client.definitionsFor(typeName);
    }
  } catch {
    defs = undefined;
  }

  const emit = (obj: unknown) => {
    emitted.current = JSON.stringify(obj);
    onChange(obj);
  };
  return (
    <div className="msg-input">
      <textarea
        className="mono"
        rows={Math.min(14, Math.max(3, text.split("\n").length))}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const v = JSON.parse(e.target.value);
            if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("must be a JSON object");
            setError("");
            emit(v);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      <div className="msg-input-bar">
        {error ? <span className="bad-text">{error}</span> : <span className="muted">{typeName ? `${typeName}${defs ? "" : " · schema available when connected"}` : "type unknown: write the JSON, or connect to fill from schema"}</span>}
        <button
          className="small"
          disabled={!defs}
          title="Replace with all fields of the type at their default value"
          onClick={() => {
            const obj = defaultMessage(defs!);
            setText(JSON.stringify(obj, null, 2));
            setError("");
            emit(obj);
          }}
        >
          Fill from schema
        </button>
      </div>
    </div>
  );
}

function ListInput({ spec, value, onChange, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; ctx: Ctx }) {
  const items: Record<string, any>[] = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState<Set<number>>(() => new Set(items.length <= 2 ? items.map((_, i) => i) : []));
  const set = (next: Record<string, any>[]) => onChange(next);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
    setOpen((o) => {
      const n = new Set<number>();
      o.forEach((k) => n.add(k === i ? j : k === j ? i : k));
      return n;
    });
  };
  const toggle = (i: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <div className="cfg-list">
      {items.map((it, i) => (
        <div key={i} className={"cfg-item" + (open.has(i) ? " open" : "")}>
          <div className="cfg-item-head" onClick={() => toggle(i)}>
            <span className="chev">{open.has(i) ? "▾" : "▸"}</span>
            <span className="cfg-item-title">{spec.itemLabel ? spec.itemLabel(it, i) : `#${i + 1}`}</span>
            <span className="cfg-item-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="icon" title="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                ↓
              </button>
              <button className="icon" title="Duplicate" onClick={() => set([...items.slice(0, i + 1), structuredClone(it), ...items.slice(i + 1)])}>
                ⧉
              </button>
              <button className="icon danger" title="Remove" onClick={() => set(items.filter((_, k) => k !== i))}>
                ✕
              </button>
            </span>
          </div>
          {open.has(i) && (
            <div className="cfg-item-body">
              <ConfigForm fields={spec.fields || []} value={it} vars={ctx.vars} root={ctx.root} onChange={(v) => set(items.map((x, k) => (k === i ? v : x)))} />
            </div>
          )}
        </div>
      ))}
      <button
        className="small"
        onClick={() => {
          set([...items, spec.newItem ? spec.newItem() : {}]);
          setOpen((o) => new Set(o).add(items.length));
        }}
      >
        + Add
      </button>
    </div>
  );
}

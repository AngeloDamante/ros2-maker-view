import { useCallback, useEffect, useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import type { Param } from "../bridge/client.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  node: string;
  params?: string[];
  editable?: boolean;
  showType?: boolean;
}

type Kind = "bool" | "integer" | "double" | "string" | "array";

interface Result {
  ok: boolean;
  text: string;
}

// foxglove_bridge only tags doubles ("float64") and some arrays; integers,
// booleans and strings have no type field and are recognized from the value.
function kindOf(p: Param): Kind {
  if (p.type === "float64") return "double";
  if (p.type?.endsWith("_array") || Array.isArray(p.value)) return "array";
  if (typeof p.value === "boolean") return "bool";
  if (typeof p.value === "number") return "integer";
  return "string";
}

function typeLabel(p: Param): string {
  const k = kindOf(p);
  if (k !== "array") return k;
  if (p.type === "float64_array") return "double[]";
  if (p.type === "byte_array") return "byte[]";
  const first = (p.value as unknown[])[0];
  return typeof first === "boolean" ? "bool[]" : typeof first === "number" ? "integer[]" : typeof first === "string" ? "string[]" : "array";
}

function display(p: Param): string {
  const k = kindOf(p);
  if (k === "array") return JSON.stringify(p.value);
  if (k === "double" && Number.isInteger(p.value)) return (p.value as number).toFixed(1);
  return String(p.value);
}

function parseInput(p: Param, raw: string | boolean): { value?: unknown; error?: string } {
  switch (kindOf(p)) {
    case "bool":
      return { value: Boolean(raw) };
    case "integer": {
      const n = Number(raw);
      return String(raw).trim() !== "" && Number.isInteger(n) ? { value: n } : { error: "integer expected" };
    }
    case "double": {
      const n = Number(raw);
      return String(raw).trim() !== "" && Number.isFinite(n) ? { value: n } : { error: "number expected" };
    }
    case "string":
      return { value: String(raw) };
    case "array":
      try {
        const v = JSON.parse(String(raw));
        return Array.isArray(v) ? { value: v } : { error: "JSON array expected, e.g. [1, 2]" };
      } catch {
        return { error: "JSON array expected, e.g. [1, 2]" };
      }
  }
}

function ParamsWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeVersion();
  const node = client.resolveNode((config.node || "").trim());
  const wanted = (config.params || []).map((s) => s.trim()).filter(Boolean);
  const wantedKey = wanted.join("\n");
  const [params, setParams] = useState<Map<string, Param>>(new Map());
  const [missing, setMissing] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string | boolean>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const available = client.connected && client.can("parameters");

  const load = useCallback(async () => {
    if (!node) return;
    setLoading(true);
    setError("");
    const prefix = node + ".";
    const names = wanted.map((p) => prefix + p);
    try {
      let list: Param[];
      if (names.length) {
        list = await client.getParameters(names);
        // The bridge drops the whole request when one name does not exist: retry one by one.
        if (list.length < names.length && names.length > 1) list = (await Promise.all(names.map((n) => client.getParameters([n]).catch(() => [] as Param[])))).flat();
      } else {
        list = (await client.getParameters([])).filter((p) => p.name.startsWith(prefix));
        list.sort((a, b) => a.name.localeCompare(b.name));
      }
      setParams(new Map(list.map((p) => [p.name, p])));
      setMissing(names.filter((n) => !list.some((p) => p.name === n)));
      if (!list.length) setError(`No parameters found for ${node}: is the node running? (ros2 param list ${node})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, node, wantedKey]);

  useEffect(() => {
    if (available && node) load();
  }, [available, node, load]);

  const namesKey = [...params.keys()].join("\n");
  useEffect(() => {
    const names = namesKey ? namesKey.split("\n") : [];
    if (!names.length) return;
    return client.subscribeParams(names, (p) => setParams((prev) => new Map(prev).set(p.name, p)));
  }, [client, namesKey]);

  const set = async (p: Param, raw: string | boolean) => {
    const { value, error } = parseInput(p, raw);
    if (error) {
      setResults((r) => ({ ...r, [p.name]: { ok: false, text: error } }));
      return;
    }
    const req: Param = { name: p.name, value };
    if (p.type) req.type = p.type;
    setResults((r) => ({ ...r, [p.name]: { ok: true, text: "…" } }));
    try {
      const res = await client.setParameters([req]);
      const got = res.find((x) => x.name === p.name);
      if (got) setParams((prev) => new Map(prev).set(got.name, got));
      const ok = !!got && JSON.stringify(got.value) === JSON.stringify(value);
      setResults((r) => ({
        ...r,
        [p.name]: ok ? { ok: true, text: "✓ set" } : { ok: false, text: "rejected: read-only, wrong type or refused by the node (see bridge log)" },
      }));
      client.addLog(ok ? "ok" : "warn", ok ? `Parameter ${p.name} = ${JSON.stringify(value)}` : `Parameter ${p.name}: set rejected, value unchanged`);
      if (ok)
        setEdits((e) => {
          const { [p.name]: _, ...rest } = e;
          return rest;
        });
    } catch (e) {
      setResults((r) => ({ ...r, [p.name]: { ok: false, text: (e as Error).message } }));
    }
  };

  const editable = config.editable !== false;
  return (
    <div className="w-params">
      <div className="w-toolbar">
        <span className="mono muted grow-ellipsis" title={node}>
          {node || "no node configured"}
        </span>
        <button className="small" onClick={load} disabled={!available || !node || loading}>
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>
      <div className="w-scroll">
        {!client.connected ? (
          <div className="muted small-text">offline</div>
        ) : !client.can("parameters") ? (
          <div className="warn-text small-text">The bridge does not expose parameters (capability "parameters" missing).</div>
        ) : null}
        {error && <div className="warn-text small-text">{error}</div>}
        <table className="params">
          <tbody>
            {[...params.values()].map((p) => {
              const short = p.name.slice(node.length + 1);
              const kind = kindOf(p);
              const edit = edits[p.name];
              const res = results[p.name];
              return (
                <tr key={p.name}>
                  <td className="pname mono" title={p.name}>
                    {short}
                    {config.showType !== false && <span className="ptype">{typeLabel(p)}</span>}
                  </td>
                  <td className="pval">
                    {!editable ? (
                      <span className="mono">{display(p)}</span>
                    ) : kind === "bool" ? (
                      <input type="checkbox" checked={Boolean(p.value)} onChange={(e) => set(p, e.target.checked)} />
                    ) : (
                      <input
                        className={"mono" + (edit !== undefined ? " edited" : "")}
                        type={kind === "integer" || kind === "double" ? "number" : "text"}
                        step={kind === "integer" ? 1 : "any"}
                        value={edit !== undefined ? String(edit) : display(p)}
                        onChange={(e) => setEdits({ ...edits, [p.name]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") set(p, edit ?? display(p));
                          if (e.key === "Escape") setEdits(({ [p.name]: _, ...rest }) => rest);
                        }}
                      />
                    )}
                  </td>
                  {editable && (
                    <td className="pact">
                      {kind !== "bool" && (
                        <button className="small" disabled={edit === undefined} onClick={() => set(p, edit ?? display(p))}>
                          Set
                        </button>
                      )}
                    </td>
                  )}
                  <td className={"pres " + (res ? (res.ok ? "ok" : "bad") : "")} title={res?.text}>
                    {res?.text}
                  </td>
                </tr>
              );
            })}
            {missing.map((n) => (
              <tr key={n} className="missing">
                <td className="pname mono">{n.slice(node.length + 1)}</td>
                <td colSpan={3} className="muted">
                  not found
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const paramsWidget: WidgetDef = {
  type: "params",
  label: "Parameters",
  description: "Reads and sets the parameters of a node (read-only or rejected values are reported).",
  category: "Write",
  size: { w: 8, h: 8 },
  minSize: { w: 4, h: 3 },
  defaults: () => ({ node: "", params: [], editable: true, showType: true }),
  fields: [
    { key: "node", label: "Node", kind: "node", help: "Absolute (/ns/node) or relative name." },
    { key: "params", label: "Parameters", kind: "stringList", placeholder: "one name per line (empty = all)" },
    { key: "editable", label: "Editable", kind: "bool" },
    { key: "showType", label: "Show types", kind: "bool" },
  ],
  component: ParamsWidget,
};

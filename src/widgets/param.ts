// Node parameters as a write target, shared by the Parameters widget and by the
// widgets that can set one parameter instead of publishing on a topic (Buttons, Slider).

import { useCallback, useEffect, useState } from "react";
import type { BridgeClient, Param } from "../bridge/client.ts";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { coerceParamValue, paramValueFromText, sameValue } from "../lib/paramValue.ts";
import type { FieldSpec } from "./types.ts";

export interface SetResult {
  ok: boolean;
  text: string;
}

/**
 * Sets a parameter to a value already of its type. foxglove_bridge answers a rejected set
 * (read-only, wrong type, refused by the node) with the old value, so the result is checked.
 */
export async function setParamValue(client: BridgeClient, p: Param, value: unknown): Promise<{ result: SetResult; param?: Param }> {
  const req: Param = { name: p.name, value };
  if (p.type) req.type = p.type;
  const res = await client.setParameters([req]);
  const got = res.find((x) => x.name === p.name);
  const ok = !!got && sameValue(got.value, value);
  client.addLog(ok ? "ok" : "warn", ok ? `Parameter ${p.name} = ${JSON.stringify(value)}` : `Parameter ${p.name}: set rejected, value unchanged`);
  return {
    result: ok ? { ok: true, text: "✓ set" } : { ok: false, text: "rejected: read-only, wrong type or refused by the node (see bridge log)" },
    param: got,
  };
}

/**
 * One parameter of a node: its current value (kept up to date) and a setter. The setter converts
 * the value to the parameter's type; a string is read as typed in a config field ("true", "2.5").
 */
export function useParam(nodeName: string | undefined, paramName: string | undefined) {
  const client = useBridge();
  useBridgeVersion();
  const node = client.resolveNode((nodeName || "").trim());
  const short = (paramName || "").trim();
  const full = node && short ? `${node}.${short}` : "";
  const available = client.connected && client.can("parameters");
  const [param, setParam] = useState<Param | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    setParam(undefined);
    setError("");
    if (!available || !full) return;
    let alive = true;
    client
      .getParameters([full])
      .then((list) => {
        if (!alive) return;
        const p = list.find((x) => x.name === full);
        if (p) setParam(p);
        else setError(`parameter ${full} not found: is the node running?`);
      })
      .catch((e: Error) => alive && setError(e.message));
    const unsubscribe = client.subscribeParams([full], (p) => setParam(p));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [client, available, full]);

  const set = useCallback(
    async (raw: unknown): Promise<SetResult> => {
      if (!full) return { ok: false, text: "no node or parameter configured" };
      if (!param) return { ok: false, text: error || (available ? "parameter not loaded yet" : "offline") };
      const { value, error: bad } = typeof raw === "string" ? paramValueFromText(param, raw) : coerceParamValue(param, raw);
      if (bad) return { ok: false, text: `${short}: ${bad}` };
      try {
        const { result, param: got } = await setParamValue(client, param, value);
        if (got) setParam(got);
        return result;
      } catch (e) {
        return { ok: false, text: (e as Error).message };
      }
    },
    [client, full, short, param, error, available],
  );

  return { node, short, full, param, error, set };
}

export const isParamTarget = (c: Record<string, any>) => c.target === "param";

export const TARGET_FIELD: FieldSpec = {
  key: "target",
  label: "Target",
  kind: "select",
  options: [
    { value: "topic", label: "Publish on a topic" },
    { value: "param", label: "Set a node parameter" },
  ],
  help: "A parameter changes the node's behaviour only if the node handles parameter changes while running.",
};

export const PARAM_TARGET_FIELDS: FieldSpec[] = [
  { key: "node", label: "Node", kind: "node", help: "Absolute (/ns/node) or relative name.", showIf: isParamTarget },
  { key: "param", label: "Parameter", kind: "text", placeholder: "e.g. max_speed or pid.kp", showIf: isParamTarget },
];

/** The given fields, shown only when the widget publishes on a topic. */
export function topicOnly(fields: FieldSpec[]): FieldSpec[] {
  return fields.map((f) => ({ ...f, showIf: (c, root) => !isParamTarget(root) && (!f.showIf || f.showIf(c, root)) }));
}

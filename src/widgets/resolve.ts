import { resolveVars, type VarValues } from "../lib/vars.ts";
import type { FieldSpec } from "./types.ts";

/**
 * Substitutes view variables in a widget config. Message templates use typed
 * substitution ("${id}" alone becomes a number), every other string is text.
 */
export function resolveConfig(config: Record<string, any>, fields: FieldSpec[], vars: VarValues): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(config)) {
    const spec = fields.find((f) => f.key === k);
    if (spec?.kind === "message") out[k] = resolveVars(v, vars, true);
    else if (spec?.kind === "list" && Array.isArray(v) && spec.fields)
      out[k] = v.map((item) => (item && typeof item === "object" ? resolveConfig(item, spec.fields!, vars) : resolveVars(item, vars)));
    else out[k] = resolveVars(v, vars);
  }
  return out;
}

/** Applies scale/offset/abs transforms shared by the numeric widgets. */
export function transform(v: number | undefined, c: { scale?: number | null; offset?: number | null; abs?: boolean }): number | undefined {
  if (v === undefined) return undefined;
  let x = v * (typeof c.scale === "number" ? c.scale : 1) + (typeof c.offset === "number" ? c.offset : 0);
  if (c.abs) x = Math.abs(x);
  return x;
}

export const TRANSFORM_FIELDS: FieldSpec[] = [
  { key: "scale", label: "Scale", kind: "number", placeholder: "1", help: "value × scale + offset (e.g. 57.2958 for rad → deg)" },
  { key: "offset", label: "Offset", kind: "number", placeholder: "0" },
];

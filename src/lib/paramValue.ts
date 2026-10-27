// Parameter values as foxglove_bridge reports them, and conversion of configured
// values to a parameter's type. No React/browser imports: used by tests.

import type { Param } from "../bridge/client.ts";

export type ParamKind = "bool" | "integer" | "double" | "string" | "array";

// foxglove_bridge only tags doubles ("float64") and some arrays; integers,
// booleans and strings have no type field and are recognized from the value.
export function kindOf(p: Param): ParamKind {
  if (p.type === "float64") return "double";
  if (p.type?.endsWith("_array") || Array.isArray(p.value)) return "array";
  if (typeof p.value === "boolean") return "bool";
  if (typeof p.value === "number") return "integer";
  return "string";
}

/** Converts a value to the type of the parameter on the node (the node rejects a type change). */
export function coerceParamValue(p: Param, v: unknown): { value?: unknown; error?: string } {
  switch (kindOf(p)) {
    case "bool":
      if (typeof v === "boolean") return { value: v };
      if (v === 1 || v === 0) return { value: v === 1 };
      if (typeof v === "string" && /^(true|false)$/i.test(v.trim())) return { value: v.trim().toLowerCase() === "true" };
      return { error: "true or false expected" };
    case "integer": {
      const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
      return Number.isInteger(n) ? { value: n } : { error: "integer expected" };
    }
    case "double": {
      const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
      return Number.isFinite(n) ? { value: n } : { error: "number expected" };
    }
    case "string":
      return { value: typeof v === "string" ? v : JSON.stringify(v) };
    case "array":
      return Array.isArray(v) ? { value: v } : { error: "JSON array expected, e.g. [1, 2]" };
  }
}

/** A value typed in a config field: JSON when it parses (true, 2.5, [1, 2], "x"), else the text. */
export function parseParamText(text: unknown): unknown {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A value typed in a config field, converted to the parameter's type (text stays text for strings). */
export function paramValueFromText(p: Param, text: string): { value?: unknown; error?: string } {
  return kindOf(p) === "string" ? { value: text } : coerceParamValue(p, parseParamText(text));
}

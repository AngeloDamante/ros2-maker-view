// View variables: `${name}` placeholders in widget configs, chosen from a
// selector in the view header (e.g. one view for several identical motors).

export interface VarOptionObject {
  value: string;
  label?: string;
  /** Extra variables set when this option is selected. */
  set?: Record<string, string>;
}
export type VarOption = string | VarOptionObject;

export interface Variable {
  name: string;
  label?: string;
  options: VarOption[];
  default?: string;
}

export type VarValues = Record<string, string>;

const REF = /\$\{([A-Za-z_][\w]*)\}/g;
const SINGLE_REF = /^\$\{([A-Za-z_][\w]*)\}$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function optionValue(o: VarOption): string {
  return typeof o === "string" ? o : o.value;
}
export function optionLabel(o: VarOption): string {
  return typeof o === "string" ? o : o.label || o.value;
}

/** Current values of all variables (selected option + the extra values it sets). */
export function computeVarValues(variables: Variable[] | undefined, selection: Record<string, string>): VarValues {
  const out: VarValues = {};
  for (const v of variables || []) {
    const values = v.options.map(optionValue);
    let cur = selection[v.name];
    if (cur === undefined || !values.includes(cur)) cur = v.default !== undefined && values.includes(v.default) ? v.default : values[0];
    if (cur === undefined) continue;
    out[v.name] = cur;
    const opt = v.options.find((o) => optionValue(o) === cur);
    if (opt && typeof opt !== "string" && opt.set) Object.assign(out, opt.set);
  }
  return out;
}

export function substitute(s: string, vars: VarValues): string {
  return s.includes("${") ? s.replace(REF, (all, name: string) => (name in vars ? vars[name]! : all)) : s;
}

/**
 * Deeply replaces `${name}` in every string of `value`.
 * With `typed`, a string made of a single reference whose value looks like a
 * number or boolean becomes that number/boolean: used for message templates,
 * so that `{"data": "${id}"}` publishes a number.
 */
export function resolveVars<T>(value: T, vars: VarValues, typed = false): T {
  if (typeof value === "string") {
    if (typed) {
      const m = SINGLE_REF.exec(value);
      if (m && m[1]! in vars) {
        const v = vars[m[1]!]!;
        if (NUMBER.test(v)) return Number(v) as T;
        if (v === "true" || v === "false") return (v === "true") as T;
        return v as T;
      }
    }
    return substitute(value, vars) as T;
  }
  if (Array.isArray(value)) return value.map((x) => resolveVars(x, vars, typed)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVars(v, vars, typed);
    return out as T;
  }
  return value;
}

/**
 * Parses the one-option-per-line text used in the view settings:
 *   left; setpoint=arm/left/setpoint; dev_id=115
 */
export function parseOptionLines(lines: string[]): VarOption[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [head, ...rest] = line.split(";").map((s) => s.trim());
      if (!rest.length) return head!;
      const set: Record<string, string> = {};
      let label: string | undefined;
      for (const kv of rest) {
        const eq = kv.indexOf("=");
        if (eq <= 0) continue;
        const k = kv.slice(0, eq).trim(), v = kv.slice(eq + 1).trim();
        if (k === "label") label = v;
        else set[k] = v;
      }
      const opt: VarOptionObject = { value: head! };
      if (label) opt.label = label;
      if (Object.keys(set).length) opt.set = set;
      return opt;
    });
}

export function formatOptionLines(options: VarOption[]): string[] {
  return options.map((o) => {
    if (typeof o === "string") return o;
    const parts = [o.value];
    if (o.label) parts.push(`label=${o.label}`);
    for (const [k, v] of Object.entries(o.set || {})) parts.push(`${k}=${v}`);
    return parts.join("; ");
  });
}

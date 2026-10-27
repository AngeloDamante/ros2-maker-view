// Editable form over the primitive fields of a message template, shared by
// the publish and service widgets. Field kinds come from the schema when the
// bridge knows the type, otherwise from the template values.

import { fieldAt, isIntegerType, isNumericType, type Definitions } from "../bridge/schema.ts";
import { objectLeaves, setPath } from "../lib/path.ts";
import { toJsonSafe } from "../lib/format.ts";

type InputKind = "bool" | "number" | "integer" | "string" | "json";

function kindOf(path: string, sample: unknown, defs?: Definitions): InputKind {
  const f = defs ? fieldAt(defs, path) : undefined;
  if (f && !/\[\d+\]$/.test(path) && f.isArray) return "json";
  if (f && !f.isComplex) {
    if (f.type === "bool") return "bool";
    if (isIntegerType(f.type)) return "integer";
    if (isNumericType(f.type)) return "number";
    if (f.type === "string" || f.type === "wstring") return "string";
  }
  if (typeof sample === "boolean") return "bool";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string") return "string";
  return "json";
}

function display(v: unknown, kind: InputKind): string | boolean {
  if (kind === "bool") return Boolean(v);
  if (kind === "json") return JSON.stringify(toJsonSafe(v));
  return v === undefined || v === null ? "" : String(v);
}

export interface FormLeaf {
  path: string;
  kind: InputKind;
  initial: unknown;
}

export function formLeaves(base: Record<string, unknown>, defs: Definitions | undefined, opts: { fields?: string[]; hideStamp?: boolean }): FormLeaf[] {
  const wanted = (opts.fields || []).map((f) => f.trim()).filter(Boolean);
  return objectLeaves(base)
    .filter(([p]) => p !== "")
    .filter(([p]) => !opts.hideStamp || !/(^|\.)stamp(\.|$)/.test(p))
    .filter(([p]) => !wanted.length || wanted.some((w) => p === w || p.startsWith(w + ".") || p.startsWith(w + "[")))
    .map(([path, v]) => ({ path, kind: kindOf(path, v, defs), initial: v }));
}

/** Applies the edited values to the template; returns errors for invalid inputs. */
export function buildMessage(base: Record<string, unknown>, leaves: FormLeaf[], values: Record<string, string | boolean>): { msg: Record<string, unknown>; errors: string[] } {
  let msg = base;
  const errors: string[] = [];
  for (const leaf of leaves) {
    if (!(leaf.path in values)) continue;
    const raw = values[leaf.path]!;
    let v: unknown;
    switch (leaf.kind) {
      case "bool":
        v = Boolean(raw);
        break;
      case "number":
      case "integer": {
        const n = Number(raw);
        if (String(raw).trim() === "" || !Number.isFinite(n)) {
          errors.push(`${leaf.path}: not a number`);
          continue;
        }
        if (leaf.kind === "integer" && !Number.isInteger(n)) {
          errors.push(`${leaf.path}: must be an integer`);
          continue;
        }
        v = n;
        break;
      }
      case "string":
        v = String(raw);
        break;
      case "json":
        try {
          v = JSON.parse(String(raw));
        } catch {
          errors.push(`${leaf.path}: invalid JSON`);
          continue;
        }
    }
    msg = setPath(msg, leaf.path, v);
  }
  return { msg, errors };
}

export function MessageForm({
  leaves,
  values,
  onChange,
  onSubmit,
}: {
  leaves: FormLeaf[];
  values: Record<string, string | boolean>;
  onChange: (v: Record<string, string | boolean>) => void;
  onSubmit?: () => void;
}) {
  if (!leaves.length) return <div className="muted small-text">No fields: the template is sent as is.</div>;
  return (
    <div className="msg-form">
      {leaves.map((leaf) => {
        const cur = leaf.path in values ? values[leaf.path]! : display(leaf.initial, leaf.kind);
        const set = (v: string | boolean) => onChange({ ...values, [leaf.path]: v });
        return (
          <label key={leaf.path} className={"msg-field" + (leaf.kind === "bool" ? " bool" : "")}>
            <span className="name mono" title={leaf.path}>
              {leaf.path}
            </span>
            {leaf.kind === "bool" ? (
              <input type="checkbox" checked={Boolean(cur)} onChange={(e) => set(e.target.checked)} />
            ) : (
              <input
                type={leaf.kind === "number" || leaf.kind === "integer" ? "number" : "text"}
                step={leaf.kind === "integer" ? 1 : "any"}
                className={leaf.kind === "json" ? "mono" : undefined}
                value={String(cur)}
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onSubmit) onSubmit();
                }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

// ROS 2 message definitions as advertised by foxglove_bridge: parsing,
// default messages (templates for publishers) and field-path discovery.

import { parse as parseRosMsg } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import type { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";
import { parsePath } from "../lib/path.ts";

export type Definitions = MessageDefinition[];

const cache = new Map<string, Definitions>();

/** Parses a schema; the root definition is always first. */
export function parseSchema(schemaName: string, schemaEncoding: string | undefined, schema: string): Definitions {
  const key = `${schemaName}\0${schemaEncoding}\0${schema}`;
  let defs = cache.get(key);
  if (defs) return defs;
  if (schemaEncoding === "ros2idl") {
    defs = parseRos2idl(schema);
    const root = defs.findIndex((d) => d.name === schemaName);
    if (root > 0) defs = [defs[root]!, ...defs.slice(0, root), ...defs.slice(root + 1)];
  } else if (!schemaEncoding || schemaEncoding === "ros2msg") {
    defs = parseRosMsg(schema, { ros2: true });
  } else {
    throw new Error(`Unsupported schema encoding "${schemaEncoding}"`);
  }
  cache.set(key, defs);
  return defs;
}

const INTEGER = new Set(["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "byte", "char"]);
const FLOAT = new Set(["float32", "float64"]);

export function isNumericType(t: string): boolean {
  return INTEGER.has(t) || FLOAT.has(t);
}
export function isIntegerType(t: string): boolean {
  return INTEGER.has(t);
}

function findDef(defs: Definitions, type: string): MessageDefinition | undefined {
  return defs.find((d) => d.name === type);
}

function fields(def: MessageDefinition | undefined): MessageDefinitionField[] {
  return def ? def.definitions.filter((f) => !f.isConstant) : [];
}

function defaultScalar(defs: Definitions, f: MessageDefinitionField, depth: number): unknown {
  if (f.type === "time" || f.type === "duration") return { sec: 0, nanosec: 0 };
  if (f.isComplex) return depth > 16 ? {} : defaultFor(defs, findDef(defs, f.type), depth + 1);
  if (f.type === "bool") return false;
  if (f.type === "string" || f.type === "wstring") return "";
  return 0;
}

function defaultFor(defs: Definitions, def: MessageDefinition | undefined, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields(def)) {
    if (f.defaultValue !== undefined && !f.isComplex) out[f.name] = f.defaultValue;
    else if (f.isArray) out[f.name] = f.arrayLength ? Array.from({ length: f.arrayLength }, () => defaultScalar(defs, f, depth)) : [];
    else out[f.name] = defaultScalar(defs, f, depth);
  }
  return out;
}

/** A message with every field set to its zero/default value. */
export function defaultMessage(defs: Definitions): Record<string, unknown> {
  return defaultFor(defs, defs[0], 0);
}

export interface LeafPath {
  path: string;
  type: string;
  numeric: boolean;
}

/** Primitive field paths of a message type (arrays are expanded up to `maxArray` items). */
export function leafPaths(defs: Definitions, maxArray = 4, maxLeaves = 400): LeafPath[] {
  const out: LeafPath[] = [];
  const walk = (def: MessageDefinition | undefined, prefix: string, depth: number) => {
    for (const f of fields(def)) {
      if (out.length >= maxLeaves) return;
      const base = prefix ? `${prefix}.${f.name}` : f.name;
      const names = f.isArray ? Array.from({ length: Math.min(f.arrayLength ?? 1, maxArray) }, (_, i) => `${base}[${i}]`) : [base];
      for (const p of names) {
        if (f.type === "time" || f.type === "duration") {
          out.push({ path: `${p}.sec`, type: "int32", numeric: true }, { path: `${p}.nanosec`, type: "uint32", numeric: true });
        } else if (f.isComplex) {
          if (depth < 8) walk(findDef(defs, f.type), p, depth + 1);
        } else {
          out.push({ path: p, type: f.type, numeric: isNumericType(f.type) || f.type === "bool" });
        }
      }
    }
  };
  walk(defs[0], "", 0);
  return out;
}

/** Definition of the field at `path` (array indices are skipped), or undefined. */
export function fieldAt(defs: Definitions, path: string): MessageDefinitionField | undefined {
  let def: MessageDefinition | undefined = defs[0];
  let field: MessageDefinitionField | undefined;
  let timeLeaf = false;
  for (const t of parsePath(path)) {
    if (typeof t === "number") continue;
    if (timeLeaf) return { name: t, type: t === "sec" ? "int32" : "uint32" };
    field = fields(def).find((f) => f.name === t);
    if (!field) return undefined;
    if (field.type === "time" || field.type === "duration") timeLeaf = true;
    def = field.isComplex ? findDef(defs, field.type) : undefined;
  }
  return field;
}

function nowStamp() {
  const ms = Date.now();
  return { sec: Math.floor(ms / 1000), nanosec: (ms % 1000) * 1e6 };
}

/**
 * Sets every `stamp` time field to the current wall-clock time.
 * Uses the schema when available (also creating a missing header.stamp),
 * otherwise any `stamp: {sec, nanosec}` object found in the message.
 */
export function stampMessage<T>(msg: T, defs?: Definitions): T {
  if (defs) {
    const walk = (obj: any, def: MessageDefinition | undefined, depth: number): any => {
      const out = obj && typeof obj === "object" && !Array.isArray(obj) ? { ...obj } : {};
      for (const f of fields(def)) {
        if (f.isArray) continue;
        if (f.type === "time" && f.name === "stamp") out[f.name] = nowStamp();
        else if (f.isComplex && depth < 8) {
          const sub = findDef(defs, f.type);
          if (sub && hasStamp(defs, sub, depth + 1)) out[f.name] = walk(out[f.name], sub, depth + 1);
        }
      }
      return out;
    };
    return walk(msg, defs[0], 0);
  }
  const walk = (obj: any, depth: number): any => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth > 8) return obj;
    const out: any = { ...obj };
    for (const [k, v] of Object.entries(out)) {
      if (k === "stamp" && v && typeof v === "object" && "sec" in v) out[k] = nowStamp();
      else if (v && typeof v === "object") out[k] = walk(v, depth + 1);
    }
    return out;
  };
  return walk(msg, 0);
}

function hasStamp(defs: Definitions, def: MessageDefinition, depth: number): boolean {
  if (depth > 8) return false;
  return fields(def).some(
    (f) => !f.isArray && ((f.type === "time" && f.name === "stamp") || (f.isComplex && hasStamp(defs, findDef(defs, f.type) ?? { definitions: [] }, depth + 1))),
  );
}

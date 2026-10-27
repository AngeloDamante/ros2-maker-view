// Field paths into decoded messages: "data", "pose.position.x", "ranges[0]",
// "points[-1].y" (negative indices count from the end). "" is the whole message.

export type PathToken = string | number;

const cache = new Map<string, PathToken[]>();

export function parsePath(path: string): PathToken[] {
  let tokens = cache.get(path);
  if (tokens) return tokens;
  tokens = [];
  const re = /\[(-?\d+)\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) tokens.push(m[1] !== undefined ? Number(m[1]) : m[2]!);
  cache.set(path, tokens);
  return tokens;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const t of parsePath(path)) {
    if (cur == null) return undefined;
    if (typeof t === "number") {
      const len = cur.length;
      if (typeof len !== "number") return undefined;
      cur = cur[t < 0 ? len + t : t];
    } else {
      cur = cur[t];
    }
  }
  return typeof cur === "bigint" ? Number(cur) : cur;
}

/** Returns a copy of `obj` with `value` written at `path` (intermediate objects are created). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const tokens = parsePath(path);
  if (!tokens.length) return value as T;
  const write = (cur: any, i: number): any => {
    const t = tokens[i]!;
    const copy = Array.isArray(cur) ? [...cur] : cur && typeof cur === "object" ? { ...cur } : typeof t === "number" ? [] : {};
    const key = typeof t === "number" && t < 0 ? copy.length + t : t;
    copy[key] = i === tokens.length - 1 ? value : write(copy[key], i + 1);
    return copy;
  };
  return write(obj, 0);
}

/** Numeric view of a field value (booleans become 0/1), or undefined. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** All primitive leaves of a plain object, as [path, value] pairs. Arrays of primitives are one leaf. */
export function objectLeaves(obj: unknown, prefix = ""): [string, unknown][] {
  if (obj === null || typeof obj !== "object" || ArrayBuffer.isView(obj)) return [[prefix, obj]];
  if (Array.isArray(obj)) {
    if (obj.every((x) => x === null || typeof x !== "object")) return [[prefix, obj]];
    return obj.flatMap((x, i) => objectLeaves(x, `${prefix}[${i}]`));
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length) return prefix ? [[prefix, obj]] : [];
  return entries.flatMap(([k, v]) => objectLeaves(v, prefix ? `${prefix}.${k}` : k));
}

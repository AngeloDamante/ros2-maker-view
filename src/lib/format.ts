export function fmtNumber(v: number | undefined | null, decimals?: number): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (decimals !== undefined && decimals !== null && Number.isFinite(decimals)) return v.toFixed(Math.max(0, Math.min(10, decimals)));
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(3);
  if (Number.isInteger(v)) return String(v);
  return a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(3) : v.toFixed(4);
}

export function fmtValue(v: unknown, decimals?: number): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "number") return fmtNumber(v, decimals);
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(toJsonSafe(v));
  } catch {
    return String(v);
  }
}

/** Converts typed arrays and bigints so the value can go through JSON.stringify. */
export function toJsonSafe(v: unknown, maxArray = Infinity): unknown {
  if (typeof v === "bigint") return Number(v);
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) v = Array.from(v as unknown as ArrayLike<number | bigint>, (x) => (typeof x === "bigint" ? Number(x) : x));
  if (Array.isArray(v)) {
    const items = v.slice(0, maxArray).map((x) => toJsonSafe(x, maxArray));
    if (v.length > maxArray) items.push(`… ${v.length - maxArray} more`);
    return items;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = toJsonSafe(x, maxArray);
    return out;
  }
  return v;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function fmtAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

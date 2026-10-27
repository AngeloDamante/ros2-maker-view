// Parameter dump in the format of `ros2 param dump`, loadable with
// `--ros-args --params-file <file>`:
//
//   /ns/node:
//     ros__parameters:
//       gain: 2.0
//       limits:
//       - 1.0
//       - 2.0
//
// Dotted names ("pid.kp") become nested maps, as ros2 param dump does.
// Doubles always keep a decimal point, otherwise ROS would load them as integers.

export interface DumpParam {
  /** Parameter name without the node prefix. */
  name: string;
  value: unknown;
  /** foxglove_bridge type tag: "float64", "float64_array", "byte_array" or undefined. */
  type?: string;
}

const PLAIN = /^[A-Za-z_/][\w./-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|y|n|null|~)$/i;

function scalar(v: unknown, isDouble: boolean): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? ".nan" : v > 0 ? ".inf" : "-.inf";
    if (isDouble && Number.isInteger(v)) return v.toFixed(1);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v ?? "");
  // JSON strings are valid YAML double-quoted scalars
  return PLAIN.test(s) && !RESERVED.test(s) ? s : JSON.stringify(s);
}

interface Tree {
  [key: string]: Tree | DumpParam;
}

function isParam(x: Tree | DumpParam): x is DumpParam {
  return typeof (x as DumpParam).name === "string" && "value" in x;
}

function key(k: string): string {
  return PLAIN.test(k) && !RESERVED.test(k) ? k : JSON.stringify(k);
}

function emit(tree: Tree, indent: string, out: string[]) {
  for (const k of Object.keys(tree).sort()) {
    const node = tree[k]!;
    if (!isParam(node)) {
      out.push(`${indent}${key(k)}:`);
      emit(node, indent + "  ", out);
      continue;
    }
    const doubles = node.type === "float64" || node.type === "float64_array";
    if (Array.isArray(node.value)) {
      if (!node.value.length) out.push(`${indent}${key(k)}: []`);
      else {
        out.push(`${indent}${key(k)}:`);
        for (const item of node.value) out.push(`${indent}- ${scalar(item, doubles)}`);
      }
    } else {
      out.push(`${indent}${key(k)}: ${scalar(node.value, doubles)}`);
    }
  }
}

export function paramsToYaml(node: string, params: DumpParam[], comment?: string): string {
  const tree: Tree = {};
  for (const p of params) {
    const parts = p.name.split(".");
    let cur = tree;
    for (const part of parts.slice(0, -1)) {
      const next = cur[part];
      if (!next || isParam(next)) cur[part] = {};
      cur = cur[part] as Tree;
    }
    cur[parts[parts.length - 1]!] = p;
  }
  const out: string[] = [];
  if (comment) for (const line of comment.split("\n")) out.push(`# ${line}`);
  out.push(`${key(node)}:`, "  ros__parameters:");
  emit(tree, "    ", out);
  return out.join("\n") + "\n";
}

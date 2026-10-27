import { useEffect, useMemo, useReducer, useRef } from "react";
import { useBridge, useBridgeLog, useTicker, useTopicListener } from "../bridge/react.tsx";
import type { LogLevel } from "../bridge/client.ts";
import { fmtTime } from "../lib/format.ts";
import { loggerMatcher } from "../lib/match.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  source?: "app" | "rosout" | "both";
  rosoutTopic?: string;
  nodeFilter?: string;
  minLevel?: LogLevel | "debug";
  maxLines?: number | null;
}

interface Line {
  key: string;
  t: number;
  level: LogLevel | "debug";
  text: string;
}

const RANK: Record<string, number> = { debug: 0, info: 1, ok: 1, warn: 2, error: 3 };

// rcl_interfaces/msg/Log levels: DEBUG=10 INFO=20 WARN=30 ERROR=40 FATAL=50
function rosLevel(l: number): Line["level"] {
  return l >= 40 ? "error" : l >= 30 ? "warn" : l >= 20 ? "info" : "debug";
}

function LogWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeLog();
  const source = config.source || "app";
  const max = config.maxLines || 300;
  const ros = useRef<Line[]>([]);
  const dirty = useRef(false);
  const seq = useRef(0);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const matches = useMemo(() => loggerMatcher(config.nodeFilter), [config.nodeFilter]);
  // A different filter (e.g. another node selected in the header) starts a fresh list.
  useEffect(() => {
    ros.current = [];
    force();
  }, [config.nodeFilter, config.rosoutTopic, source]);
  useTopicListener(source === "app" ? undefined : config.rosoutTopic || "/rosout", (m: any) => {
    if (!matches(String(m?.name ?? ""))) return;
    const stamp = m?.stamp ? m.stamp.sec * 1000 + m.stamp.nanosec / 1e6 : Date.now();
    ros.current.push({ key: `r${seq.current++}`, t: stamp, level: rosLevel(m?.level ?? 20), text: `[${m?.name ?? "?"}] ${m?.msg ?? ""}` });
    if (ros.current.length > max) ros.current.splice(0, ros.current.length - max);
    dirty.current = true;
  });
  useTicker(() => {
    if (dirty.current) {
      dirty.current = false;
      force();
    }
  });

  const minRank = RANK[config.minLevel || "debug"] ?? 0;
  let lines: Line[] = [];
  if (source !== "rosout") lines = client.log.map((e) => ({ key: `a${e.id}`, t: e.t, level: e.level, text: e.text }));
  if (source !== "app") lines = lines.concat(ros.current);
  lines = lines.filter((l) => (RANK[l.level] ?? 0) >= minRank);
  if (source === "both") lines.sort((a, b) => a.t - b.t);
  lines = lines.slice(-max).reverse();

  return (
    <div className="w-log">
      <ul>
        {lines.map((l) => (
          <li key={l.key} className={l.level}>
            <span className="ts">{fmtTime(l.t)}</span>
            <span className="txt">{l.text}</span>
          </li>
        ))}
        {!lines.length && <li className="muted">no events</li>}
      </ul>
    </div>
  );
}

export const logWidget: WidgetDef = {
  type: "log",
  label: "Event log",
  description: "App events (connection, publishes, parameter results) and/or /rosout.",
  category: "Read",
  size: { w: 8, h: 7 },
  minSize: { w: 3, h: 3 },
  defaults: () => ({ source: "app", rosoutTopic: "/rosout", nodeFilter: "", minLevel: "debug", maxLines: 300 }),
  fields: [
    {
      key: "source",
      label: "Source",
      kind: "select",
      options: [
        { value: "app", label: "App events" },
        { value: "rosout", label: "/rosout" },
        { value: "both", label: "Both" },
      ],
    },
    { key: "rosoutTopic", label: "Log topic", kind: "topic", placeholder: "/rosout", showIf: (c) => c.source !== "app" },
    { key: "nodeFilter", label: "Node filter", kind: "text", placeholder: "logger name, * as wildcard", help: "e.g. my_node, my_node*, *camera*", showIf: (c) => c.source !== "app" },
    {
      key: "minLevel",
      label: "Minimum level",
      kind: "select",
      options: [
        { value: "debug", label: "Debug" },
        { value: "info", label: "Info" },
        { value: "warn", label: "Warning" },
        { value: "error", label: "Error" },
      ],
    },
    { key: "maxLines", label: "Max lines", kind: "number", placeholder: "300" },
  ],
  component: LogWidget,
};

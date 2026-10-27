import { useState } from "react";
import { useTopic } from "../bridge/react.tsx";
import { toJsonSafe } from "../lib/format.ts";
import { getPath } from "../lib/path.ts";
import { TopicFooter } from "./common.tsx";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  topic: string;
  path?: string;
  maxArray?: number | null;
}

function MessageWidget({ config }: WidgetProps<Config>) {
  const view = useTopic(config.topic);
  const [frozen, setFrozen] = useState<unknown>(undefined);
  const msg = frozen !== undefined ? frozen : view.msg;
  const value = msg === undefined ? undefined : config.path ? getPath(msg, config.path) : msg;
  let text = "";
  if (msg === undefined) text = "no message yet";
  else {
    try {
      text = JSON.stringify(toJsonSafe(value, config.maxArray ?? 20), null, 2) ?? "undefined";
    } catch (e) {
      text = String(e);
    }
  }
  return (
    <div className={"w-message" + (view.stale && frozen === undefined ? " stale" : "")}>
      <div className="w-toolbar">
        <span className="muted mono">{view.schemaName || ""}</span>
        <button className="small" onClick={() => setFrozen(frozen === undefined ? (view.msg ?? undefined) : undefined)} disabled={frozen === undefined && view.msg === undefined}>
          {frozen === undefined ? "Freeze" : "Resume"}
        </button>
      </div>
      <pre>{text}</pre>
      <TopicFooter name={config.topic} view={view} />
    </div>
  );
}

export const messageWidget: WidgetDef = {
  type: "message",
  label: "Raw message",
  description: "Latest message (or a sub-field) as JSON, like ros2 topic echo.",
  category: "Read",
  size: { w: 6, h: 8 },
  minSize: { w: 3, h: 3 },
  defaults: () => ({ topic: "", path: "", maxArray: 20 }),
  fields: [
    { key: "topic", label: "Topic", kind: "topic" },
    { key: "path", label: "Sub-field", kind: "path", topicKey: "topic", placeholder: "whole message" },
    { key: "maxArray", label: "Max array items", kind: "number", placeholder: "20" },
  ],
  component: MessageWidget,
};

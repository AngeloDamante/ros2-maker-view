import { useBridge, useBridgeVersion, type TopicView } from "../bridge/react.tsx";
import type { FieldSpec } from "./types.ts";

/** Footer line: resolved topic, rate, or why there is no data. */
export function TopicFooter({ name, view }: { name?: string; view: TopicView }) {
  const client = useBridge();
  useBridgeVersion();
  let text: string, cls = "w-foot";
  if (!name) {
    text = "no topic configured";
    cls += " warn";
  } else if (!client.connected) {
    text = `${name} · offline`;
  } else if (!view.topic) {
    text = `${name} · not advertised`;
    cls += " warn";
  } else {
    text = `${view.topic} · ${view.hz} Hz`;
    if (view.stale) cls += " stale";
  }
  return (
    <div className={cls} title={view.schemaName}>
      {text}
    </div>
  );
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="w-placeholder">{children}</div>;
}

export const SOURCE_FIELDS = (numeric: boolean): FieldSpec[] => [
  { key: "topic", label: "Topic", kind: "topic", help: "Absolute (/ns/topic) or relative: a relative name matches the first topic ending with it." },
  { key: "path", label: "Field", kind: "path", topicKey: "topic", numeric, placeholder: "data", help: "Field path, e.g. data, pose.position.x, ranges[0]" },
];

export const PUBLISH_TARGET_FIELDS: FieldSpec[] = [
  { key: "topic", label: "Topic", kind: "topic" },
  { key: "type", label: "Message type", kind: "type", topicKey: "topic", help: "Empty: taken from the topic, when it is already in the ROS graph." },
];

export const AUTOSTAMP_FIELD: FieldSpec = {
  key: "autoStamp",
  label: "Auto stamp",
  kind: "bool",
  help: "Set every `stamp` field (e.g. header.stamp) to the current time before publishing.",
};

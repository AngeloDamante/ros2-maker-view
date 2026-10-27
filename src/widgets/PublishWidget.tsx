import { useEffect, useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { defaultMessage, stampMessage } from "../bridge/schema.ts";
import { fmtTime } from "../lib/format.ts";
import { AUTOSTAMP_FIELD, PUBLISH_TARGET_FIELDS } from "./common.tsx";
import { buildMessage, formLeaves, MessageForm } from "./MessageForm.tsx";
import { rateField, rateOf, useRepeater } from "./repeat.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  topic: string;
  type?: string;
  template?: Record<string, unknown>;
  fields?: string[];
  autoStamp?: boolean;
  sendLabel?: string;
  repeatHz?: number | null;
}

export function isEmptyObject(v: unknown): boolean {
  return !v || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
}

export interface SendStatus {
  ok: boolean;
  text: string;
}

export function StatusLine({ status }: { status: SendStatus | null }) {
  if (!status) return null;
  return <div className={"w-status " + (status.ok ? "ok" : "bad")}>{status.text}</div>;
}

/** Advertises the publisher as soon as the bridge is connected (first message not lost). */
export function usePreparedPublisher(topic: string, type?: string) {
  const client = useBridge();
  const version = useBridgeVersion();
  useEffect(() => {
    if (topic) client.preparePublisher(topic, type || undefined);
  }, [client, topic, type, version]);
}

function PublishWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeVersion();
  usePreparedPublisher(config.topic, config.type);
  const type = client.publishType(config.topic, config.type || undefined);
  const defs = client.definitionsFor(type);
  const base = (isEmptyObject(config.template) && defs ? defaultMessage(defs) : config.template || {}) as Record<string, unknown>;
  const autoStamp = config.autoStamp !== false;
  const leaves = formLeaves(base, defs, { fields: config.fields, hideStamp: autoStamp });
  const baseKey = JSON.stringify(base);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<SendStatus | null>(null);
  useEffect(() => setValues({}), [baseKey]);

  const send = (quiet = false): boolean => {
    const { msg, errors } = buildMessage(base, leaves, values);
    if (errors.length) {
      setStatus({ ok: false, text: errors.join(" · ") });
      return false;
    }
    try {
      const topic = client.publish(config.topic, autoStamp ? stampMessage(msg, defs) : msg, config.type || undefined);
      if (!quiet) {
        setStatus({ ok: true, text: `Sent to ${topic} · ${fmtTime(Date.now())}` });
        client.addLog("info", `Published on ${topic}`);
      }
      return true;
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
      if (!quiet) client.addLog("error", `Publish on ${config.topic}: ${(e as Error).message}`);
      return false;
    }
  };

  const hz = rateOf(config.repeatHz);
  const repeat = useRepeater(hz, () => send(true));
  const toggle = () => {
    client.addLog("info", `${repeat.running ? "Stopped" : "Started"} publishing at ${hz} Hz on ${client.publishTopic(config.topic)}`);
    if (!repeat.running) setStatus(null);
    repeat.setRunning(!repeat.running);
  };

  return (
    <div className="w-publish">
      <div className="w-scroll">
        <MessageForm leaves={leaves} values={values} onChange={setValues} onSubmit={() => send()} />
      </div>
      <div className="w-actions">
        <button className="primary" onClick={() => send()} disabled={!config.topic}>
          {config.sendLabel || "Publish"}
        </button>
        {hz > 0 && (
          <button className={repeat.running ? "on streaming" : ""} onClick={toggle} disabled={!config.topic}>
            {repeat.running ? `■ Stop ${hz} Hz` : `▶ Start ${hz} Hz`}
          </button>
        )}
        <button className="small" onClick={() => setValues({})} title="Reset the form to the template">
          Reset
        </button>
        <span className="muted mono grow-ellipsis" title={type}>
          {type || "type unknown"}
        </span>
      </div>
      <StatusLine status={repeat.running && (!status || status.ok) ? { ok: true, text: `● publishing at ${hz} Hz on ${client.publishTopic(config.topic)} · ${repeat.sent} sent` } : status} />
    </div>
  );
}

export const publishWidget: WidgetDef = {
  type: "publish",
  label: "Publisher form",
  description: "Form generated from the message type: edit fields and publish (once or repeatedly).",
  category: "Write",
  size: { w: 6, h: 7 },
  minSize: { w: 3, h: 3 },
  defaults: () => ({ topic: "", type: "", template: {}, fields: [], autoStamp: true, sendLabel: "Publish", repeatHz: null }),
  fields: [
    ...PUBLISH_TARGET_FIELDS,
    {
      key: "template",
      label: "Message template",
      kind: "message",
      topicKey: "topic",
      typeKey: "type",
      help: "Initial values (JSON). Empty {} = all fields of the type at zero.",
    },
    { key: "fields", label: "Fields shown", kind: "stringList", placeholder: "one path per line (empty = all)", help: "The other fields are sent with the template value." },
    AUTOSTAMP_FIELD,
    { key: "sendLabel", label: "Button label", kind: "text", placeholder: "Publish" },
    rateField("Empty: the button publishes once. With a rate, a Start/Stop switch publishes the current form values continuously."),
  ],
  component: PublishWidget,
};

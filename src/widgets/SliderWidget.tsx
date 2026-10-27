import { useEffect, useRef, useState } from "react";
import { useBridge, useBridgeVersion, useTopic } from "../bridge/react.tsx";
import { defaultMessage, fieldAt, isIntegerType, stampMessage } from "../bridge/schema.ts";
import { fmtNumber, fmtTime } from "../lib/format.ts";
import { getPath, setPath, toNumber } from "../lib/path.ts";
import { AUTOSTAMP_FIELD, PUBLISH_TARGET_FIELDS } from "./common.tsx";
import { isEmptyObject, StatusLine, usePreparedPublisher, type SendStatus } from "./PublishWidget.tsx";
import { rateField, rateOf, useRepeater } from "./repeat.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  topic: string;
  type?: string;
  path?: string;
  template?: Record<string, unknown>;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  initial?: number | null;
  mode?: "release" | "continuous";
  presets?: string[];
  unit?: string;
  autoStamp?: boolean;
  feedbackTopic?: string;
  feedbackPath?: string;
  decimals?: number | null;
  repeatHz?: number | null;
}

function SliderWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeVersion();
  usePreparedPublisher(config.topic, config.type);
  const min = config.min ?? -100, max = config.max ?? 100, step = config.step || 1;
  const [value, setValue] = useState<number>(config.initial ?? Math.min(max, Math.max(min, 0)));
  const [text, setText] = useState(String(value));
  const [status, setStatus] = useState<SendStatus | null>(null);
  const lastSent = useRef(0);
  const feedback = useTopic(config.feedbackTopic || undefined);
  const fb = config.feedbackTopic && feedback.msg !== undefined && !feedback.stale ? toNumber(getPath(feedback.msg, config.feedbackPath || "data")) : undefined;
  useEffect(() => setText(String(value)), [value]);

  /** "action": status + log; "drag": status only; "stream": nothing unless it fails. */
  const send = (v: number, kind: "action" | "drag" | "stream" = "action"): boolean => {
    if (!Number.isFinite(v)) {
      setStatus({ ok: false, text: "Invalid value" });
      return false;
    }
    const type = client.publishType(config.topic, config.type || undefined);
    const defs = client.definitionsFor(type);
    const path = config.path || "data";
    const f = defs ? fieldAt(defs, path) : undefined;
    const x = f && isIntegerType(f.type) ? Math.round(v) : v;
    const base = isEmptyObject(config.template) && defs ? defaultMessage(defs) : config.template || {};
    const msg = setPath(base, path, x);
    try {
      const topic = client.publish(config.topic, config.autoStamp !== false ? stampMessage(msg, defs) : msg, config.type || undefined);
      lastSent.current = performance.now();
      if (kind !== "stream") setStatus({ ok: true, text: `${path} = ${x} → ${topic} · ${fmtTime(Date.now())}` });
      if (kind === "action") client.addLog("info", `${path} = ${x} → ${topic}`);
      return true;
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
      return false;
    }
  };

  // With a rate, Stream/Stop publishes the current value continuously; moving the
  // slider while streaming changes the value being sent.
  const hz = rateOf(config.repeatHz);
  const valueRef = useRef(value);
  valueRef.current = value;
  const repeat = useRepeater(hz, () => send(valueRef.current, "stream"));
  const toggleStream = () => {
    client.addLog("info", `${repeat.running ? "Stopped" : "Started"} streaming ${config.path || "data"} at ${hz} Hz on ${client.publishTopic(config.topic)}`);
    if (!repeat.running) setStatus(null);
    repeat.setRunning(!repeat.running);
  };

  const onSlide = (v: number) => {
    setValue(v);
    // continuous mode without a rate: throttle to 20 Hz while dragging
    if (hz <= 0 && config.mode === "continuous" && performance.now() - lastSent.current > 50) send(v, "drag");
  };
  const commit = (v: number) => {
    setValue(v);
    // while streaming the next periodic message carries the new value
    if (!repeat.running) send(v);
  };
  const presets = (config.presets || []).map((p) => Number(p)).filter((p) => Number.isFinite(p));

  return (
    <div className="w-slider">
      <div className="slider-head">
        <span className="big-num">
          {fmtNumber(value, config.decimals ?? undefined)}
          {config.unit ? <span className="unit">{config.unit}</span> : null}
        </span>
        {config.feedbackTopic ? (
          <span className={"feedback" + (fb === undefined ? " stale" : "")}>
            measured {fmtNumber(fb, config.decimals ?? undefined)}
            {config.unit ? ` ${config.unit}` : ""}
          </span>
        ) : null}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onSlide(Number(e.target.value))}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End") commit(Number((e.target as HTMLInputElement).value));
        }}
      />
      <div className="slider-scale">
        <span>{fmtNumber(min)}</span>
        <span>{fmtNumber(max)}</span>
      </div>
      <div className="w-actions">
        <input
          type="number"
          className="num-input"
          value={text}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(Number(text));
          }}
        />
        <button className="primary" onClick={() => commit(Number(text))} disabled={!config.topic}>
          Send
        </button>
        {hz > 0 && (
          <button className={repeat.running ? "on streaming" : ""} onClick={toggleStream} disabled={!config.topic}>
            {repeat.running ? `■ Stop ${hz} Hz` : `▶ Stream ${hz} Hz`}
          </button>
        )}
        {presets.map((p, i) => (
          <button key={i} className="small" onClick={() => commit(p)} disabled={!config.topic}>
            {p > 0 && min < 0 ? `+${p}` : p}
          </button>
        ))}
      </div>
      <StatusLine
        status={
          repeat.running && (!status || status.ok)
            ? { ok: true, text: `● ${config.path || "data"} = ${value} at ${hz} Hz on ${client.publishTopic(config.topic)} · ${repeat.sent} sent` }
            : status
        }
      />
    </div>
  );
}

export const sliderWidget: WidgetDef = {
  type: "slider",
  label: "Slider / setpoint",
  description: "Numeric setpoint with slider, input box and presets; optional measured feedback.",
  category: "Write",
  size: { w: 6, h: 5 },
  minSize: { w: 3, h: 4 },
  defaults: () => ({ topic: "", type: "", path: "data", template: {}, min: -100, max: 100, step: 1, mode: "release", presets: [], unit: "", autoStamp: true, feedbackTopic: "", feedbackPath: "data", repeatHz: null }),
  fields: [
    ...PUBLISH_TARGET_FIELDS,
    { key: "path", label: "Field", kind: "path", topicKey: "topic", numeric: true, placeholder: "data" },
    { key: "template", label: "Other fields", kind: "message", topicKey: "topic", typeKey: "type", help: "Template for the rest of the message (JSON)." },
    { key: "min", label: "Min", kind: "number", placeholder: "-100" },
    { key: "max", label: "Max", kind: "number", placeholder: "100" },
    { key: "step", label: "Step", kind: "number", placeholder: "1" },
    { key: "initial", label: "Initial value", kind: "number", placeholder: "0" },
    rateField("Empty: the value is published once (on release, Enter, Send or a preset). With a rate, a Stream/Stop switch publishes the current value continuously."),
    {
      key: "mode",
      label: "Send",
      kind: "select",
      showIf: (c) => !rateOf(c.repeatHz),
      options: [
        { value: "release", label: "On release / Enter" },
        { value: "continuous", label: "Continuously while dragging (20 Hz)" },
      ],
    },
    { key: "presets", label: "Presets", kind: "stringList", placeholder: "one value per line, e.g. -30" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "decimals", label: "Decimals", kind: "number", placeholder: "auto" },
    { key: "feedbackTopic", label: "Feedback topic", kind: "topic", help: "Optional measured value shown next to the setpoint." },
    { key: "feedbackPath", label: "Feedback field", kind: "path", topicKey: "feedbackTopic", numeric: true, placeholder: "data" },
    AUTOSTAMP_FIELD,
  ],
  component: SliderWidget,
};

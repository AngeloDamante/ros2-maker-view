import { useEffect, useRef, useState } from "react";
import { useBridge } from "../bridge/react.tsx";
import { stampMessage } from "../bridge/schema.ts";
import { cssColor } from "../lib/colors.ts";
import { fmtTime } from "../lib/format.ts";
import { paramValueFromText, sameValue } from "../lib/paramValue.ts";
import { AUTOSTAMP_FIELD, PUBLISH_TARGET_FIELDS } from "./common.tsx";
import { isParamTarget, PARAM_TARGET_FIELDS, TARGET_FIELD, topicOnly, useParam } from "./param.ts";
import { StatusLine, usePreparedPublisher, type SendStatus } from "./PublishWidget.tsx";
import { rateField, rateOf, useRepeater } from "./repeat.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface ButtonSpec {
  label: string;
  message: unknown;
  /** Parameter target: the value to set, as typed (JSON or text). */
  value?: string;
  color?: string;
  confirm?: boolean;
}

interface Config {
  target?: "topic" | "param";
  topic: string;
  node?: string;
  param?: string;
  type?: string;
  autoStamp?: boolean;
  buttons?: ButtonSpec[];
  layout?: "row" | "column" | "grid";
  showActive?: boolean;
  repeatHz?: number | null;
}

function ButtonsWidget({ config, widget }: WidgetProps<Config>) {
  const client = useBridge();
  const toParam = isParamTarget(config);
  usePreparedPublisher(toParam ? "" : config.topic, config.type);
  const param = useParam(toParam ? config.node : "", config.param);
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (armed === null) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  /** Publishes the message of button i; returns false on error. */
  const publishButton = (i: number, quiet: boolean): boolean => {
    const b = (config.buttons || [])[i];
    if (!b) return false;
    let msg = b.message ?? {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        setStatus({ ok: false, text: `"${b.label}": message is not valid JSON` });
        return false;
      }
    }
    try {
      const defs = client.definitionsFor(client.publishType(config.topic, config.type || undefined));
      const topic = client.publish(config.topic, config.autoStamp !== false ? stampMessage(msg, defs) : msg, config.type || undefined);
      if (!quiet) {
        setStatus({ ok: true, text: `${b.label} → ${topic} · ${fmtTime(Date.now())}` });
        client.addLog("info", `${widget.title || "Button"} "${b.label}" → ${topic}`);
      }
      return true;
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
      client.addLog("error", `"${b.label}" on ${config.topic}: ${(e as Error).message}`);
      return false;
    }
  };

  // With a rate, a button is an on/off switch: one button at a time publishes continuously.
  const hz = toParam ? 0 : rateOf(config.repeatHz);
  const streamIdx = useRef<number | null>(null);
  const repeat = useRepeater(hz, () => streamIdx.current !== null && publishButton(streamIdx.current, true));
  const streaming = repeat.running ? streamIdx.current : null;

  const press = (i: number, b: ButtonSpec) => {
    if (hz > 0 && streaming === i) {
      repeat.setRunning(false);
      client.addLog("info", `Stopped "${b.label}" on ${client.publishTopic(config.topic)}`);
      return;
    }
    if (b.confirm && armed !== i) {
      setArmed(i);
      return;
    }
    setArmed(null);
    if (toParam) {
      setStatus({ ok: true, text: `${b.label} → ${param.short} …` });
      param.set(b.value ?? "").then((r) => setStatus({ ok: r.ok, text: r.ok ? `${b.label} → ${param.full} · ${fmtTime(Date.now())}` : `${b.label}: ${r.text}` }));
    } else if (hz > 0) {
      streamIdx.current = i;
      setStatus(null);
      setActive(i);
      repeat.setRunning(true);
      client.addLog("info", `Publishing "${b.label}" at ${hz} Hz on ${client.publishTopic(config.topic)}`);
    } else if (publishButton(i, false)) {
      setActive(i);
    }
  };

  const buttons = config.buttons || [];
  // Parameter target: the highlighted button is the one matching the value on the node.
  const current = param.param;
  const isActive = (i: number) => {
    if (!toParam) return !!config.showActive && active === i;
    if (!current) return false;
    const v = paramValueFromText(current, buttons[i]?.value ?? "");
    return v.error === undefined && sameValue(v.value, current.value);
  };
  const ready = toParam ? !!param.full : !!config.topic;
  return (
    <div className="w-buttons">
      <div className={`btns ${config.layout || "row"}`}>
        {buttons.map((b, i) => {
          const colored = b.color && b.color !== "default";
          const style = colored ? { background: cssColor(b.color), borderColor: cssColor(b.color), color: "#fff" } : undefined;
          return (
            <button
              key={i}
              className={"big-btn" + (isActive(i) ? " active" : "") + (armed === i ? " armed" : "") + (streaming === i ? " streaming" : "")}
              title={hz > 0 ? (streaming === i ? `Publishing at ${hz} Hz: click to stop` : `Click to publish at ${hz} Hz`) : undefined}
              style={style}
              onClick={() => press(i, b)}
              disabled={!ready}
            >
              {armed === i ? `Confirm: ${b.label || `#${i + 1}`}?` : b.label || `#${i + 1}`}
              {hz > 0 && armed !== i && <span className="rate-tag">{streaming === i ? `■ ${hz} Hz` : `▶ ${hz} Hz`}</span>}
            </button>
          );
        })}
        {!buttons.length && <span className="muted">No buttons configured</span>}
      </div>
      <StatusLine
        status={
          streaming !== null && (!status || status.ok)
            ? { ok: true, text: `● "${buttons[streaming]?.label}" at ${hz} Hz on ${client.publishTopic(config.topic)} · ${repeat.sent} sent` }
            : status ?? (toParam && param.error ? { ok: false, text: param.error } : null)
        }
      />
    </div>
  );
}

export const buttonsWidget: WidgetDef = {
  type: "buttons",
  label: "Buttons",
  description: "One or more buttons, each publishing a fixed message or setting a parameter (commands, modes, presets).",
  category: "Write",
  size: { w: 6, h: 3 },
  minSize: { w: 2, h: 2 },
  defaults: () => ({
    target: "topic",
    topic: "",
    node: "",
    param: "",
    type: "",
    autoStamp: true,
    layout: "row",
    showActive: false,
    repeatHz: null,
    buttons: [
      { label: "Off", message: { data: 0 }, value: "false", color: "", confirm: false },
      { label: "On", message: { data: 1 }, value: "true", color: "accent", confirm: false },
    ],
  }),
  fields: [
    TARGET_FIELD,
    ...topicOnly(PUBLISH_TARGET_FIELDS),
    ...PARAM_TARGET_FIELDS,
    {
      key: "buttons",
      label: "Buttons",
      kind: "list",
      fields: [
        { key: "label", label: "Label", kind: "text" },
        ...topicOnly([{ key: "message", label: "Message", kind: "message", topicKey: "topic", typeKey: "type" }]),
        {
          key: "value",
          label: "Value",
          kind: "text",
          placeholder: "e.g. true, 2.5, fast, [1, 2]",
          help: "Converted to the parameter's type (an integer parameter needs a whole number).",
          showIf: (_c, root) => isParamTarget(root),
        },
        { key: "color", label: "Color", kind: "color" },
        { key: "confirm", label: "Ask confirmation", kind: "bool", help: "First click arms the button, second click sends." },
      ],
      newItem: () => ({ label: "Send", message: {}, value: "", color: "", confirm: false }),
      itemLabel: (b) => b.label || "button",
    },
    {
      key: "layout",
      label: "Layout",
      kind: "select",
      options: [
        { value: "row", label: "Row" },
        { value: "column", label: "Column" },
        { value: "grid", label: "Grid" },
      ],
    },
    ...topicOnly([
      { key: "showActive", label: "Highlight last pressed", kind: "bool", help: "Behaves like a mode selector." },
      rateField("Empty: each click publishes once. With a rate, a click starts publishing that button's message continuously and a second click stops it (one button at a time)."),
      AUTOSTAMP_FIELD,
    ]),
  ],
  component: ButtonsWidget,
};

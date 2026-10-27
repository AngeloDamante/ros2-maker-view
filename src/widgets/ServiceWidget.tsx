import { useEffect, useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { defaultMessage, type Definitions } from "../bridge/schema.ts";
import { fmtTime, toJsonSafe } from "../lib/format.ts";
import { buildMessage, formLeaves, MessageForm } from "./MessageForm.tsx";
import { isEmptyObject, StatusLine, type SendStatus } from "./PublishWidget.tsx";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  service: string;
  template?: Record<string, unknown>;
  fields?: string[];
  buttonLabel?: string;
  confirm?: boolean;
  showResponse?: boolean;
}

function ServiceWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  useBridgeVersion();
  const svc = config.service ? client.serviceFor(config.service) : undefined;
  let defs: Definitions | undefined;
  try {
    defs = svc ? client.serviceDefinitions(svc, "request") : undefined;
  } catch {
    defs = undefined;
  }
  const base = (isEmptyObject(config.template) && defs ? defaultMessage(defs) : config.template || {}) as Record<string, unknown>;
  const leaves = formLeaves(base, defs, { fields: config.fields });
  const baseKey = JSON.stringify(base);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [response, setResponse] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  useEffect(() => setValues({}), [baseKey]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const call = async () => {
    if (config.confirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const { msg, errors } = buildMessage(base, leaves, values);
    if (errors.length) {
      setStatus({ ok: false, text: errors.join(" · ") });
      return;
    }
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await client.callService(config.service, msg);
      const ms = Math.round(performance.now() - t0);
      setResponse(res);
      const success = res && typeof res === "object" && "success" in res ? Boolean((res as any).success) : true;
      setStatus({ ok: success, text: `${success ? "Response" : "Response (success = false)"} in ${ms} ms · ${fmtTime(Date.now())}` });
      client.addLog(success ? "ok" : "warn", `Service ${svc?.name || config.service}: ${JSON.stringify(toJsonSafe(res, 8))}`);
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
      client.addLog("error", `Service ${config.service}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-service">
      <div className="w-scroll">
        {defs || !isEmptyObject(base) ? <MessageForm leaves={leaves} values={values} onChange={setValues} onSubmit={call} /> : null}
        {config.showResponse !== false && response !== undefined && <pre className="response">{JSON.stringify(toJsonSafe(response, 20), null, 2)}</pre>}
      </div>
      <div className="w-actions">
        <button className={"primary" + (armed ? " armed" : "")} onClick={call} disabled={!config.service || busy}>
          {busy ? "Calling…" : armed ? `Confirm: ${config.buttonLabel || "Call"}?` : config.buttonLabel || "Call"}
        </button>
        <span className="muted mono grow-ellipsis" title={svc?.type}>
          {svc ? `${svc.name} · ${svc.type}` : config.service ? `${config.service} · ${client.connected ? "not advertised" : "offline"}` : "no service configured"}
        </span>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export const serviceWidget: WidgetDef = {
  type: "service",
  label: "Service call",
  description: "Calls a ROS 2 service (e.g. std_srvs/Trigger) and shows the response.",
  category: "Write",
  size: { w: 6, h: 5 },
  minSize: { w: 3, h: 3 },
  defaults: () => ({ service: "", template: {}, fields: [], buttonLabel: "Call", confirm: false, showResponse: true }),
  fields: [
    { key: "service", label: "Service", kind: "service", help: "Absolute or relative name (matched like topics)." },
    { key: "template", label: "Request template", kind: "message", serviceKey: "service", help: "Empty {} = all request fields at zero." },
    { key: "fields", label: "Fields shown", kind: "stringList", placeholder: "one path per line (empty = all)" },
    { key: "buttonLabel", label: "Button label", kind: "text", placeholder: "Call" },
    { key: "confirm", label: "Ask confirmation", kind: "bool" },
    { key: "showResponse", label: "Show response", kind: "bool" },
  ],
  component: ServiceWidget,
};

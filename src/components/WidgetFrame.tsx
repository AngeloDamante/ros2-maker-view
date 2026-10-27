import { Component, useMemo, useState, type ReactNode } from "react";
import type { WidgetDoc } from "../types.ts";
import type { VarValues } from "../lib/vars.ts";
import { widgetDef } from "../widgets/index.ts";
import { resolveConfig } from "../widgets/resolve.ts";

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  render() {
    if (this.state.error) return <div className="w-error">Widget error: {this.state.error.message}</div>;
    return this.props.children;
  }
}

export function WidgetFrame({
  widget,
  editing,
  selected,
  vars,
  onConfigure,
  onDuplicate,
  onDelete,
}: {
  widget: WidgetDoc;
  editing: boolean;
  selected: boolean;
  vars: VarValues;
  onConfigure: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const def = widgetDef(widget.type);
  const [armDelete, setArmDelete] = useState(false);
  const config = useMemo(() => (def ? resolveConfig({ ...def.defaults(), ...widget.config }, def.fields, vars) : {}), [def, widget.config, vars]);
  const title = widget.title ? widget.title.replace(/\$\{(\w+)\}/g, (all, n: string) => vars[n] ?? all) : "";
  const compact = !!def?.compact;
  const showHead = !compact && (editing || !!title);
  const actions = (
    <span className="wf-actions" onMouseLeave={() => setArmDelete(false)}>
      <button className="icon" title="Configure" onClick={onConfigure}>
        ⚙
      </button>
      <button className="icon" title="Duplicate" onClick={onDuplicate}>
        ⧉
      </button>
      <button
        className={"icon danger" + (armDelete ? " armed" : "")}
        title={armDelete ? "Click again to delete" : "Delete"}
        onClick={() => (armDelete ? onDelete() : setArmDelete(true))}
      >
        {armDelete ? "✓" : "✕"}
      </button>
    </span>
  );
  return (
    <div className={"wf" + (editing ? " editing" : "") + (selected ? " selected" : "") + (compact ? " compact" : "")} data-type={widget.type}>
      {showHead && (
        <div className="wf-head">
          <span className={"wf-title" + (title ? "" : " muted")}>{title || def?.label || widget.type}</span>
          {editing && actions}
        </div>
      )}
      {compact && editing && actions}
      <div className={"wf-body" + (compact && editing ? " wf-drag" : "")}>
        {def ? (
          <ErrorBoundary resetKey={JSON.stringify(widget.config)}>
            <def.component config={config} widget={widget} editing={editing} vars={vars} />
          </ErrorBoundary>
        ) : (
          <div className="w-error">Unknown widget type "{widget.type}"</div>
        )}
      </div>
    </div>
  );
}

import { Component, useContext, useMemo, useState, type ReactNode } from "react";
import type { WidgetDoc } from "../types.ts";
import type { VarValues } from "../lib/vars.ts";
import { widgetDef } from "../widgets/index.ts";
import { resolveConfig } from "../widgets/resolve.ts";
import { cssColor } from "../lib/colors.ts";
import { EditorContext } from "./WidgetGrid.tsx";

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
  const editor = useContext(EditorContext);
  const compact = !!def?.compact;
  const container = !!def?.container;
  const showHead = container || (!compact && (editing || !!title));
  const collapsible = container && !editing && !!widget.config.collapsible && !!editor;
  const collapsed = collapsible && editor!.isCollapsed(widget.id);
  const accent = container && widget.config.color ? cssColor(widget.config.color) : undefined;
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
    <div
      className={"wf" + (editing ? " editing" : "") + (selected ? " selected" : "") + (compact ? " compact" : "") + (container ? " container" : "") + (container && widget.config.tint !== false ? " tint" : "") + (collapsed ? " collapsed" : "")}
      data-type={widget.type}
      style={accent ? ({ "--group-color": accent } as React.CSSProperties) : undefined}
    >
      {showHead && (
        <div className="wf-head" onClick={collapsible ? () => editor!.toggleCollapsed(widget.id) : undefined}>
          {collapsible && <span className="wf-chevron">{collapsed ? "▸" : "▾"}</span>}
          <span className={"wf-title" + (title || container ? "" : " muted")}>{title || (container && !editing ? "" : def?.label || widget.type)}</span>
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

import { childrenOf } from "../lib/tree.ts";
import { useEditor, WidgetGrid } from "../components/WidgetGrid.tsx";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  color?: string;
  tint?: boolean;
  collapsible?: boolean;
  startCollapsed?: boolean;
}

/**
 * A box with its own grid: its children move with it. Widgets enter it from
 * the palette or by dragging them over it, and leave it by dragging them out.
 * The title bar (title, collapse arrow) is drawn by WidgetFrame.
 */
function GroupWidget({ widget }: WidgetProps<Config>) {
  const editor = useEditor();
  if (!editor.editing && editor.isCollapsed(widget.id)) return null;
  const children = childrenOf(widget);
  return (
    <div className="group-body">
      <WidgetGrid container={widget.id} widgets={children} cols={widget.w} />
      {editor.editing && !children.length && <div className="group-empty">Drag widgets here</div>}
    </div>
  );
}

export const groupWidget: WidgetDef = {
  type: "group",
  label: "Group",
  description: "Box with a title containing other widgets: they move with it; can be collapsed.",
  category: "Layout",
  size: { w: 12, h: 3 },
  minSize: { w: 3, h: 2 },
  container: true,
  defaults: () => ({ color: "", tint: true, collapsible: false, startCollapsed: false, widgets: [] }),
  fields: [
    { key: "color", label: "Color", kind: "color", help: "Title and border color. Default: neutral." },
    { key: "tint", label: "Tinted background", kind: "bool" },
    { key: "collapsible", label: "Collapsible", kind: "bool", help: "Adds an arrow in the title bar to hide the content (in the view, not while editing)." },
    { key: "startCollapsed", label: "Start collapsed", kind: "bool", showIf: (c) => !!c.collapsible },
  ],
  component: GroupWidget,
};

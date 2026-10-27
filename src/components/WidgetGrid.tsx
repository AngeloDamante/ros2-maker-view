// The grid of widgets of a page or of a group. Editor actions come from
// EditorContext so that groups (widgets containing a grid) can render nested
// grids with the same behaviour. Dropping a dragged widget over another grid
// moves it there: into a group, or out of it onto the page.

import { createContext, useContext, useMemo } from "react";
import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import type { VarValues } from "../lib/vars.ts";
import { GROUP_TYPE, groupHeight, isGroup } from "../lib/tree.ts";
import { GRID_ROW_HEIGHT, type WidgetDoc } from "../types.ts";
import { widgetDef } from "../widgets/index.ts";
import { WidgetFrame } from "./WidgetFrame.tsx";
import { paletteDragSize, takeDraggedType } from "./WidgetPalette.tsx";

export const GRID_MARGIN = 10;

export interface EditorApi {
  editing: boolean;
  vars: VarValues;
  selectedId: string | null;
  /** Groups collapsed by the user (run mode only). */
  isCollapsed: (id: string) => boolean;
  toggleCollapsed: (id: string) => void;
  configure: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  /** `container` is a group id, or null for the page. */
  layoutChanged: (container: string | null, layout: Layout) => void;
  dropNew: (container: string | null, type: string, item: LayoutItem, layout: Layout) => void;
  move: (id: string, target: string | null, x: number, y: number, targetCols: number) => void;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const e = useContext(EditorContext);
  if (!e) throw new Error("useEditor outside EditorContext");
  return e;
}

/** True when the page grid is shown as a single column (phones); nested grids follow it. */
const StackedContext = createContext(false);

interface GridTarget {
  id: string | null;
  cols: number;
  grid: Element;
}

/** The grid under the pointer, ignoring the dragged element itself. */
function gridAt(x: number, y: number, dragged: HTMLElement): GridTarget | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    if (dragged.contains(el)) continue;
    const c = el.closest<HTMLElement>("[data-grid-container]");
    if (!c || dragged.contains(c)) continue;
    const grid = c.querySelector(".react-grid-layout");
    if (!grid) continue;
    return { id: c.dataset.gridContainer === "page" ? null : c.dataset.gridContainer!, cols: Number(c.dataset.cols), grid };
  }
  return undefined;
}

/** Grid cell of a point (the top-left corner of the dropped widget). */
function cellAt(t: GridTarget, left: number, top: number): { x: number; y: number } {
  const r = t.grid.getBoundingClientRect();
  const colW = (r.width - (t.cols - 1) * GRID_MARGIN) / t.cols;
  return {
    x: Math.max(0, Math.round((left - r.left) / (colW + GRID_MARGIN))),
    y: Math.max(0, Math.round((top - r.top) / (GRID_ROW_HEIGHT + GRID_MARGIN))),
  };
}

export function WidgetGrid({ container, widgets, cols }: { container: string | null; widgets: WidgetDoc[]; cols: number }) {
  const editor = useEditor();
  const { editing } = editor;
  const parentStacked = useContext(StackedContext);
  const { width, containerRef, mounted } = useContainerWidth();
  // Phones: a single column in reading order instead of a squeezed grid.
  const stacked = container === null ? mounted && width < 700 && !editing : parentStacked;

  const layout = useMemo(
    () =>
      widgets.map((w) => {
        const def = widgetDef(w.type);
        const item: LayoutItem = { i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: def?.minSize?.w ?? 1, minH: def?.minSize?.h ?? 1 };
        if (isGroup(w)) {
          // a group's height follows its children; only its width is resizable
          item.h = !editing && editor.isCollapsed(w.id) ? 1 : groupHeight(w);
          item.minH = item.maxH = item.h;
          item.resizeHandles = ["e"];
        }
        return item;
      }),
    [widgets, editing, editor],
  );

  const frame = (w: WidgetDoc) => (
    <WidgetFrame
      widget={w}
      editing={editing}
      selected={editor.selectedId === w.id}
      vars={editor.vars}
      onConfigure={() => editor.configure(w.id)}
      onDuplicate={() => editor.duplicate(w.id)}
      onDelete={() => editor.remove(w.id)}
    />
  );

  return (
    <StackedContext.Provider value={stacked}>
      <div ref={containerRef} className="grid-wrap" data-grid-container={container ?? "page"} data-cols={cols}>
        {stacked ? (
          <div className="stack">
            {[...widgets]
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map((w) => (
                <div
                  key={w.id}
                  className="stack-item"
                  style={isGroup(w) ? undefined : { height: w.h * GRID_ROW_HEIGHT + (w.h - 1) * GRID_MARGIN }}
                >
                  {frame(w)}
                </div>
              ))}
          </div>
        ) : (
          mounted && (
            <ReactGridLayout
              layout={layout}
              width={width}
              autoSize
              gridConfig={{ cols, rowHeight: GRID_ROW_HEIGHT, margin: [GRID_MARGIN, GRID_MARGIN], containerPadding: [0, 0] }}
              dragConfig={{ enabled: editing, handle: ".wf-head, .wf-drag", cancel: ".wf-actions, .group-body" }}
              resizeConfig={{ enabled: editing, handles: ["se"] }}
              dropConfig={{
                enabled: editing,
                defaultItem: { w: 6, h: 4 },
                // groups cannot contain groups
                onDragOver: () => {
                  const size = paletteDragSize();
                  return container !== null && size && size.type === GROUP_TYPE ? false : size && { w: Math.min(size.w, cols), h: size.h };
                },
              }}
              onDrop={(l, item) => {
                const type = takeDraggedType();
                if (type && item) editor.dropNew(container, type, item, l.filter((x) => x.i !== item.i));
              }}
              onDragStop={(_l, _old, item, _ph, e, node) => {
                if (!item || !node || !("clientX" in e)) return;
                const ev = e as MouseEvent;
                const target = gridAt(ev.clientX, ev.clientY, node);
                if (!target || target.id === container) return;
                const r = node.getBoundingClientRect();
                const cell = cellAt(target, r.left, r.top);
                editor.move(item.i, target.id, cell.x, cell.y, target.cols);
              }}
              onLayoutChange={(l) => {
                if (editing) editor.layoutChanged(container, l);
              }}
            >
              {widgets.map((w) => (
                <div key={w.id}>{frame(w)}</div>
              ))}
            </ReactGridLayout>
          )
        )}
      </div>
    </StackedContext.Provider>
  );
}

// Widgets of a page form a two-level tree: page widgets, and the children of
// "group" widgets (stored in group.config.widgets). Pure helpers, shared by the
// editor and the tests.

import type { WidgetDoc } from "../types.ts";

export const GROUP_TYPE = "group";
/** Rows taken by a group's title bar; children start below it. */
export const GROUP_HEADER_ROWS = 1;
/** Minimum body height of a group, so that an empty group can receive drops. */
export const GROUP_MIN_BODY_ROWS = 2;

export function isGroup(w: WidgetDoc): boolean {
  return w.type === GROUP_TYPE;
}

export function childrenOf(w: WidgetDoc): WidgetDoc[] {
  return Array.isArray(w.config?.widgets) ? (w.config.widgets as WidgetDoc[]) : [];
}

export function bottomOf(widgets: WidgetDoc[]): number {
  return widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
}

/** Height (in rows) a group needs to show all its children. */
export function groupHeight(group: WidgetDoc): number {
  return GROUP_HEADER_ROWS + Math.max(GROUP_MIN_BODY_ROWS, bottomOf(childrenOf(group)));
}

function withChildren(group: WidgetDoc, children: WidgetDoc[]): WidgetDoc {
  const g = { ...group, config: { ...group.config, widgets: children } };
  return { ...g, h: groupHeight(g) };
}

/** The widget with this id and the id of the group containing it (null = page). */
export function findWidget(widgets: WidgetDoc[], id: string): { widget: WidgetDoc; parent: string | null } | undefined {
  for (const w of widgets) {
    if (w.id === id) return { widget: w, parent: null };
    if (isGroup(w)) {
      const c = childrenOf(w).find((x) => x.id === id);
      if (c) return { widget: c, parent: w.id };
    }
  }
  return undefined;
}

/** Applies `fn` to the widget list of a container (null = the page itself). */
export function mapContainer(widgets: WidgetDoc[], container: string | null, fn: (list: WidgetDoc[]) => WidgetDoc[]): WidgetDoc[] {
  if (container === null) return fn(widgets);
  return widgets.map((w) => (w.id === container && isGroup(w) ? withChildren(w, fn(childrenOf(w))) : w));
}

export function updateWidget(widgets: WidgetDoc[], id: string, fn: (w: WidgetDoc) => WidgetDoc): WidgetDoc[] {
  const found = findWidget(widgets, id);
  if (!found) return widgets;
  return mapContainer(widgets, found.parent, (list) => list.map((w) => (w.id === id ? fn(w) : w)));
}

export function removeWidget(widgets: WidgetDoc[], id: string): WidgetDoc[] {
  const found = findWidget(widgets, id);
  if (!found) return widgets;
  return mapContainer(widgets, found.parent, (list) => list.filter((w) => w.id !== id));
}

/**
 * Moves a widget to another container at (x, y), clamping its width to the
 * container's columns. Groups cannot be nested.
 */
export function moveWidget(widgets: WidgetDoc[], id: string, target: string | null, x: number, y: number, targetCols: number): WidgetDoc[] {
  const found = findWidget(widgets, id);
  if (!found || found.parent === target) return widgets;
  if (target !== null && (isGroup(found.widget) || target === id)) return widgets;
  const w = Math.max(1, Math.min(found.widget.w, targetCols));
  const moved: WidgetDoc = { ...found.widget, x: Math.max(0, Math.min(x, targetCols - w)), y: Math.max(0, y), w };
  return mapContainer(removeWidget(widgets, id), target, (list) => [...list, moved]);
}

/** Recomputes every group's height from its children. */
export function autoSizeGroups(widgets: WidgetDoc[]): WidgetDoc[] {
  let changed = false;
  const out = widgets.map((w) => {
    if (!isGroup(w)) return w;
    const h = groupHeight(w);
    if (h === w.h) return w;
    changed = true;
    return { ...w, h };
  });
  return changed ? out : widgets;
}

/** Fresh ids for a widget and, for a group, its children (used when duplicating). */
export function cloneWithNewIds(w: WidgetDoc, newId: () => string): WidgetDoc {
  const copy: WidgetDoc = { ...structuredClone(w), id: newId() };
  if (isGroup(copy)) copy.config.widgets = childrenOf(copy).map((c) => ({ ...c, id: newId() }));
  return copy;
}

export function countWidgets(widgets: WidgetDoc[]): number {
  return widgets.reduce((n, w) => n + 1 + (isGroup(w) ? childrenOf(w).length : 0), 0);
}

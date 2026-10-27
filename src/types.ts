import type { Variable } from "./lib/vars.ts";

/** A view as stored in views/<id>.json. The id is the file name, not a field. */
export interface ViewDoc {
  version: 1;
  title: string;
  description?: string;
  /** Default foxglove_bridge URL; when empty, ws://<page host>:8765 is used. */
  bridgeUrl?: string;
  variables?: Variable[];
  pages: Page[];
}

export interface Page {
  id: string;
  title: string;
  widgets: WidgetDoc[];
}

export interface WidgetDoc {
  id: string;
  type: string;
  title?: string;
  /** Grid position and size (24 columns). */
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, any>;
}

export interface ViewSummary {
  id: string;
  title: string;
  description?: string;
  pages: number;
  widgets: number;
  updated: string;
}

export const GRID_COLS = 24;
export const GRID_ROW_HEIGHT = 30;

export function newId(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function emptyView(title: string): ViewDoc {
  return { version: 1, title, pages: [{ id: newId("p"), title: "Main", widgets: [] }] };
}

/** Light validation/normalization of a document read from disk or imported. */
export function normalizeView(raw: any): ViewDoc {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.pages)) throw new Error("Not a view document (missing pages)");
  const pages: Page[] = raw.pages.map((p: any, i: number) => ({
    id: typeof p?.id === "string" && p.id ? p.id : newId("p"),
    title: typeof p?.title === "string" ? p.title : `Page ${i + 1}`,
    widgets: normalizeWidgets(p?.widgets, true),
  }));
  if (!pages.length) pages.push({ id: newId("p"), title: "Main", widgets: [] });
  return {
    ...raw,
    version: 1,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Untitled view",
    pages,
  };
}

/** Valid widgets of a list; group children are normalized too (groups are not nested). */
function normalizeWidgets(list: unknown, allowGroups: boolean): WidgetDoc[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((w: any) => w && typeof w.type === "string" && (allowGroups || w.type !== "group"))
    .map((w: any) => {
      const config = w.config && typeof w.config === "object" ? { ...w.config } : {};
      if (w.type === "group") config.widgets = normalizeWidgets(config.widgets, false);
      return {
        id: typeof w.id === "string" && w.id ? w.id : newId("w"),
        type: w.type,
        ...(typeof w.title === "string" ? { title: w.title } : {}),
        x: num(w.x, 0), y: num(w.y, 0), w: num(w.w, 6), h: num(w.h, 4),
        config,
      };
    });
}

function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

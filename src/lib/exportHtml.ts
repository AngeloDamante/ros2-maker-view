import { api } from "../api.ts";
import type { ViewDoc } from "../types.ts";
import { embedView, isTemplate, safeFileName, VIEW_SLOT_ID, type EmbeddedView } from "./embed.ts";

// The page's own HTML, captured when this module is evaluated (before React
// renders anything). In a production build or a standalone export it is the
// complete single-file app, so it can be re-exported without the server.
const TEMPLATE = "<!doctype html>\n" + document.documentElement.outerHTML;
const SELF_CONTAINED = isTemplate(TEMPLATE) && !document.querySelector('script[type="module"][src]');

/** The view embedded in a standalone export, if this page is one. */
export function embeddedView(): EmbeddedView | null {
  const el = document.getElementById(VIEW_SLOT_ID);
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent || "null");
    return data && typeof data === "object" && data.view ? data : null;
  } catch {
    return null;
  }
}

export async function buildStandaloneHtml(id: string, doc: ViewDoc): Promise<string> {
  if (SELF_CONTAINED) return embedView(TEMPLATE, { id, view: doc, exportedAt: new Date().toISOString() }, doc.title);
  return api.exportHtml(id, doc);
}

export function downloadText(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadStandalone(id: string, doc: ViewDoc) {
  downloadText(`${safeFileName(id)}.html`, await buildStandaloneHtml(id, doc), "text/html");
}

export function downloadJson(id: string, doc: ViewDoc) {
  downloadText(`${safeFileName(id)}.json`, JSON.stringify(doc, null, 2) + "\n", "application/json");
}

/** Reads a view from an imported .json file or a standalone .html export. */
export function parseImportedFile(name: string, text: string): { id?: string; doc: unknown } {
  if (/\.html?$/i.test(name) || text.trimStart().startsWith("<")) {
    const m = new RegExp(`<script id="${VIEW_SLOT_ID}" type="application/json">([\\s\\S]*?)</script>`).exec(text);
    const data = m ? JSON.parse(m[1]!) : null;
    if (!data?.view) throw new Error("This HTML file does not contain an exported view");
    return { id: data.id, doc: data.view };
  }
  return { doc: JSON.parse(text) };
}

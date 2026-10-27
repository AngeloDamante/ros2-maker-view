// Standalone export: the built app (dist/index.html) is a single file with an
// empty JSON slot; exporting a view fills the slot. Shared by the browser and
// the Node server/CLI, so it must stay dependency-free.

export const VIEW_SLOT_ID = "rmv-view";

const SLOT_RE = /<script id="rmv-view" type="application\/json">[\s\S]*?<\/script>/;
const TITLE_RE = /<title>[\s\S]*?<\/title>/;

export interface EmbeddedView {
  id: string;
  view: unknown;
  exportedAt?: string;
}

export function isTemplate(html: string): boolean {
  return SLOT_RE.test(html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function embedView(html: string, data: EmbeddedView, title?: string): string {
  if (!isTemplate(html)) throw new Error("The HTML template has no view slot (is it a build of this app?)");
  // "<" is escaped so that the JSON can never close the <script> element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  let out = html.replace(SLOT_RE, () => `<script id="${VIEW_SLOT_ID}" type="application/json">${json}</script>`);
  if (title) out = out.replace(TITLE_RE, () => `<title>${escapeHtml(title)}</title>`);
  return out;
}

export function safeFileName(s: string): string {
  return s.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "view";
}

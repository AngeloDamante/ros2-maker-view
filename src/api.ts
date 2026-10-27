import type { ViewDoc, ViewSummary } from "./types.ts";

export interface ServerInfo {
  readonly: boolean;
  version: string;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const type = res.headers.get("content-type") || "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  info: () => request<ServerInfo>("GET", "/api/info"),
  list: () => request<ViewSummary[]>("GET", "/api/views"),
  get: (id: string) => request<ViewDoc>("GET", `/api/views/${enc(id)}`),
  save: (id: string, doc: ViewDoc) => request<{ ok: true }>("PUT", `/api/views/${enc(id)}`, doc),
  remove: (id: string) => request<{ ok: true }>("DELETE", `/api/views/${enc(id)}`),
  /** Standalone HTML built by the server from dist/index.html (used in dev mode). */
  exportHtml: (id: string, doc: ViewDoc) => request<string>("POST", `/api/export/${enc(id)}`, doc),
  exportUrl: (id: string) => `/api/views/${enc(id)}/export`,
};

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "view"
  );
}

export const VIEW_ID_RE = /^[A-Za-z0-9][\w-]{0,63}$/;

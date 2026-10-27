// HTTP server: serves the web app and the views API.
//
//   node server/index.ts [--port 8080] [--host 0.0.0.0] [--views ./views] [--readonly] [--dev]
//
// --dev runs Vite in middleware mode (hot reload, no build needed).

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { embedView } from "../src/lib/embed.ts";
import { HttpError, ViewStore } from "./views.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: process.env.PORT || "8080" },
    host: { type: "string", default: process.env.HOST || "0.0.0.0" },
    views: { type: "string", default: process.env.RMV_VIEWS_DIR || path.join(ROOT, "views") },
    readonly: { type: "boolean", default: process.env.RMV_READONLY === "1" },
    dev: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`Usage: node server/index.ts [options]
  --port <n>      HTTP port (default 8080, env PORT)
  --host <addr>   bind address (default 0.0.0.0 = reachable from the LAN, env HOST)
  --views <dir>   views directory (default ./views, env RMV_VIEWS_DIR)
  --readonly      refuse to create, modify or delete views (env RMV_READONLY=1)
  --dev           development mode with Vite hot reload`);
  process.exit(0);
}

const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
const store = new ViewStore(path.resolve(args.views!));
await store.init();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 10 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

async function template(): Promise<string> {
  try {
    return await fs.readFile(path.join(DIST, "index.html"), "utf8");
  } catch {
    throw new HttpError(409, "Standalone export needs a production build: run `npm run build` first");
  }
}

function sendHtmlDownload(res: http.ServerResponse, id: string, html: string) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `attachment; filename="${id}.html"`,
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function checkWritable() {
  if (args.readonly) throw new HttpError(403, "The server is read-only (--readonly)");
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const p = url.pathname;
  const method = req.method || "GET";
  if (p === "/api/info" && method === "GET") return sendJson(res, 200, { readonly: args.readonly, version: pkg.version });
  if (p === "/api/views" && method === "GET") return sendJson(res, 200, await store.list());

  let m = /^\/api\/views\/([^/]+)$/.exec(p);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (method === "GET") return sendJson(res, 200, await store.get(id));
    if (method === "PUT") {
      checkWritable();
      await store.save(id, await readBody(req));
      console.log(`saved views/${id}.json`);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "DELETE") {
      checkWritable();
      await store.remove(id);
      console.log(`deleted views/${id}.json`);
      return sendJson(res, 200, { ok: true });
    }
    throw new HttpError(405, "Method not allowed");
  }

  // GET  /api/views/<id>/export -> standalone HTML of the saved view
  // POST /api/export/<id>       -> standalone HTML of the posted (possibly unsaved) view
  m = /^\/api\/views\/([^/]+)\/export$/.exec(p);
  if (m && method === "GET") {
    const id = decodeURIComponent(m[1]!);
    const doc = await store.get(id);
    return sendHtmlDownload(res, id, embedView(await template(), { id, view: doc, exportedAt: new Date().toISOString() }, doc.title));
  }
  m = /^\/api\/export\/([^/]+)$/.exec(p);
  if (m && method === "POST") {
    const id = decodeURIComponent(m[1]!);
    const doc = (await readBody(req)) as { title?: string };
    return sendHtmlDownload(res, id, embedView(await template(), { id, view: doc, exportedAt: new Date().toISOString() }, doc.title));
  }
  throw new HttpError(404, `No API route ${method} ${p}`);
}

async function serveStatic(res: http.ServerResponse, url: URL) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || !path.extname(rel)) rel = "/index.html";
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST + path.sep)) throw new HttpError(403, "Forbidden");
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    if (rel === "/index.html") {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("The app is not built yet: run `npm run build` (or start with `npm run dev`).\n");
      return;
    }
    throw new HttpError(404, "Not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(data);
}

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
let viteMiddleware: Middleware | undefined;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (viteMiddleware) return viteMiddleware(req, res, () => sendJson(res, 404, { error: "Not found" }));
    return await serveStatic(res, url);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: (e as Error).message });
    else res.end();
  }
});

if (args.dev) {
  const { createServer } = await import("vite");
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
  viteMiddleware = vite.middlewares;
}

const port = Number(args.port);
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${port} is already in use (another instance running? use --port)` : e.message);
  process.exit(1);
});
server.listen(port, args.host, () => {
  const urls = [`http://localhost:${port}/`];
  if (args.host === "0.0.0.0" || args.host === "::")
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || []) if (a.family === "IPv4" && !a.internal) urls.push(`http://${a.address}:${port}/`);
  if (urls.length > 5) urls.splice(5, urls.length - 5, `  … (${urls.length - 5} more addresses)`);
  console.log(`ROS2 Maker View ${pkg.version}${args.dev ? " (dev)" : ""}${args.readonly ? " (read-only)" : ""}`);
  console.log(`views: ${store.dir}`);
  for (const u of urls) console.log(`  ${u}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));

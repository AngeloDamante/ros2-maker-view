// Exports a view as a standalone HTML file (needs `npm run build` first).
//
//   node server/export.ts <view-id | path/to/view.json> [-o out.html] [--views ./views]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { embedView, safeFileName } from "../src/lib/embed.ts";
import { normalizeView } from "../src/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", short: "o" },
    views: { type: "string", default: process.env.RMV_VIEWS_DIR || path.join(ROOT, "views") },
  },
});

const target = positionals[0];
if (!target) {
  console.error("Usage: npm run export -- <view-id | view.json> [-o out.html]");
  process.exit(2);
}

const file = target.endsWith(".json") ? path.resolve(target) : path.join(path.resolve(args.views!), `${target}.json`);
const id = path.basename(file, ".json");
let html: string;
try {
  html = await fs.readFile(path.join(ROOT, "dist", "index.html"), "utf8");
} catch {
  console.error("dist/index.html not found: run `npm run build` first");
  process.exit(1);
}
const doc = normalizeView(JSON.parse(await fs.readFile(file, "utf8")));
const out = path.resolve(args.out || path.join(ROOT, "exports", `${safeFileName(id)}.html`));
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, embedView(html, { id, view: doc, exportedAt: new Date().toISOString() }, doc.title));
console.log(`${path.relative(process.cwd(), out) || out}  (${doc.title}: ${doc.pages.length} pages)`);

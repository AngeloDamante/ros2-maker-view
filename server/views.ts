// File storage of views: one pretty-printed JSON file per view (views/<id>.json),
// so they can be reviewed and versioned with git.

import fs from "node:fs/promises";
import path from "node:path";
import { normalizeView, type ViewDoc, type ViewSummary } from "../src/types.ts";
import { countWidgets } from "../src/lib/tree.ts";

export const VIEW_ID_RE = /^[A-Za-z0-9][\w-]{0,63}$/;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ViewStore {
  dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private file(id: string): string {
    if (!VIEW_ID_RE.test(id)) throw new HttpError(400, `Invalid view id "${id}" (letters, digits, _ and -, max 64)`);
    return path.join(this.dir, `${id}.json`);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<ViewSummary[]> {
    const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith(".json") && VIEW_ID_RE.test(n.slice(0, -5)));
    const out: ViewSummary[] = [];
    for (const name of names) {
      const file = path.join(this.dir, name);
      try {
        const [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
        const doc = normalizeView(JSON.parse(text));
        out.push({
          id: name.slice(0, -5),
          title: doc.title,
          description: doc.description,
          pages: doc.pages.length,
          widgets: doc.pages.reduce((n, p) => n + countWidgets(p.widgets), 0),
          updated: stat.mtime.toISOString(),
        });
      } catch (e) {
        console.warn(`Skipping ${file}: ${(e as Error).message}`);
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<ViewDoc> {
    const file = this.file(id);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      throw new HttpError(404, `View "${id}" not found`);
    }
    try {
      return normalizeView(JSON.parse(text));
    } catch (e) {
      throw new HttpError(500, `views/${id}.json is not a valid view: ${(e as Error).message}`);
    }
  }

  async save(id: string, raw: unknown): Promise<void> {
    const file = this.file(id);
    let doc: ViewDoc;
    try {
      doc = normalizeView(raw);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    // Write to a temporary file then rename: a crash never leaves half a file.
    const tmp = path.join(this.dir, `.${id}.json.${process.pid}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
    await fs.rename(tmp, file);
  }

  async remove(id: string): Promise<void> {
    try {
      await fs.unlink(this.file(id));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(404, `View "${id}" not found`);
    }
  }
}
